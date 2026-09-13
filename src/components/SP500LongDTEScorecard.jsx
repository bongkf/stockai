import { useState } from "react";

const PICKS = [
  {
    ticker: "AAPL",
    name: "Apple Inc",
    rank: 2,
    weight: "6.66%",
    price: "$319.45",
    ivRank: 52,
    ivLabel: "52% — neutral",
    ivColor: "green",
    beta: 1.09,
    betaColor: "green",
    earnings: "Oct 28",
    earningsColor: "amber",
    assignment: "Fortress quality",
    assignmentColor: "green",
    strategy: "CSP or PMCC",
    verdict: "Strong GO",
    verdictClass: "go",
    score: 9.1,
    best: true,
    fundamentals: "Fortress balance sheet · $170B+ profit · Consumer resilience in Q4 · AI Services platform uptake accelerating",
    ivNote: "IV rank 52% solid CSP setup into Q4 earnings. Fair value despite geopolitical energy bid pushing equities lower.",
    assignmentNote: "Strike at ~$245–255 = 20–23% below spot. iPhone 17 Pro cycle strong. Holiday season baseline solid.",
    risk: "Oct 28 earnings in Q4 cluster. Plan for -8–10% if services beat misses. Monitor oil spike → FX EUR weakness bleedthrough.",
  },
  {
    ticker: "GOOGL",
    name: "Alphabet Inc",
    rank: 5,
    weight: "3.33%",
    price: "$375.28",
    ivRank: 64,
    ivLabel: "~64% — elevated",
    ivColor: "amber",
    beta: 1.1,
    betaColor: "green",
    earnings: "Oct 29",
    earningsColor: "amber",
    assignment: "Cloud + AI moat",
    assignmentColor: "green",
    strategy: "CSP or PMCC",
    verdict: "Strong GO",
    verdictClass: "go",
    score: 8.7,
    best: false,
    fundamentals: "Cloud acceleration · $180B+ profit · Search + AI dominance · Gemini deployment scaling enterprise",
    ivNote: "IV rank ~64% moderating from summer peaks. Geopolitical premium fading in tech; still fat enough for solid CSP premiums.",
    assignmentNote: "CSP strike ~$280–290 = 24–25% below spot. Zero-debt balance sheet anchors downside confidence. YouTube ad resilience supports assigned floor.",
    risk: "Oct 29 Q4 cluster earnings. Cloud margin beat already in consensus. Search upside may be priced. Oil spike → EUR weakness headwind (20% revenue).",
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    rank: 8,
    weight: "2.17%",
    price: "$648.03",
    ivRank: 67,
    ivLabel: "~67% — elevated",
    ivColor: "amber",
    beta: 1.32,
    betaColor: "amber",
    earnings: "Oct 28",
    earningsColor: "amber",
    assignment: "AI ad spend champion",
    assignmentColor: "green",
    strategy: "CSP preferred",
    verdict: "Strong GO",
    verdictClass: "go",
    score: 8.6,
    best: false,
    fundamentals: "~22x forward P/E · $76B profit · AI monetization accelerating · Reels scaling · Ad spend surge Q4",
    ivNote: "IV rank 67% reflects elevated earnings volatility. Q4 ad spend cycle + AI narrative keep premiums rich. CSP outperformance justified vs PMCC.",
    assignmentNote: "Strike ~$465–485 = 25–27% below spot. Ad targeting resilience supports assignment floor. Avoid rolling through Oct 28 earnings event.",
    risk: "Oct 28 earnings (Q4 cluster). Ad spend guidance critical; ±12–15% move likely. Reels monetization beats can drive +20% gap-up.",
  },
  {
    ticker: "AMZN",
    name: "Amazon.com Inc",
    rank: 4,
    weight: "3.84%",
    price: "$256.78",
    ivRank: 24,
    ivLabel: "~24% — depressed",
    ivColor: "green",
    beta: 1.35,
    betaColor: "amber",
    earnings: "Oct 29",
    earningsColor: "amber",
    assignment: "AWS dominance + AI capex",
    assignmentColor: "green",
    strategy: "PMCC — size to 2%",
    verdict: "Cond. GO",
    verdictClass: "cond",
    score: 7.8,
    best: false,
    fundamentals: "AWS 32% margin · AI infrastructure play · Ad-tech upside · Advertising +20% YoY guidance",
    ivNote: "IV rank 24% depressed; tech sector avg 36%. Earning premium compressed but assignment cushion solid. Oil price weakness (USD strength) helps.",
    assignmentNote: "Strike ~$190–200 = 24–26% below spot. AWS Q4 cloud guidance anchors upside. Plan PMCC roll post-Oct 29 earnings.",
    risk: "Oct 29 Q4 earnings cluster. AWS guidance beat/miss drives ±10% moves. AI capex commentary critical — watch margin expansion thesis.",
  },
  {
    ticker: "AVGO",
    name: "Broadcom Inc",
    rank: 7,
    weight: "2.52%",
    price: "$361.99",
    ivRank: 21,
    ivLabel: "~21% — depressed",
    ivColor: "green",
    beta: 1.32,
    betaColor: "amber",
    earnings: "Nov 12",
    earningsColor: "green",
    assignment: "AI infrastructure moat",
    assignmentColor: "green",
    strategy: "PMCC preferred",
    verdict: "Strong GO",
    verdictClass: "go",
    score: 7.9,
    best: false,
    fundamentals: "$42B revenue · Custom AI silicon dominance (AAPL, GOOGL, META, MSFT) · 40% gross margin · Dividend 2.4% yield",
    ivNote: "IV rank 21% unusually depressed; hyperscaler AI cycle demands high AVGO allocation. Premium opportunity in PMCC construction. Post-earnings (Nov 12) gives 60-DTE clean runway.",
    assignmentNote: "Strike ~$280–290 = 22–25% below spot. Hyperscaler capex floor supports assignment confidence. Dividend collected (Nov ex-date imminent or passed). PMCC roll into Q1 post-earnings.",
    risk: "Nov 12 earnings (outside Q4 cluster). Guidance on hyperscaler AI capex cycles (2025–2026 outlooks) critical. Potential upside surprise on Nvidia's data center tailwinds.",
  },
];

