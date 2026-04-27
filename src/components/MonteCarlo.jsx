import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SCENARIOS = {
  escalation: {
    label: "ESCALATION",
    sublabel: "Hormuz Blockade Deepens · Oil $120+",
    annualDrift: -0.18,
    annualVol: 0.52,
    color: "#b42318",
    glow: "rgba(180,35,24,0.3)",
    accent: "#dc2626",
    description:
      "Strait of Hormuz remains blocked, Iran rejects ceasefire, US ground troops deployed. Brent crude $120+, European fuel rationing expands.",
    keyRisks: ["Ras Laffan offline", "EU LNG rationing", "Kharg Island strike", "Fed holds hawkish"],
  },
  base: {
    label: "BASE CASE",
    sublabel: "Stalemate · Oil $100–110",
    annualDrift: 0.08,
    annualVol: 0.38,
    color: "#0b4fa8",
    glow: "rgba(11,79,168,0.35)",
    accent: "#1d6fd9",
    description:
      "Conflict grinds on at current intensity. Partial Hormuz disruption persists. Elevated LNG margins support upside while operational risk caps valuation expansion.",
    keyRisks: ["Vol regime stays elevated", "EUR/USD headwind", "Refinery margin compression", "Capex freeze"],
  },
  deescalation: {
    label: "DE-ESCALATION",
    sublabel: "Ceasefire Signals · Oil $75–85",
    annualDrift: 0.32,
    annualVol: 0.28,
    color: "#0a7a2f",
    glow: "rgba(10,122,47,0.32)",
    accent: "#149e42",
    description:
      "US-brokered ceasefire. Hormuz reopens within 2 weeks. Risk premium fades in commodities while equities re-rate on lower geopolitical stress.",
    keyRisks: ["LNG margin compression", "Rapid oil normalization", "FX reversal", "Position unwind"],
  },
};

function runMonteCarlo(startPrice, annualDrift, annualVol, days, numPaths) {
  const dt = 1 / 252;
  const drift = (annualDrift - 0.5 * annualVol * annualVol) * dt;
  const diffusion = annualVol * Math.sqrt(dt);
  const paths = [];

  for (let p = 0; p < numPaths; p += 1) {
    const path = [startPrice];
    let price = startPrice;
    for (let d = 0; d < days; d += 1) {
      const z = boxMuller();
      price = price * Math.exp(drift + diffusion * z);
      path.push(+price.toFixed(3));
    }
    paths.push(path);
  }

  return paths;
}

function boxMuller() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function computeStats(paths, startPrice) {
  const finals = paths.map((path) => path[path.length - 1]);
  finals.sort((a, b) => a - b);
  const n = finals.length;

  const mean = finals.reduce((sum, v) => sum + v, 0) / n;
  const variance = finals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const p10 = finals[Math.floor(n * 0.1)];
  const p25 = finals[Math.floor(n * 0.25)];
  const p50 = finals[Math.floor(n * 0.5)];
  const p75 = finals[Math.floor(n * 0.75)];
  const p90 = finals[Math.floor(n * 0.9)];
  const pAbove = (finals.filter((v) => v > startPrice).length / n) * 100;

  const maxDrawdowns = paths.map((path) => {
    let peak = path[0];
    let maxDD = 0;
    path.forEach((price) => {
      if (price > peak) peak = price;
      const drawdown = (peak - price) / peak;
      if (drawdown > maxDD) maxDD = drawdown;
    });
    return maxDD;
  });

  const avgMaxDD = maxDrawdowns.reduce((sum, v) => sum + v, 0) / n;
  return { mean, stdDev, p10, p25, p50, p75, p90, pAbove, avgMaxDD };
}

function buildHistogram(paths, bins = 30) {
  const finals = paths.map((path) => path[path.length - 1]);
  const min = Math.min(...finals);
  const max = Math.max(...finals);
  const width = (max - min) / bins || 1;

  const hist = Array.from({ length: bins }, (_, i) => ({
    price: +(min + i * width + width / 2).toFixed(2),
    count: 0,
  }));

  finals.forEach((value) => {
    const idx = Math.min(Math.floor((value - min) / width), bins - 1);
    hist[idx].count += 1;
  });

  return hist;
}

