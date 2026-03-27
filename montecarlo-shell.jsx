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
    async (symbol) => {
      const raw = normalizeTickerInput(symbol);
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
        const res = await fetch(`/quote/${encodeURIComponent(raw)}`);
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
          updatedText: "Updated just now",
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
    [runSimulation]
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
      loadQuoteForTicker(normalizedTicker || ticker);
    }, 200);
  }, [inputPrice, inputTicker, loadQuoteForTicker, runSimulation, ticker]);

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
      <style>{`
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          background-color: #f0f2f5;
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .wrapper {
          min-height: 100vh;
          width: 100%;
          background: linear-gradient(180deg, #f7f9fc 0%, #edf2f9 100%);
          color: #101828;
          display: flex;
          flex-direction: column;
        }
        .header-section {
          background: #ffffff;
          padding: 10px 18px;
          border-bottom: 3px solid #002d72;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .header-top {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 7px;
        }
        .header-brand {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .header-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          background: #002d72;
        }
        .header-title {
          margin: 0;
          color: #002d72;
          font-size: 1.1rem;
        }
        .header-subtitle {
          color: #475467;
          font-size: 0.76rem;
        }
        .header-live {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #667085;
          font-size: 0.82rem;
        }
        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          animation: pulse 2s infinite;
        }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }

        .page-body {
          padding: 10px 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ticker-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 6px;
          padding: 5px 7px;
          border: 1px solid #dbe5f4;
          border-radius: 8px;
          background: linear-gradient(90deg, #f3f7ff 0%, #ffffff 100%);
          min-height: 32px;
        }
        .ticker-summary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
          font-size: 0.81rem;
        }
        .toggle-ticker-btn {
          min-height: 30px;
          border: 1px solid #c9d6ea;
          border-radius: 7px;
          background: #ffffff;
          color: #334155;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 0 10px;
          cursor: pointer;
          white-space: nowrap;
        }

        .search-box {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 7px 9px;
          align-items: end;
        }
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .input-group label {
          font-size: 0.71rem;
          font-weight: 700;
          color: #475467;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .ticker-group { grid-column: span 4; }
        .price-group { grid-column: span 2; }
        .horizon-group { grid-column: span 2; }
        .paths-group { grid-column: span 2; }
        .action-group { grid-column: span 2; }

        .search-box.compact .price-group,
        .search-box.compact .horizon-group,
        .search-box.compact .paths-group,
        .search-box.compact .action-group {
          grid-column: span 3;
        }

        .input-field {
          width: 100%;
          min-height: 32px;
          border: 1px solid #d0d5dd;
          border-radius: 8px;
          background: #ffffff;
          color: #101828;
          padding: 6px 9px;
          font-size: 0.88rem;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .input-field:focus {
          border-color: #1d6fd9;
          box-shadow: 0 0 0 3px rgba(29,111,217,0.15);
        }
        .ticker-picker {
          position: relative;
        }
        .ticker-autocomplete {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          width: min(440px, 94vw);
          max-height: 220px;
          overflow-y: auto;
          border: 1px solid #dbe5f4;
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
          z-index: 50;
        }
        .ac-item {
          padding: 8px 10px;
          border-bottom: 1px solid #eef2f6;
          display: flex;
          align-items: baseline;
          gap: 7px;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .ac-item:last-child { border-bottom: none; }
        .ac-item strong { color: #002d72; }
        .ac-item .ac-name { color: #475467; }
        .ac-item .ac-type {
          margin-left: auto;
          color: #667085;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ac-item-active,
        .ac-item:hover {
          background: #f3f7ff;
        }
        .search-meta {
          margin-top: 3px;
          font-size: 0.76rem;
          color: #667085;
        }
        .search-meta.error { color: #b42318; }

        .run-btn {
          min-height: 32px;
          border: none;
          border-radius: 8px;
          background: #003f99;
          color: #ffffff;
          font-weight: 700;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: opacity .15s, transform .15s;
        }
        .run-btn:hover {
          opacity: .95;
          transform: translateY(-1px);
        }

        .ticker-quote {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 6px;
          padding: 6px 8px;
          border-radius: 8px;
          background: linear-gradient(90deg, #f3f7ff 0%, #ffffff 100%);
          border: 1px solid #dbe5f4;
          font-size: 0.85rem;
          min-height: 34px;
        }
        #quote-symbol {
          font-weight: 700;
          color: #002d72;
        }
        #quote-price {
          font-weight: 700;
        }
        .positive { color: #0a7a2f; }
        .negative { color: #b42318; }
        .neutral { color: #475467; }
        .quote-flag {
          background: #e2e8f0;
          color: #1f2937;
          border-radius: 999px;
          font-size: 0.72rem;
          padding: 2px 8px;
          text-transform: uppercase;
          font-weight: 600;
        }
        #quote-updated {
          color: #667085;
          margin-left: auto;
        }

        .scenario-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .sc-btn {
          cursor: pointer;
          border-radius: 10px;
          border: 1px solid #d0d5dd;
          background: #ffffff;
          text-align: left;
          padding: 9px 10px;
          transition: border-color .15s, box-shadow .15s;
        }
        .sc-btn:hover {
          box-shadow: 0 4px 12px rgba(2, 6, 23, 0.08);
        }
        .scenario-context {
          background: #ffffff;
          border: 1px solid #dbe5f4;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .risk-head {
          font-size: 0.72rem;
          color: #667085;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .risk-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .risk-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #e4e7ec;
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 0.76rem;
          color: #475467;
          background: #fcfdff;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 6px;
        }
        .stat-card {
          background: #ffffff;
          border: 1px solid #e4e7ec;
          border-left: 3px solid #003f99;
          border-radius: 8px;
          padding: 8px 10px;
          min-width: 0;
        }
        .stat-label {
          font-size: 0.62rem;
          letter-spacing: 0.09em;
          color: #667085;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .stat-value {
          font-size: 1.05rem;
          font-family: 'Courier New', monospace;
          color: #101828;
          font-weight: 700;
        }
        .stat-sub {
          font-size: 0.7rem;
          color: #667085;
          margin-top: 1px;
        }

        .tabs {
          display: flex;
          gap: 6px;
          padding-bottom: 2px;
          border-bottom: 1px solid #dbe5f4;
        }
        .tab-btn {
          cursor: pointer;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 0.71rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #475467;
          background: transparent;
        }
        .tab-btn.active {
          color: #ffffff;
          border-color: transparent;
        }

        .chart-shell {
          background: #ffffff;
          border: 1px solid #dbe5f4;
          border-radius: 10px;
          padding: 8px 8px 5px;
        }
        .chart-title {
          font-size: 0.68rem;
          color: #667085;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
          padding-left: 8px;
        }
        .chart-empty {
          color: #667085;
          text-align: center;
          padding: 24px;
        }
        .chart-tooltip {
          background: #ffffff;
          border: 1px solid #dbe5f4;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 0.78rem;
        }
        .chart-tooltip-label {
          color: #667085;
          margin-bottom: 4px;
        }

        .footer-note {
          font-size: 0.74rem;
          color: #475467;
          border-top: 1px solid #dbe5f4;
          padding-top: 8px;
          line-height: 1.6;
        }

        @media (max-width: 1200px) {
          .stats-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @media (max-width: 980px) {
          .scenario-grid { grid-template-columns: 1fr; }
          .search-box {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .ticker-group, .price-group, .horizon-group, .paths-group, .action-group {
            grid-column: span 1;
          }
          .search-box.compact .price-group,
          .search-box.compact .horizon-group,
          .search-box.compact .paths-group,
          .search-box.compact .action-group {
            grid-column: span 1;
          }
        }
        @media (max-width: 700px) {
          .header-top {
            flex-direction: column;
            align-items: flex-start;
          }
          .page-body { padding: 12px; }
          .search-box { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          #quote-updated {
            margin-left: 0;
            display: block;
          }
          .ticker-quote {
            flex-wrap: wrap;
            row-gap: 6px;
          }
          .ticker-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <header className="header-section">
        <div className="header-top">
          <div className="header-brand">
            <div className="header-icon">S</div>
            <div>
              <h2 className="header-title">Stock Trajectory Simulator</h2>
              <div className="header-subtitle">Monte Carlo projections with scenario overlays</div>
            </div>
          </div>
          <div className="header-live">
            <span className="live-dot" style={{ background: sc.color, boxShadow: `0 0 8px ${sc.glow}` }} />
            <span>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · LIVE</span>
          </div>
        </div>

        <div className="ticker-toolbar">
          <div className="ticker-summary" aria-live="polite">
            <span id="quote-symbol">{quoteState.symbol}</span>
            <span id="quote-price">{quoteState.priceText}</span>
            <span id="quote-change" className={quoteState.changeClass}>{quoteState.changeText}</span>
            <span className="quote-flag">Delayed</span>
            <span id="quote-updated">{quoteState.isLoading ? "Loading quote..." : quoteState.updatedText}</span>
          </div>
          <button className="toggle-ticker-btn" onClick={() => setIsTickerExpanded((prev) => !prev)}>
            {isTickerExpanded ? "Hide Ticker" : "Show Ticker"}
          </button>
        </div>

        <div className={`search-box ${isTickerExpanded ? "" : "compact"}`}>
          {isTickerExpanded ? (
            <div className="input-group ticker-group">
              <label>Ticker</label>
              <div className="ticker-picker">
                <input
                  className="input-field"
                  value={inputTicker}
                  onChange={(event) => {
                    setInputTicker(event.target.value.toUpperCase());
                    setShowSearchResults(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setShowSearchResults(false), 150);
                  }}
                  onKeyDown={(event) => {
                    if (!showSearchResults || !searchResults.length) {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        loadQuoteForTicker(inputTicker);
                      }
                      return;
                    }

                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setAcHighlightIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setAcHighlightIdx((prev) => Math.max(prev - 1, 0));
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      if (acHighlightIdx >= 0 && searchResults[acHighlightIdx]) {
                        selectSuggestion(searchResults[acHighlightIdx].symbol);
                      } else {
                        loadQuoteForTicker(inputTicker);
                      }
                    } else if (event.key === "Escape") {
                      setShowSearchResults(false);
                      setAcHighlightIdx(-1);
                    }
                  }}
                  placeholder="e.g. SHELL.AS"
                  autoComplete="off"
                />

                {showSearchResults && searchResults.length > 0 ? (
                  <div className="ticker-autocomplete">
                    {searchResults.map((row, idx) => (
                      <div
                        key={`${row.symbol}-${idx}`}
                        className={`ac-item ${idx === acHighlightIdx ? "ac-item-active" : ""}`}
                        onMouseEnter={() => setAcHighlightIdx(idx)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectSuggestion(row.symbol);
                        }}
                      >
                        <strong>{row.symbol}</strong>
                        <span className="ac-name">{row.name}</span>
                        <span className="ac-type">{row.type}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={`search-meta ${searchError ? "error" : ""}`}>
                {searchLoading ? "Searching tickers..." : searchError || ""}
              </div>
            </div>
          ) : null}

          <div className="input-group price-group">
            <label>Current Price</label>
            <input
              className="input-field"
              type="number"
              value={inputPrice}
              onChange={(event) => setInputPrice(event.target.value)}
              onBlur={() => {
                const value = Number.parseFloat(inputPrice);
                if (Number.isFinite(value) && value > 0) {
                  setStartPrice(value);
                }
              }}
              placeholder="29.50"
            />
          </div>

          <div className="input-group horizon-group">
            <label>Horizon</label>
            <select className="input-field" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={252}>252 days</option>
            </select>
          </div>

          <div className="input-group paths-group">
            <label>Simulations</label>
            <select className="input-field" value={numPaths} onChange={(event) => setNumPaths(Number(event.target.value))}>
              <option value={200}>200 paths</option>
              <option value={500}>500 paths</option>
              <option value={1000}>1,000 paths</option>
              <option value={2000}>2,000 paths</option>
            </select>
          </div>

          <div className="input-group action-group">
            <label>Run</label>
            <button className="run-btn" onClick={runButtonClick} style={{ background: sc.color }}>
              {isRunning ? "Running..." : "Run Simulation"}
            </button>
          </div>
        </div>

        {quoteState.error ? <div className="search-meta error">{quoteState.error}</div> : null}
      </header>

      <main className="page-body">
        <section>
          <div className="scenario-grid">
            {Object.entries(SCENARIOS).map(([key, value]) => (
              <button
                key={key}
                className="sc-btn"
                onClick={() => setScenario(key)}
                style={{
                  borderColor: scenario === key ? `${value.color}66` : "#d0d5dd",
                  boxShadow: scenario === key ? `0 0 0 3px ${value.color}22` : "none",
                }}
              >
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: value.color }}>{value.label}</div>
                <div style={{ fontSize: "0.75rem", color: "#475467", marginTop: 4 }}>{value.sublabel}</div>
                <div style={{ marginTop: 8, fontSize: "0.76rem", color: "#475467" }}>
                  Drift {fmtPct(value.annualDrift)} · Vol {fmt(value.annualVol * 100)}%
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="scenario-context" style={{ borderColor: `${sc.color}40` }}>
          <div>
            <div style={{ fontSize: "0.72rem", color: sc.color, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
              {sc.label} · Scenario Context
            </div>
            <div style={{ marginTop: 8, color: "#344054", lineHeight: 1.6, fontSize: "0.9rem" }}>{sc.description}</div>
          </div>
          <div>
            <div className="risk-head">Key Risk Factors</div>
            <div className="risk-row" style={{ marginTop: 6 }}>
              {sc.keyRisks.map((risk) => (
                <div key={risk} className="risk-chip">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.color }} />
                  <span>{risk}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {results ? (
          <section className="stats-grid">
            <StatCard label="Median (P50)" value={`$${fmt(results.stats.p50)}`} sub={fmtPct((results.stats.p50 - startPrice) / startPrice)} color={sc.color} />
            <StatCard label="Bull (P90)" value={`$${fmt(results.stats.p90)}`} sub={fmtPct((results.stats.p90 - startPrice) / startPrice)} color={sc.accent} />
            <StatCard label="Bear (P10)" value={`$${fmt(results.stats.p10)}`} sub={fmtPct((results.stats.p10 - startPrice) / startPrice)} color="#b42318" />
            <StatCard label="Mean" value={`$${fmt(results.stats.mean)}`} sub={fmtPct((results.stats.mean - startPrice) / startPrice)} color="#667085" />
            <StatCard label="Std Dev" value={`$${fmt(results.stats.stdDev)}`} sub="1σ spread" color="#667085" />
            <StatCard
              label="% Paths Up"
              value={`${fmt(results.stats.pAbove, 1)}%`}
              sub="above entry"
              color={results.stats.pAbove > 50 ? "#0a7a2f" : "#b42318"}
            />
            <StatCard label="Avg Max DD" value={`-${fmt(results.stats.avgMaxDD * 100, 1)}%`} sub="peak-to-trough" color="#b54708" />
          </section>
        ) : null}

        <section>
          <div className="tabs">
            {[
              { id: "paths", label: "Path Samples" },
              { id: "band", label: "Percentile Band" },
              { id: "dist", label: "Distribution" },
              { id: "compare", label: "All Scenarios" },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                style={{ background: activeTab === tab.id ? sc.color : "transparent" }}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "paths" && results ? (
            <div className="chart-shell">
              <div className="chart-title">{displayPaths} Sample Paths · {ticker} · {days}D Horizon · {sc.label}</div>
              <ResponsiveContainer width="100%" height={305}>
                <LineChart data={sampledPathData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid stroke="rgba(0, 45, 114, 0.14)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke="#6b7280" tick={{ fill: "#475467", fontSize: 11 }} />
                  <YAxis
                    stroke="#6b7280"
                    tick={{ fill: "#475467", fontSize: 11 }}
                    tickFormatter={(v) => `$${v.toFixed(1)}`}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={startPrice} stroke="#1d4ed8" strokeDasharray="5 3" strokeOpacity={0.6} />
                  {results.paths.map((_, index) => (
                    <Line
                      key={`path-${index}`}
                      type="monotone"
                      dataKey={`p${index}`}
                      stroke={sc.color}
                      strokeWidth={1}
                      strokeOpacity={0.2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {activeTab === "band" && results ? (
            <div className="chart-shell">
              <div className="chart-title">Percentile Fan Chart · P10 / P25 / P50 / P75 / P90</div>
              <ResponsiveContainer width="100%" height={305}>
                <ComposedChart data={bandData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid stroke="rgba(0, 45, 114, 0.14)" strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke="#6b7280" tick={{ fill: "#475467", fontSize: 11 }} />
                  <YAxis
                    stroke="#6b7280"
                    tick={{ fill: "#475467", fontSize: 11 }}
                    tickFormatter={(v) => `$${v.toFixed(1)}`}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: `1px solid ${sc.color}40`, borderRadius: 6, fontSize: 11 }}
                    formatter={(val, name) => [`$${fmt(val)}`, name]}
                  />
                  <ReferenceLine y={startPrice} stroke="#1d4ed8" strokeDasharray="5 3" strokeOpacity={0.6} />
                  <Area type="monotone" dataKey="p90" stroke="none" fill={sc.color} fillOpacity={0.09} name="P90" />
                  <Area type="monotone" dataKey="p75" stroke="none" fill={sc.color} fillOpacity={0.14} name="P75" />
                  <Area type="monotone" dataKey="p25" stroke="none" fill="#ffffff" fillOpacity={1} name="P25 fill" />
                  <Area type="monotone" dataKey="p10" stroke="none" fill="#ffffff" fillOpacity={1} name="P10 fill" />
                  <Line type="monotone" dataKey="p90" stroke={sc.color} strokeWidth={1.4} strokeOpacity={0.55} dot={false} name="P90" />
                  <Line type="monotone" dataKey="p75" stroke={sc.color} strokeWidth={1.4} strokeOpacity={0.72} dot={false} name="P75" />
                  <Line type="monotone" dataKey="p50" stroke={sc.accent} strokeWidth={2.3} dot={false} name="Median (P50)" />
                  <Line type="monotone" dataKey="p25" stroke={sc.color} strokeWidth={1.4} strokeOpacity={0.72} dot={false} name="P25" />
                  <Line type="monotone" dataKey="p10" stroke="#b42318" strokeWidth={1.4} strokeOpacity={0.72} dot={false} name="P10" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {activeTab === "dist" && results ? (
            <div className="chart-shell">
              <div className="chart-title">Final Price Distribution · {numPaths} Simulations</div>
              <ResponsiveContainer width="100%" height={305}>
                <BarChart data={results.hist} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid stroke="rgba(0, 45, 114, 0.14)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="price" stroke="#6b7280" tick={{ fill: "#475467", fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}`} />
                  <YAxis stroke="#6b7280" tick={{ fill: "#475467", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: `1px solid ${sc.color}40`, borderRadius: 6, fontSize: 11 }}
                    formatter={(val) => [val, "Paths"]}
                    labelFormatter={(v) => `$${parseFloat(v).toFixed(2)}`}
                  />
                  <ReferenceLine x={results.stats.p50} stroke={sc.accent} strokeDasharray="4 2" />
                  <ReferenceLine x={startPrice} stroke="#1d4ed8" strokeDasharray="4 2" />
                  <Bar dataKey="count" fill={sc.color} fillOpacity={0.72} radius={[2, 2, 0, 0]} name="Paths" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {activeTab === "compare" ? (
            <AllScenariosCompare startPrice={startPrice} days={days} numPaths={300} />
          ) : null}
        </section>

        <div className="footer-note">
          Model: Geometric Brownian Motion with scenario-calibrated annual drift and volatility. Assumes log-normal returns and does not model jumps, fat tails, or structural regime breaks.
        </div>
      </main>
    </div>
  );
}
