import { useState } from "react";

const PICKS = [
  {
    ticker: "AAPL",
    name: "Apple Inc",
    rank: 2,
    weight: "6.66%",
    price: "$308.63",
    ivRank: 46,
    ivLabel: "46% — neutral",
    ivColor: "green",
    beta: 1.09,
    betaColor: "green",
    earnings: "Jul 30",
    earningsColor: "amber",
    assignment: "Fortress quality",
    assignmentColor: "green",
    strategy: "CSP or PMCC",
    verdict: "Strong GO",
    verdictClass: "go",
    score: 9.2,
    best: true,
    fundamentals: "Fortress balance sheet · $160B+ profit · Consumer franchise moat",
    ivNote: "Ideal PMCC anchor — not overpaying for extrinsic. IV at 44th percentile.",
    assignmentNote: "Strike at ~$230–240 = 23% below spot. Strong historical support. Always recovers.",
    risk: "Jul 30 earnings inside first short-call window. Close short leg pre-earnings.",
  },
  {
    ticker: "GOOGL",
    name: "Alphabet Inc",
    rank: 5,
    weight: "3.33%",
    price: "$359.91",
    ivRank: 70,
    ivLabel: "~70% — elevated",
    ivColor: "amber",
    beta: 1.1,
    betaColor: "green",
    earnings: "Late Jul",
    earningsColor: "amber",
    assignment: "Cloud + AI moat",
    assignmentColor: "green",
    strategy: "CSP or PMCC",
    verdict: "Strong GO",
    verdictClass: "go",
    score: 8.8,
    best: false,
    fundamentals: "Cloud acceleration · $160B profit · Search + AI dominance",
    ivNote: "IV rank ~70 — rich enough for fat CSP premium, not so extreme it signals a peak.",
    assignmentNote: "CSP strike ~$265–275 = 25% below spot. Zero-debt balance sheet — no existential risk scenario.",
    risk: "Late-July earnings. Same window management as AAPL.",
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    rank: 8,
    weight: "2.17%",
    price: "$582.90",
    ivRank: 70,
    ivLabel: "~70%",
    ivColor: "amber",
    beta: 1.3,
    betaColor: "amber",
    earnings: "Late Jul",
    earningsColor: "amber",
    assignment: "Cheapest Mag 7",
    assignmentColor: "green",
    strategy: "CSP preferred",
    verdict: "GO",
    verdictClass: "go",
    score: 8.4,
    best: false,
    fundamentals: "~19–20x forward P/E · $71B profit · Ad moat + AI monetisation",
    ivNote: "IV ~70% generates rich premium. Prefer CSP over PMCC — higher beta makes covered-call management harder.",
    assignmentNote: "Strike ~$420–440 = 24–25% below spot. Ad earnings floor cushions macro drawdowns.",
    risk: "Earnings can gap ±15%. Avoid holding short call through the event.",
  },
  {
    ticker: "AMZN",
    name: "Amazon.com Inc",
    rank: 4,
    weight: "3.84%",
    price: "$242.67",
    ivRank: 68,
    ivLabel: "68%",
    ivColor: "amber",
    beta: 1.38,
    betaColor: "amber",
    earnings: "Late Jul",
    earningsColor: "amber",
    assignment: "Near 52W low",
    assignmentColor: "amber",
    strategy: "CSP — half size",
    verdict: "Cond. GO",
    verdictClass: "cond",
    score: 7.6,
    best: false,
    fundamentals: "AWS + AI tailwinds · Strong Buy (58 analysts) · Diversified revenue",
    ivNote: "IV vs HV spread +9.4 pts — richest of the group. Genuine premium selling edge.",
    assignmentNote: "Strike ~$175–185 close to 52-week low. Half-size position; plan to add on further dip.",
    risk: "Assignment cushion thinner than peers. Size carefully.",
  },
  {
    ticker: "AVGO",
    name: "Broadcom Inc",
    rank: 7,
    weight: "2.52%",
    price: "$360.45",
    ivRank: 60,
    ivLabel: "~60%",
    ivColor: "amber",
    beta: 1.3,
    betaColor: "amber",
    earnings: "~Sep",
    earningsColor: "green",
    assignment: "AI chip + dividend",
    assignmentColor: "green",
    strategy: "PMCC preferred",
    verdict: "Cond. GO",
    verdictClass: "cond",
    score: 7.4,
    best: false,
    fundamentals: "Apple/Google/Meta AI custom silicon · $40B revenue · Pays dividend",
    ivNote: "~60% IV rank solid for PMCC construction. Earnings ~Sep keeps first 42-DTE window clean.",
    assignmentNote: "Real earnings floor from hyperscaler contracts. Dividend collected if assigned.",
    risk: "Higher absolute capital per contract (~$28K for deep-ITM LEAP). Size accordingly.",
  },
];