function buildPercentileBand(paths, days) {
  const data = [];
  for (let d = 0; d <= days; d += 1) {
    const vals = paths.map((path) => path[d]).sort((a, b) => a - b);
    const n = vals.length;
    data.push({
      day: d,
      p10: vals[Math.floor(n * 0.1)],
      p25: vals[Math.floor(n * 0.25)],
      p50: vals[Math.floor(n * 0.5)],
      p75: vals[Math.floor(n * 0.75)],
      p90: vals[Math.floor(n * 0.9)],
    });
  }
  return data;
}

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "--");
const fmtPct = (n) => `${n >= 0 ? "+" : ""}${fmt(n * 100, 1)}%`;
const todayISO = new Date().toISOString().slice(0, 10);

function normalizeTickerInput(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!raw) return "";
  if (/^[A-Z0-9]{1,10}\s+US$/.test(raw)) return raw.split(" ")[0];
  if (/^[A-Z0-9]{1,10}\.US$/.test(raw)) return raw.replace(/\.US$/, "");
  return raw;
}

function formatPriceByCurrency(value, currency) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";

  const ccy = String(currency || "USD").toUpperCase();
  const symbolMap = {
    USD: "$",
    EUR: "EUR ",
    GBP: "GBP ",
  };
  const prefix = symbolMap[ccy] || `${ccy} `;
  return `${prefix}${n.toFixed(2)}`;
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">Day {label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ color: entry.color || "#0b4fa8" }}>
          {entry.name}: {fmt(entry.value)}
        </div>
      ))}
    </div>
  );
}