const FULL_TABLE = [
  { ticker: "AAPL",  weight: "6.66%", ivRank: 48,  ivDot: "g", beta: 1.09, betaDot: "g", score: 9.1, verdict: "Strong GO",  vClass: "go"   },
  { ticker: "GOOGL", weight: "3.33%", ivRank: 62,  ivDot: "a", beta: 1.10, betaDot: "g", score: 8.7, verdict: "Strong GO",  vClass: "go"   },
  { ticker: "META",  weight: "2.17%", ivRank: 67,  ivDot: "a", beta: 1.32, betaDot: "a", score: 8.6, verdict: "Strong GO",  vClass: "go"   },
  { ticker: "AMZN",  weight: "3.84%", ivRank: 24,  ivDot: "g", beta: 1.35, betaDot: "a", score: 7.8, verdict: "Cond. GO",   vClass: "cond" },
  { ticker: "AVGO",  weight: "2.52%", ivRank: 21,  ivDot: "g", beta: 1.32, betaDot: "a", score: 7.9, verdict: "Strong GO",  vClass: "go"   },
  { ticker: "MSFT",  weight: "4.26%", ivRank: 23,  ivDot: "g", beta: 1.10, betaDot: "g", score: 7.3, verdict: "Cond. GO",   vClass: "cond" },
  { ticker: "JPM",   weight: "1.32%", ivRank: 10,  ivDot: "g", beta: 1.08, betaDot: "g", score: 6.4, verdict: "Watch",      vClass: "cond" },
  { ticker: "WMT",   weight: "1.31%", ivRank: 97,  ivDot: "r", beta: 0.52, betaDot: "g", score: 5.8, verdict: "Skip†",      vClass: "cond" },
  { ticker: "NVDA",  weight: "6.94%", ivRank: 82,  ivDot: "a", beta: 2.18, betaDot: "r", score: 5.6, verdict: "Watch‡",     vClass: "cond" },
  { ticker: "V",     weight: "1.01%", ivRank: 16,  ivDot: "g", beta: 0.92, betaDot: "g", score: 5.9, verdict: "Watch",      vClass: "cond" },
  { ticker: "LLY",   weight: "1.59%", ivRank: 54,  ivDot: "a", beta: 0.48, betaDot: "g", score: 6.1, verdict: "Watch",      vClass: "cond" },
  { ticker: "AMD",   weight: "1.24%", ivRank: 13,  ivDot: "g", beta: 1.68, betaDot: "r", score: 4.8, verdict: "Skip",       vClass: "no"   },
  { ticker: "JNJ",   weight: "0.93%", ivRank: 38,  ivDot: "g", beta: 0.62, betaDot: "g", score: 4.6, verdict: "Skip",       vClass: "no"   },
  { ticker: "XOM",   weight: "0.84%", ivRank: 34,  ivDot: "g", beta: 1.12, betaDot: "a", score: 4.2, verdict: "Skip",       vClass: "no"   },
  { ticker: "MU",    weight: "1.62%", ivRank: 5,   ivDot: "r", beta: 1.78, betaDot: "r", score: 3.1, verdict: "Skip",       vClass: "no"   },
  { ticker: "TSLA",  weight: "2.17%", ivRank: 39,  ivDot: "a", beta: 1.82, betaDot: "r", score: 3.4, verdict: "Skip",       vClass: "no"   },
];

