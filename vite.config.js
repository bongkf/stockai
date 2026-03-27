import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";
const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote";
const STOOQ_QUOTE_URL = "https://stooq.com/q/l/";

const SHELL_SEARCH_FALLBACK = [
  { symbol: "SHELL.AS", name: "Shell plc", type: "Equity" },
  { symbol: "SHEL", name: "Shell plc", type: "Equity" }
];

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function normalizeTickerInput(input) {
  const raw = String(input || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!raw) return "";

  if (/^[A-Z0-9]{1,10}\s+US$/.test(raw)) {
    return raw.split(" ")[0];
  }

  if (/^[A-Z0-9]{1,10}\.US$/.test(raw)) {
    return raw.replace(/\.US$/, "");
  }

  return raw;
}

function quoteCandidates(symbol) {
  const normalized = normalizeTickerInput(symbol);
  if (!normalized) return ["SHELL.AS", "SHEL"];

  if (normalized === "SHELL.AS" || normalized === "SHEL") {
    return ["SHELL.AS", "SHEL"];
  }

  return [normalized];
}

function stooqCandidates(symbol) {
  const normalized = normalizeTickerInput(symbol);
  if (!normalized || normalized === "SHELL.AS") {
    return ["shell.as", "r6c0.de", "shel.us"];
  }
  if (normalized === "SHEL") {
    return ["shel.us"];
  }
  return [normalized.toLowerCase()];
}

function detectCurrencyFromSymbol(symbol) {
  const upper = String(symbol || "").toUpperCase();
  if (upper.endsWith(".US")) return "USD";
  if (upper.endsWith(".L")) return "GBP";
  if (upper.endsWith(".AS") || upper.endsWith(".DE") || upper.endsWith(".F")) return "EUR";
  return "USD";
}

async function fetchYahooSearch(term) {
  const endpoint = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(term)}&quotesCount=12&newsCount=0`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Ticker lookup failed");
  const payload = await response.json();
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];

  return quotes
    .filter((row) => row?.symbol && row?.shortname)
    .map((row) => ({
      symbol: String(row.symbol).toUpperCase(),
      name: row.shortname,
      type: row.quoteType || "Equity"
    }));
}

async function fetchYahooQuote(symbol) {
  const symbols = quoteCandidates(symbol);
  const endpoint = `${YAHOO_QUOTE_URL}?symbols=${encodeURIComponent(symbols.join(","))}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error("Quote lookup failed");

  const payload = await response.json();
  const results = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];

  const quote = results.find((row) => Number.isFinite(row?.regularMarketPrice));
  if (!quote) throw new Error("Quote unavailable");

  return {
    ticker: String(quote.symbol || symbols[0]).toUpperCase(),
    price: Number(quote.regularMarketPrice),
    change: Number(quote.regularMarketChange ?? 0),
    change_pct: Number(quote.regularMarketChangePercent ?? 0),
    currency: String(quote.currency || "USD").toUpperCase()
  };
}

async function fetchStooqQuote(symbol) {
  const candidates = stooqCandidates(symbol);

  for (const candidate of candidates) {
    const endpoint = `${STOOQ_QUOTE_URL}?s=${encodeURIComponent(candidate)}&i=d`;
    const response = await fetch(endpoint);
    if (!response.ok) continue;

    const csv = await response.text();
    const line = String(csv || "").trim();
    if (!line || !line.includes(",")) continue;

    const parts = line.split(",").map((v) => v.trim());
    if (parts.length < 7) continue;

    const sourceSymbol = parts[0];
    const open = Number(parts[3]);
    const close = Number(parts[6]);
    if (!Number.isFinite(close) || close <= 0) continue;

    const change = Number.isFinite(open) && open > 0 ? close - open : 0;
    const changePct = Number.isFinite(open) && open > 0 ? (change / open) * 100 : 0;

    const requested = normalizeTickerInput(symbol);
    const shellAlias = requested === "SHELL.AS" || requested === "SHEL";

    return {
      ticker: shellAlias ? requested : String(sourceSymbol || requested).toUpperCase(),
      price: close,
      change,
      change_pct: changePct,
      currency: detectCurrencyFromSymbol(sourceSymbol)
    };
  }

  throw new Error("Quote unavailable");
}

function mockApiPlugin() {
  return {
    name: "market-data-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");

        if (url.pathname === "/api/search") {
          const q = normalizeTickerInput(url.searchParams.get("q") || "");
          if (!q) {
            sendJson(res, 200, []);
            return;
          }

          try {
            const remoteResults = await fetchYahooSearch(q);

            if (q.includes("SHELL") || q.includes("SHEL")) {
              const merged = [...SHELL_SEARCH_FALLBACK, ...remoteResults];
              const seen = new Set();
              const deduped = merged.filter((row) => {
                const key = row.symbol;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              sendJson(res, 200, deduped.slice(0, 12));
              return;
            }

            sendJson(res, 200, remoteResults.slice(0, 12));
          } catch {
            if (q.includes("SHELL") || q.includes("SHEL")) {
              sendJson(res, 200, SHELL_SEARCH_FALLBACK);
              return;
            }
            sendJson(res, 200, []);
          }
          return;
        }

        if (url.pathname.startsWith("/quote/")) {
          const symbol = normalizeTickerInput(decodeURIComponent(url.pathname.replace("/quote/", "")));
          if (!symbol) {
            sendJson(res, 400, { error: "Missing ticker" });
            return;
          }

          try {
            let quote;
            try {
              quote = await fetchYahooQuote(symbol);
            } catch {
              quote = await fetchStooqQuote(symbol);
            }
            sendJson(res, 200, quote);
          } catch (error) {
            sendJson(res, 502, { error: error?.message || "Quote unavailable" });
          }
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), mockApiPlugin()]
});