function AllScenariosCompare({ startPrice, days, numPaths }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const results = {};
    Object.entries(SCENARIOS).forEach(([key, sc]) => {
      const paths = runMonteCarlo(startPrice, sc.annualDrift, sc.annualVol, days, numPaths);
      results[key] = buildPercentileBand(paths, days);
    });

    const step = Math.max(1, Math.floor(days / 60));
    const merged = results.base
      .filter((_, i) => i % step === 0 || i === days)
      .map((row) => ({
        day: row.day,
        esc_p50: results.escalation[row.day]?.p50,
        esc_p10: results.escalation[row.day]?.p10,
        esc_p90: results.escalation[row.day]?.p90,
        base_p50: results.base[row.day]?.p50,
        deesc_p50: results.deescalation[row.day]?.p50,
        deesc_p10: results.deescalation[row.day]?.p10,
        deesc_p90: results.deescalation[row.day]?.p90,
      }));

    setData(merged);
  }, [startPrice, days, numPaths]);

  if (!data) {
    return <div className="chart-shell chart-empty">Computing all scenarios...</div>;
  }

  return (
    <div className="chart-shell">
      <div className="chart-title">Scenario Comparison · Median Paths with P10-P90 Bands</div>
      <ResponsiveContainer width="100%" height={324}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid stroke="rgba(0, 45, 114, 0.14)" strokeDasharray="3 3" />
          <XAxis dataKey="day" stroke="#6b7280" tick={{ fill: "#475467", fontSize: 11 }} />
          <YAxis
            stroke="#6b7280"
            tick={{ fill: "#475467", fontSize: 11 }}
            tickFormatter={(v) => `$${v.toFixed(1)}`}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid #dbe5f4", borderRadius: 6, fontSize: 11 }}
            formatter={(val, name) => [`$${val?.toFixed(2)}`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#344054" }} />
          <ReferenceLine y={startPrice} stroke="#1d4ed8" strokeDasharray="5 3" strokeOpacity={0.6} />

          <Area type="monotone" dataKey="esc_p90" stroke="none" fill="#b42318" fillOpacity={0.1} legendType="none" />
          <Area type="monotone" dataKey="esc_p10" stroke="none" fill="#ffffff" fillOpacity={1} legendType="none" />

          <Area type="monotone" dataKey="deesc_p90" stroke="none" fill="#0a7a2f" fillOpacity={0.1} legendType="none" />
          <Area type="monotone" dataKey="deesc_p10" stroke="none" fill="#ffffff" fillOpacity={1} legendType="none" />

          <Line type="monotone" dataKey="esc_p50" stroke="#b42318" strokeWidth={2} dot={false} name="Escalation (P50)" />
          <Line type="monotone" dataKey="base_p50" stroke="#0b4fa8" strokeWidth={2.5} dot={false} name="Base Case (P50)" />
          <Line type="monotone" dataKey="deesc_p50" stroke="#0a7a2f" strokeWidth={2} dot={false} name="De-escalation (P50)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MainApp() {
  const [ticker, setTicker] = useState("SHELL.AS");
  const [inputTicker, setInputTicker] = useState("SHELL.AS");
  const [startPrice, setStartPrice] = useState(29.5);
  const [inputPrice, setInputPrice] = useState("29.50");
  const [anchorDate, setAnchorDate] = useState("");
  const [isTickerExpanded, setIsTickerExpanded] = useState(false);

  const [scenario, setScenario] = useState("base");
  const [days, setDays] = useState(90);
  const [numPaths, setNumPaths] = useState(500);
  const [displayPaths, setDisplayPaths] = useState(30);
  const [activeTab, setActiveTab] = useState("paths");

  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);

  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [acHighlightIdx, setAcHighlightIdx] = useState(-1);

  const [quoteState, setQuoteState] = useState({
    symbol: "--",
    priceText: "--",
    changeText: "--",
    changeClass: "neutral",
    updatedText: "No quote loaded",
    isLoading: false,
    error: "",
  });

  const appRef = useRef(null);
  const searchSeqRef = useRef(0);
  const quoteSeqRef = useRef(0);
  const quoteDebounceRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const didLoadDefaultQuoteRef = useRef(false);

  const sc = SCENARIOS[scenario];

  const runSimulation = useCallback(
    (priceToUse = startPrice) => {
      setIsRunning(true);
      window.setTimeout(() => {
        const allPaths = runMonteCarlo(priceToUse, sc.annualDrift, sc.annualVol, days, numPaths);
        const stats = computeStats(allPaths, priceToUse);
        const hist = buildHistogram(allPaths);
        const band = buildPercentileBand(allPaths, days);

        const samplePaths = [];
        const step = Math.max(1, Math.floor(numPaths / displayPaths));
        for (let i = 0; i < numPaths; i += step) {
          samplePaths.push(allPaths[i]);
          if (samplePaths.length >= displayPaths) break;
        }

        setResults({
          allPaths,
          paths: samplePaths,
          stats,
          hist,
          band,
        });
        setIsRunning(false);
      }, 60);
    },
    [days, displayPaths, numPaths, sc.annualDrift, sc.annualVol, startPrice]
  );

  useEffect(() => {
    runSimulation();
  }, [scenario, days, numPaths, runSimulation]);

  useEffect(() => {
    const term = inputTicker.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      setSearchError("");
      setSearchLoading(false);
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(async () => {
      const reqId = ++searchSeqRef.current;
      setSearchLoading(true);
      setSearchError("");

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error("Ticker lookup failed");
        const payload = await res.json();
        const data = Array.isArray(payload) ? payload : payload.results || [];

        if (reqId !== searchSeqRef.current) return;

        setSearchResults(data.slice(0, 12));
        setShowSearchResults(data.length > 0);
        setAcHighlightIdx(-1);
      } catch (error) {
        if (reqId !== searchSeqRef.current) return;
        setSearchResults([]);
        setShowSearchResults(false);
        setSearchError(error?.message || "Search unavailable");
      } finally {
        if (reqId === searchSeqRef.current) setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [inputTicker]);

  const loadQuoteForTicker = useCallback(
    async (symbol, options = {}) => {
      const raw = normalizeTickerInput(symbol);
      const requestedAnchorDate = String(options.anchorDate ?? anchorDate).trim();
      const tickerPattern = /^[A-Z0-9]{1,10}(?:[.-][A-Z0-9]{1,10}){0,2}$/;
      if (!tickerPattern.test(raw)) {
        setQuoteState((prev) => ({
          ...prev,
          error: "Enter a valid ticker symbol",
        }));
        return;
      }

      const reqId = ++quoteSeqRef.current;
      setQuoteState((prev) => ({ ...prev, isLoading: true, error: "" }));

      try {
        const query = requestedAnchorDate ? `?date=${encodeURIComponent(requestedAnchorDate)}` : "";
        const res = await fetch(`/quote/${encodeURIComponent(raw)}${query}`);
        if (!res.ok) throw new Error("Quote lookup failed");
        const quote = await res.json();

        if (reqId !== quoteSeqRef.current) return;

        const activeTicker = String(quote.ticker || raw).trim().toUpperCase();
        const price = Number(quote.price);
        const change = Number(quote.change);
        const changePct = Number(quote.change_pct);
        const sign = change > 0 ? "+" : "";

        setTicker(activeTicker);
        setInputTicker(activeTicker);

        if (Number.isFinite(price) && price > 0) {
          setStartPrice(price);
          setInputPrice(price.toFixed(2));
          runSimulation(price);
        }

        setQuoteState({
          symbol: activeTicker,
          priceText: formatPriceByCurrency(price, quote.currency),
          changeText: Number.isFinite(change)
            ? `${sign}${change.toFixed(2)} (${sign}${(Number.isFinite(changePct) ? changePct : 0).toFixed(2)}%)`
            : "--",
          changeClass: change > 0 ? "positive" : change < 0 ? "negative" : "neutral",
          updatedText: quote?.asof_date
            ? `Close on ${quote.asof_date}${quote.requested_date && quote.requested_date !== quote.asof_date ? ` (nearest to ${quote.requested_date})` : ""}`
            : "Updated just now",
          isLoading: false,
          error: "",
        });
      } catch (error) {
        if (reqId !== quoteSeqRef.current) return;
        setQuoteState((prev) => ({
          ...prev,
          isLoading: false,
          error: error?.message || "Quote unavailable",
          updatedText: "Quote unavailable",
        }));
      }
    },
    [anchorDate, runSimulation]
  );

  useEffect(() => {
    if (didLoadDefaultQuoteRef.current) return;
    didLoadDefaultQuoteRef.current = true;
    loadQuoteForTicker("SHELL.AS");
  }, [loadQuoteForTicker]);

  const selectSuggestion = useCallback(
    async (symbol) => {
      setInputTicker(symbol);
      setShowSearchResults(false);
      setSearchResults([]);
      await loadQuoteForTicker(symbol);
    },
    [loadQuoteForTicker]
  );

  useEffect(() => {
    const onGlobalClick = (event) => {
      if (!appRef.current) return;
      if (!appRef.current.contains(event.target)) return;
      const wrapper = appRef.current.querySelector(".ticker-picker");
      if (!wrapper?.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("click", onGlobalClick);
    return () => document.removeEventListener("click", onGlobalClick);
  }, []);

  const runButtonClick = useCallback(() => {
    const manualPrice = Number.parseFloat(inputPrice);
    const normalizedTicker = normalizeTickerInput(inputTicker);
    const normalizedAnchorDate = String(anchorDate || "").trim();

    if (normalizedTicker) {
      setTicker(normalizedTicker);
      setInputTicker(normalizedTicker);
    }

    if (Number.isFinite(manualPrice) && manualPrice > 0) {
      setStartPrice(manualPrice);
      runSimulation(manualPrice);
    } else {
      runSimulation();
    }

    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    quoteDebounceRef.current = window.setTimeout(() => {
      loadQuoteForTicker(normalizedTicker || ticker, { anchorDate: normalizedAnchorDate });
    }, 200);
  }, [anchorDate, inputPrice, inputTicker, loadQuoteForTicker, runSimulation, ticker]);

  const pathData = useMemo(() => {
    if (!results) return [];
    return Array.from({ length: days + 1 }, (_, day) => {
      const row = { day };
      results.paths.forEach((path, idx) => {
        row[`p${idx}`] = path[day];
      });
      return row;
    });
  }, [days, results]);

  const sampledPathData = useMemo(
    () => pathData.filter((_, i) => i % Math.max(1, Math.floor(days / 60)) === 0 || i === days),
    [days, pathData]
  );

  const bandData = useMemo(
    () => (results?.band || []).filter((_, i) => i % Math.max(1, Math.floor(days / 80)) === 0 || i === days),
    [days, results]
  );

  return (
    <div ref={appRef} className="wrapper">
      {/* The rest of the UI is intentionally lengthy; styles moved to src/styles.css */}
      <div className="mc-content">Monte Carlo component (UI omitted in this copy for brevity)</div>
    </div>
  );
}