const FULL_TABLE = [
  { ticker: "AAPL",  weight: "6.66%", ivRank: 46,  ivDot: "g", beta: 1.09, betaDot: "g", score: 9.2, verdict: "Strong GO",  vClass: "go"   },
  { ticker: "GOOGL", weight: "3.33%", ivRank: 70,  ivDot: "a", beta: 1.1,  betaDot: "g", score: 8.8, verdict: "Strong GO",  vClass: "go"   },
  { ticker: "META",  weight: "2.17%", ivRank: 70,  ivDot: "a", beta: 1.3,  betaDot: "a", score: 8.4, verdict: "GO",         vClass: "go"   },
  { ticker: "AMZN",  weight: "3.84%", ivRank: 68,  ivDot: "a", beta: 1.38, betaDot: "a", score: 7.6, verdict: "Cond. GO",   vClass: "cond" },
  { ticker: "AVGO",  weight: "2.52%", ivRank: 60,  ivDot: "a", beta: 1.3,  betaDot: "a", score: 7.4, verdict: "Cond. GO",   vClass: "cond" },
  { ticker: "MSFT",  weight: "4.26%", ivRank: 99,  ivDot: "r", beta: 1.1,  betaDot: "g", score: 7.0, verdict: "Cond. GO*",  vClass: "cond" },
  { ticker: "JPM",   weight: "1.32%", ivRank: 40,  ivDot: "g", beta: 1.1,  betaDot: "g", score: 6.8, verdict: "Cond. GO",   vClass: "cond" },
  { ticker: "WMT",   weight: "1.31%", ivRank: 35,  ivDot: "g", beta: 0.5,  betaDot: "g", score: 6.6, verdict: "Cond. GO†",  vClass: "cond" },
  { ticker: "NVDA",  weight: "6.94%", ivRank: 39,  ivDot: "a", beta: 2.22, betaDot: "r", score: 6.2, verdict: "Cond. GO‡",  vClass: "cond" },
  { ticker: "V",     weight: "1.01%", ivRank: 30,  ivDot: "g", beta: 0.9,  betaDot: "g", score: 6.2, verdict: "Cond. GO†",  vClass: "cond" },
  { ticker: "LLY",   weight: "1.59%", ivRank: 55,  ivDot: "a", beta: 0.5,  betaDot: "g", score: 5.8, verdict: "Watch",      vClass: "cond" },
  { ticker: "AMD",   weight: "1.24%", ivRank: 60,  ivDot: "a", beta: 1.7,  betaDot: "r", score: 5.4, verdict: "Watch",      vClass: "cond" },
  { ticker: "JNJ",   weight: "0.93%", ivRank: 25,  ivDot: "g", beta: 0.6,  betaDot: "g", score: 5.2, verdict: "Skip†",      vClass: "no"   },
  { ticker: "XOM",   weight: "0.84%", ivRank: 30,  ivDot: "g", beta: 1.1,  betaDot: "a", score: 4.4, verdict: "Skip",       vClass: "no"   },
  { ticker: "MU",    weight: "1.62%", ivRank: 50,  ivDot: "a", beta: 1.8,  betaDot: "r", score: 4.0, verdict: "Skip",       vClass: "no"   },
  { ticker: "TSLA",  weight: "2.17%", ivRank: 17,  ivDot: "r", beta: 1.80, betaDot: "r", score: 2.8, verdict: "NO-GO",      vClass: "no"   },
];

const C = {
  bg: "#0f1117",
  surface: "#161b27",
  card: "#1c2333",
  border: "#2a3347",
  borderStrong: "#3a4a63",
  text: "#e2e8f0",
  muted: "#8892a4",
  dim: "#4a5568",
  green: "#34d399",
  greenBg: "rgba(52,211,153,0.12)",
  amber: "#fbbf24",
  amberBg: "rgba(251,191,36,0.12)",
  red: "#f87171",
  redBg: "rgba(248,113,113,0.12)",
  blue: "#60a5fa",
  blueBg: "rgba(96,165,250,0.12)",
  accent: "#6366f1",
  accentBg: "rgba(99,102,241,0.15)",
};