// CSS variables used for theming (defined in styles.css)
const dotColor = { g: "var(--green)", a: "var(--amber)", r: "var(--red)" };
const verdictStyle = {
  go:   { bg: "var(--green-bg)", color: "var(--green)" },
  cond: { bg: "var(--amber-bg)", color: "var(--amber)" },
  no:   { bg: "var(--red-bg)",   color: "var(--red)"   },
};
const ivColor = { green: "var(--green)", amber: "var(--amber)", red: "var(--red)" };
const assignColor = { green: "var(--green)", amber: "var(--amber)" };
const earningsColor = { green: "var(--green)", amber: "var(--amber)" };

function Pill({ label, vClass }) {
  const s = verdictStyle[vClass] || verdictStyle.cond;
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 4,
      whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function Dot({ color }) {
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7,
      borderRadius: "50%", background: dotColor[color] || C.muted,
      marginRight: 4, verticalAlign: "middle",
    }} />
  );
}

function ScoreBar({ score }) {
  const pct = (score / 10) * 100;
  const barColor = score >= 8 ? "var(--green)" : score >= 6 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--border)", minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: barColor }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", minWidth: 28, textAlign: "right" }}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      fontSize: 12, padding: "4px 0",
      borderBottom: "0.5px solid var(--border)",
      color: "var(--muted)",
    }}>
      <span>{label}</span>
      <span style={{ color: color || "var(--text-primary)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function PickCard({ pick }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: "var(--card)",
      border: pick.best ? "2px solid var(--accent)" : "0.5px solid var(--border)",
      borderRadius: 12, padding: "1rem 1.1rem",
      position: "relative", cursor: "default",
      transition: "border-color 0.15s",
    }}>
      {pick.best && (
        <span style={{
          position: "absolute", top: -1, right: 14,
          transform: "translateY(-50%)",
          background: "var(--accent-bg)", color: "var(--blue)",
          fontSize: 11, fontWeight: 600,
          padding: "2px 9px", borderRadius: 6,
          border: "0.5px solid var(--accent)",
        }}>Best pick</span>
      )}

      <Pill label={pick.verdict} vClass={pick.verdictClass} />

      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 8 }}>{pick.ticker}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
        {pick.name} · #{pick.rank} S&P · {pick.weight}
      </div>
      <div style={{
        display: "inline-block", fontSize: 11, fontWeight: 500,
        color: "var(--blue)", background: "var(--blue-bg)",
        padding: "2px 8px", borderRadius: 4, marginBottom: 10,
      }}>{pick.strategy}</div>

      <StatRow label="Price" value={pick.price} />
      <StatRow label="IV rank" value={pick.ivLabel} color={ivColor[pick.ivColor]} />
      <StatRow label="Beta" value={pick.beta.toFixed(2)} color={ivColor[pick.betaColor]} />
      <StatRow label="Next earnings" value={pick.earnings} color={earningsColor[pick.earningsColor]} />
      <StatRow label="Assignment" value={pick.assignment} color={assignColor[pick.assignmentColor]} />

      <button
        onClick={() => setOpen(o => !o)}
        style={{
          marginTop: 10, width: "100%", fontSize: 11, color: "var(--muted)",
          background: "transparent", border: "0.5px solid var(--border)",
          borderRadius: 6, padding: "4px 0", cursor: "pointer",
        }}
      >
        {open ? "Hide detail ↑" : "Show detail ↓"}
      </button>

      {open && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          <p style={{ marginBottom: 6 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Fundamentals: </span>
            {pick.fundamentals}
          </p>
          <p style={{ marginBottom: 6 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>IV setup: </span>
            {pick.ivNote}
          </p>
          <p style={{ marginBottom: 6 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Assignment: </span>
            {pick.assignmentNote}
          </p>
          <p style={{ color: "var(--amber)" }}>
            <span style={{ fontWeight: 500 }}>Risk: </span>
            {pick.risk}
          </p>
        </div>
      )}
    </div>
  );
}

export default function SP500LongDTEScorecard() {
  const [sortBy, setSortBy] = useState("score");
  const [filterVerdict, setFilterVerdict] = useState("all");

  const sorted = [...FULL_TABLE]
    .filter(r => filterVerdict === "all" || r.vClass === filterVerdict)
    .sort((a, b) => {
      if (sortBy === "score") return b.score - a.score;
      if (sortBy === "ivRank") return a.ivRank - b.ivRank;
      if (sortBy === "beta") return a.beta - b.beta;
      return 0;
    });

  const labelStyle = {
    fontSize: 10, fontWeight: 600, letterSpacing: "0.07em",
    textTransform: "uppercase", color: "var(--muted)", marginBottom: 10,
  };

  const controlBtn = (active) => ({
    fontSize: 12, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
    border: active ? "0.5px solid var(--accent)" : "0.5px solid var(--border)",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--blue)" : "var(--muted)",
    fontWeight: active ? 600 : 400,
  });

  const thStyle = {
    textAlign: "left", fontSize: 11, fontWeight: 600,
    color: "var(--muted)", padding: "4px 10px 8px",
    borderBottom: "0.5px solid var(--border)",
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "6px 10px", borderBottom: "0.5px solid var(--border)",
    fontSize: 12.5, color: "var(--muted)", verticalAlign: "middle",
  };

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "2rem 1.5rem", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>
            Strategy 2 · Long-DTE conviction
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
            S&P 500 Top 20 — PMCC / CSP Scorecard
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            Jun 17 2027 expiry · ~277 DTE · Δ 0.20 strike · Scored on IV setup, fundamentals, assignment survivability, Q4 earnings risk, and geopolitical sensitivity. Data as of Sep 13 2026. <strong>Context: Crude oil $110–115 (Shell +16.6%) · Hormuz elevated · Q4 2026 earnings season underway · Fed holding rates · Tech valuations under pressure from oil spike spillovers and FX headwinds · Energy sector outperforming S&P by 4–6%.</strong>
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "2rem" }}>
          {[
            { label: "Universe", value: "Top 20" },
            { label: "Qualified GO", value: "3" },
            { label: "Conditional GO", value: "7" },
            { label: "Skip / NO-GO", value: "4" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--surface)", borderRadius: 8, padding: "0.85rem 1rem", border: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={labelStyle}>Top 5 recommended picks</div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12, marginBottom: "2.5rem",
        }}>
          {PICKS.map(p => <PickCard key={p.ticker} pick={p} />)}
        </div>

        <div style={labelStyle}>Full top 20 screening table</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", marginRight: 4 }}>Sort by:</span>
          {[["score","Score"],["ivRank","IV rank"],["beta","Beta"]].map(([k,l]) => (
            <button key={k} onClick={() => setSortBy(k)} style={controlBtn(sortBy === k)}>{l}</button>
          ))}
          <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", marginLeft: 8, marginRight: 4 }}>Filter:</span>
          {[["all","All"],["go","GO"],["cond","Conditional"],["no","Skip"]].map(([k,l]) => (
            <button key={k} onClick={() => setFilterVerdict(k)} style={controlBtn(filterVerdict === k)}>{l}</button>
          ))}
        </div>

        <div style={{ overflowX: "auto", background: "var(--surface)", borderRadius: 10, border: "0.5px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Ticker","S&P wt","IV %","Beta","Score /10","Verdict"].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.ticker} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{r.ticker}</td>
                  <td style={tdStyle}>{r.weight}</td>
                  <td style={tdStyle}>
                    <Dot color={r.ivDot} />{r.ivRank}%
                  </td>
                  <td style={tdStyle}>
                    <Dot color={r.betaDot} />{r.beta.toFixed(2)}
                  </td>
                  <td style={{ ...tdStyle, minWidth: 130 }}>
                    <ScoreBar score={r.score} />
                  </td>
                  <td style={tdStyle}>
                    <Pill label={r.verdict} vClass={r.vClass} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: "var(--dim)", lineHeight: 1.7 }}>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--text-primary)" }}>IV Indicators:</strong> 🟢 Green = Low IV (&lt;40%) | 🟡 Amber = Moderate IV (40–70%) | 🔴 Red = High IV (&gt;70%)
          </div>
          * MSFT: IV rank 23 — normalized from 99%, now attractive for LEAP anchor entry.<br />
          † WMT, V, JNJ: Low IV compensated by stability (beta &lt;1), but premium generation limited.<br />
          ‡ NVDA: High IV (82%) viable only if willing to hold through 40–60% drawdown at assignment.<br />
          MU: Extremely low IV (5%) signals complacency; watch for vol expansion catalyst (earnings Sep 24).<br />
          BRK.B, GOOG (duplicate), INTC, AMAT excluded pre-screen (options liquidity / same underlying / turnaround risk).
        </div>

      </div>
    </div>
  );
}