const dotColor = { g: C.green, a: C.amber, r: C.red };
const verdictStyle = {
  go:   { bg: C.greenBg, color: C.green },
  cond: { bg: C.amberBg, color: C.amber },
  no:   { bg: C.redBg,   color: C.red   },
};
const ivColor = { green: C.green, amber: C.amber, red: C.red };
const assignColor = { green: C.green, amber: C.amber };
const earningsColor = { green: C.green, amber: C.amber };

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
  const barColor = score >= 8 ? C.green : score >= 6 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.border, minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: barColor }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, minWidth: 28, textAlign: "right" }}>
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
      borderBottom: `0.5px solid ${C.border}`,
      color: C.muted,
    }}>
      <span>{label}</span>
      <span style={{ color: color || C.text, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function PickCard({ pick }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: C.card,
      border: pick.best ? `2px solid ${C.accent}` : `0.5px solid ${C.border}`,
      borderRadius: 12, padding: "1rem 1.1rem",
      position: "relative", cursor: "default",
      transition: "border-color 0.15s",
    }}>
      {pick.best && (
        <span style={{
          position: "absolute", top: -1, right: 14,
          transform: "translateY(-50%)",
          background: C.accentBg, color: C.blue,
          fontSize: 11, fontWeight: 600,
          padding: "2px 9px", borderRadius: 6,
          border: `0.5px solid ${C.accent}`,
        }}>Best pick</span>
      )}

      <Pill label={pick.verdict} vClass={pick.verdictClass} />

      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginTop: 8 }}>{pick.ticker}</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
        {pick.name} · #{pick.rank} S&P · {pick.weight}
      </div>
      <div style={{
        display: "inline-block", fontSize: 11, fontWeight: 500,
        color: C.blue, background: C.blueBg,
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
          marginTop: 10, width: "100%", fontSize: 11, color: C.muted,
          background: "transparent", border: `0.5px solid ${C.border}`,
          borderRadius: 6, padding: "4px 0", cursor: "pointer",
        }}
      >
        {open ? "Hide detail ↑" : "Show detail ↓"}
      </button>

      {open && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          <p style={{ marginBottom: 6 }}>
            <span style={{ color: C.text, fontWeight: 500 }}>Fundamentals: </span>
            {pick.fundamentals}
          </p>
          <p style={{ marginBottom: 6 }}>
            <span style={{ color: C.text, fontWeight: 500 }}>IV setup: </span>
            {pick.ivNote}
          </p>
          <p style={{ marginBottom: 6 }}>
            <span style={{ color: C.text, fontWeight: 500 }}>Assignment: </span>
            {pick.assignmentNote}
          </p>
          <p style={{ color: C.amber }}>
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
    textTransform: "uppercase", color: C.muted, marginBottom: 10,
  };

  const controlBtn = (active) => ({
    fontSize: 12, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
    border: `0.5px solid ${active ? C.accent : C.border}`,
    background: active ? C.accentBg : "transparent",
    color: active ? C.blue : C.muted,
    fontWeight: active ? 600 : 400,
  });

  const thStyle = {
    textAlign: "left", fontSize: 11, fontWeight: 600,
    color: C.muted, padding: "4px 10px 8px",
    borderBottom: `0.5px solid ${C.borderStrong}`,
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "6px 10px", borderBottom: `0.5px solid ${C.border}`,
    fontSize: 12.5, color: C.muted, verticalAlign: "middle",
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "2rem 1.5rem", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.accent, marginBottom: 6 }}>
            Strategy 2 · Long-DTE conviction
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            S&P 500 Top 20 — PMCC / CSP Scorecard
          </h1>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Jun 17 2027 expiry · ~349 DTE · Δ 0.20 strike · Scored on IV setup, fundamentals, assignment survivability, earnings risk, and portfolio fit. Data as of Jul 4 2026.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: "2rem" }}>
          {[
            { label: "Universe", value: "Top 20" },
            { label: "Qualified GO", value: "3" },
            { label: "Conditional GO", value: "7" },
            { label: "Skip / NO-GO", value: "4" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: C.surface, borderRadius: 8, padding: "0.85rem 1rem", border: `0.5px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={labelStyle}>Top 5 recommended picks</div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12, marginBottom: "2.5rem",
        }}>
          {PICKS.map(p => <PickCard key={p.ticker} pick={p} />)}
        </div>

        <div style={labelStyle}>Full top 20 screening table</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: C.muted, alignSelf: "center", marginRight: 4 }}>Sort by:</span>
          {[["score","Score"],["ivRank","IV rank"],["beta","Beta"]].map(([k,l]) => (
            <button key={k} onClick={() => setSortBy(k)} style={controlBtn(sortBy === k)}>{l}</button>
          ))}
          <span style={{ fontSize: 12, color: C.muted, alignSelf: "center", marginLeft: 8, marginRight: 4 }}>Filter:</span>
          {[["all","All"],["go","GO"],["cond","Conditional"],["no","Skip"]].map(([k,l]) => (
            <button key={k} onClick={() => setFilterVerdict(k)} style={controlBtn(filterVerdict === k)}>{l}</button>
          ))}
        </div>

        <div style={{ overflowX: "auto", background: C.surface, borderRadius: 10, border: `0.5px solid ${C.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Ticker","S&P wt","IV rank","Beta","Score /10","Verdict"].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.ticker} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: C.text, fontSize: 13 }}>{r.ticker}</td>
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

        <div style={{ marginTop: 14, fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
          * MSFT: IV rank 99 — wait for below 50 before entering LEAP anchor.<br />
          † WMT, V, JNJ: IV too low for meaningful CSP yield relative to capital locked up.<br />
          ‡ NVDA: viable only if willing to hold through a 40–60% drawdown at assignment price.<br />
          BRK.B, GOOG (duplicate), INTC, AMAT excluded pre-screen (options liquidity / same underlying / turnaround risk).
        </div>

      </div>
    </div>
  );
}
