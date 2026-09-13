import { useState, useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from "recharts";

const SPOT = 41.655;
const SHARES = 1800;

// ── FULL CHAIN FROM IBKR SCREENSHOT (Sep 13 2026) ───────────────────────────
const ALL_INSTRUMENTS = [
  // OCT 16 (33 DTE)
  { expiry:"OCT 16",  strike:39, dte:33, bid:2.84, ask:2.88, delta:0.828, pos:-1,  avgCost:2.016, hasPos:true  },
  { expiry:"OCT 16",  strike:40, dte:33, bid:2.08, ask:2.12, delta:0.730, pos:0,   avgCost:0,     hasPos:false },
  { expiry:"OCT 16",  strike:41, dte:33, bid:1.44, ask:1.48, delta:0.614, pos:-6,  avgCost:1.038, hasPos:true  },
  { expiry:"OCT 16",  strike:42, dte:33, bid:0.95, ask:0.98, delta:0.479, pos:-1,  avgCost:0.906, hasPos:true  },
  { expiry:"OCT 16",  strike:43, dte:33, bid:0.61, ask:0.64, delta:0.350, pos:-1,  avgCost:0.676, hasPos:true  },
  // NOV 20 (68 DTE)
  { expiry:"NOV 20",  strike:39, dte:68, bid:3.20, ask:3.31, delta:0.750, pos:0,   avgCost:0,     hasPos:false },
  { expiry:"NOV 20",  strike:40, dte:68, bid:2.51, ask:2.60, delta:0.689, pos:-6,  avgCost:2.004, hasPos:true  },
  { expiry:"NOV 20",  strike:41, dte:68, bid:1.91, ask:2.00, delta:0.577, pos:0,   avgCost:0,     hasPos:false },
  { expiry:"NOV 20",  strike:42, dte:68, bid:1.43, ask:1.50, delta:0.504, pos:-2,  avgCost:1.261, hasPos:true  },
  { expiry:"NOV 20",  strike:43, dte:68, bid:1.05, ask:1.12, delta:0.411, pos:-3,  avgCost:0.759, hasPos:true  },
  { expiry:"NOV 20",  strike:44, dte:68, bid:0.75, ask:0.82, delta:0.325, pos:-3,  avgCost:0.519, hasPos:true  },
  { expiry:"NOV 20",  strike:45, dte:68, bid:0.53, ask:0.59, delta:0.234, pos:0,   avgCost:0,     hasPos:false },
  { expiry:"NOV 20",  strike:46, dte:68, bid:0.38, ask:0.44, delta:0.191, pos:0,   avgCost:0,     hasPos:false },
  // DEC 18 (96 DTE)
  { expiry:"DEC 18",  strike:40, dte:96, bid:2.75, ask:2.84, delta:0.668, pos:-5,  avgCost:1.916, hasPos:true  },
  { expiry:"DEC 18",  strike:42, dte:96, bid:1.69, ask:1.76, delta:0.505, pos:-2,  avgCost:1.416, hasPos:true  },
  { expiry:"DEC 18",  strike:44, dte:96, bid:0.98, ask:1.06, delta:0.350, pos:-2,  avgCost:0.936, hasPos:true  },
  { expiry:"DEC 18",  strike:45, dte:96, bid:0.74, ask:0.80, delta:0.285, pos:0,   avgCost:0,     hasPos:false },
  { expiry:"DEC 18",  strike:46, dte:96, bid:0.56, ask:0.62, delta:0.229, pos:-2,  avgCost:0.516, hasPos:true  },
  { expiry:"DEC 18",  strike:48, dte:96, bid:0.31, ask:0.37, delta:0.145, pos:0,   avgCost:0,     hasPos:false },
  // MAR 19 '27 (187 DTE)
  { expiry:"MAR 19",  strike:40, dte:187,bid:3.43, ask:3.54, delta:0.637, pos:-3,  avgCost:2.399, hasPos:true  },
  { expiry:"MAR 19",  strike:42, dte:187,bid:2.40, ask:2.51, delta:0.518, pos:-2,  avgCost:2.186, hasPos:true  },
  { expiry:"MAR 19",  strike:44, dte:187,bid:1.66, ask:1.74, delta:0.403, pos:-3,  avgCost:1.506, hasPos:true  },
  { expiry:"MAR 19",  strike:46, dte:187,bid:1.11, ask:1.19, delta:0.302, pos:-2,  avgCost:1.036, hasPos:true  },
  { expiry:"MAR 19",  strike:48, dte:187,bid:0.74, ask:0.81, delta:0.221, pos:-1,  avgCost:0.886, hasPos:true  },
  { expiry:"MAR 19",  strike:50, dte:187,bid:0.48, ask:0.55, delta:0.160, pos:-1,  avgCost:0.516, hasPos:true  },
  // JUN 18 '27 (278 DTE)
  { expiry:"JUN 18",  strike:48, dte:278,bid:1.15, ask:1.23, delta:0.270, pos:-1,  avgCost:1.186, hasPos:true  },
  { expiry:"JUN 18",  strike:50, dte:278,bid:0.83, ask:0.91, delta:0.210, pos:-2,  avgCost:0.816, hasPos:true  },
  { expiry:"JUN 18",  strike:55, dte:278,bid:0.36, ask:0.43, delta:0.111, pos:-2,  avgCost:0.386, hasPos:true  },
];

// ── MACRO FACTORS ────────────────────────────────────────────────────────────
const MACRO = [
  { factor:"Crude oil trend", signal:"Bullish", detail:"Shell +16.6% in 3 days implies Brent spiked to ~$110+. Goldman $120 scenario may be unfolding.", risk:"High" },
  { factor:"Geopolitical", signal:"Elevated", detail:"Hormuz tensions intensified over weekend Sep 11-13. OPEC+ unplanned cuts possible.", risk:"High" },
  { factor:"Q3 earnings", signal:"Watch", detail:"Oct 29 2026. Binary event within OCT expiry window — avoid short-dated calls.", risk:"Medium" },
  { factor:"Shell buyback", signal:"Positive", detail:"$3B quarterly buyback ongoing. Floor support. FCF strong at >$7B/quarter at $110 oil.", risk:"Low" },
  { factor:"Peace deal risk", signal:"Present", detail:"Any US-Iran ceasefire news = instant -10% oil reversal. Happened Apr 2026.", risk:"High" },
  { factor:"EUR/USD", signal:"Neutral", detail:"EUR strength partially caps EUR-denominated Shell gains. ~1.09 current.", risk:"Low" },
];

// ── COMPUTE SCORES ───────────────────────────────────────────────────────────
function scoreInstrument(inst) {
  const mid = (inst.bid + inst.ask) / 2;
  const otmPct = ((inst.strike - SPOT) / SPOT) * 100;
  const annYield = (mid / SPOT) * (365 / inst.dte) * 100;
  const pAssign = inst.delta * 100;
  const buffer = inst.strike - SPOT;
  // Risk-adjusted score: yield penalised by assignment probability and macro risk
  // Short DTE (<40d) penalised due to OCT earnings risk
  const dtePenalty = inst.dte < 40 ? 0.7 : inst.dte < 80 ? 0.9 : 1.0;
  const deltaPenalty = inst.delta > 0.45 ? 0 : inst.delta > 0.35 ? 0.75 : inst.delta > 0.25 ? 1.0 : 0.85;
  const score = annYield * dtePenalty * deltaPenalty * (otmPct > 0 ? 1 : 0);
  return { ...inst, mid, otmPct, annYield, pAssign, buffer, score };
}

const SCORED = ALL_INSTRUMENTS.map(scoreInstrument)
  .filter(d => d.otmPct > 0 && d.delta < 0.52)
  .sort((a, b) => b.score - a.score);

const TOP5 = SCORED.slice(0, 5);

// ── EXISTING POSITION HEALTH ─────────────────────────────────────────────────
const EXISTING = ALL_INSTRUMENTS
  .filter(d => d.hasPos && d.pos < 0)
  .map(d => {
    const mid = (d.bid + d.ask) / 2;
    const itm = SPOT - d.strike;
    const unrlPL = (d.avgCost - mid) * Math.abs(d.pos) * 100;
    const status = itm > 1.5 ? "CRITICAL" : itm > 0 ? "ITM" : itm > -1 ? "ATM" : "OTM";
    let action = "";
    if (status === "CRITICAL") action = "Roll UP urgently";
    else if (status === "ITM") action = "Roll UP this week";
    else if (status === "ATM") action = "Monitor — set alert";
    else action = "Hold / GTC close";
    return { ...d, mid, itm, unrlPL, status, action };
  })
  .sort((a, b) => b.itm - a.itm);

const EXPIRY_COLORS = { "OCT 16": "#1a5c38", "NOV 20": "#2d7d46", "DEC 18": "var(--accent)", "MAR 19": "#e8890c", "JUN 18": "#c0392b" };

const EUR = (n, d = 2) => `€${Number(n).toFixed(d)}`;
const PCT = n => `${Number(n).toFixed(1)}%`;

export default function ShellCoveredCallRanking() {
  const [activeTab, setTab] = useState("ranking");
  const [hovered, setHovered] = useState(null);

  const scatterData = SCORED.map(d => ({
    delta: +(d.delta * 100).toFixed(1),
    yield: +d.annYield.toFixed(1),
    label: `${d.expiry} €${d.strike}C`,
    score: d.score,
    isTop: TOP5.some(t => t.expiry === d.expiry && t.strike === d.strike),
    color: EXPIRY_COLORS[d.expiry] || "#888",
  }));

  const totalUnrl = EXISTING.reduce((s, d) => s + d.unrlPL, 0);
  const totalCritical = EXISTING.filter(d => d.status === "CRITICAL" || d.status === "ITM").length;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .tab { background: transparent; border: none; padding: 10px 20px; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 500; color: var(--muted); border-bottom: 2px solid transparent; transition: all 0.15s; letter-spacing: 0.01em; }
        .tab.on { color: var(--text-primary); border-bottom-color: var(--accent); }
        .tab:hover { color: var(--text-primary); }
        .pill { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; }
        tr { transition: background 0.1s; }
        .trow:hover { background: var(--surface) !important; }
        ::-webkit-scrollbar { height: 4px; width: 4px; }
        ::-webkit-scrollbar-track { background: var(--border); }
        ::-webkit-scrollbar-thumb { background: var(--accent); }
      `}</style>

      {/* ── SHELL HEADER ── */}
      <div style={{ background: "var(--header-bg)", color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ padding: "20px 28px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <div style={{ background: "var(--accent)", color: "var(--card)", padding: "3px 10px", fontWeight: 700, fontSize: 13, borderRadius: 2 }}>SHEL.AS</div>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.03em" }}>Euronext Amsterdam · RD Options · FTA · Sep 13 2026</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span className="mono" style={{ fontSize: 38, fontWeight: 600, color: "var(--accent)", lineHeight: 1 }}>€41.655</span>
                <span style={{ fontSize: 13, color: "var(--green)" }}>+€0.370 +0.90% today</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>1,800 shares · avg €0.628</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                ⚠ Shell +16.6% in 3 sessions (€35.72 → €41.655) — oil spike environment. 52W high: €41.33 → now ABOVE record.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, textAlign: "right" }}>
              {[
                { l: "Unrealised (physical)", v: EUR((SPOT - 0.62819) * 1800, 0), c: "var(--green)" },
                { l: "Options book P&L", v: EUR(totalUnrl, 0), c: totalUnrl >= 0 ? "var(--green)" : "#e07050" },
                { l: "Positions in distress", v: `${totalCritical} legs`, c: totalCritical > 5 ? "#e07050" : "var(--accent)" },
              ].map(m => (
                <div key={m.l}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>{m.l}</div>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginTop: 16, borderBottom: "1px solid #1a5c38" }}>
            {["ranking", "scatter", "book health", "macro"].map(t => (
              <button key={t} className={`tab ${activeTab === t ? "on" : ""}`} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 28px" }}>

        {/* ── RANKING TAB ── */}
        {activeTab === "ranking" && (
          <div>
            {/* Top 5 podium */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
              {TOP5.map((inst, i) => {
                const medals = ["★", "✦", "◆", "●", "○"];
                const colors = ["var(--accent)", "#c8c8c0", "#c8814a", "#4a6a5a", "#6a7a6a"];
                return (
                  <div key={`${inst.expiry}-${inst.strike}`} style={{
                    background: i === 0 ? "var(--surface)" : "var(--card)",
                    border: `1.5px solid ${i === 0 ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 6, padding: "14px 12px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 16, color: colors[i] }}>{medals[i]}</span>
                      <span className="mono" style={{ fontSize: 10, color: i === 0 ? "var(--text-secondary)" : "#8a7e6a" }}>#{i + 1} SCORE</span>
                    </div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: i === 0 ? "var(--accent)" : "#1a2e24", marginBottom: 2 }}>
                      {inst.expiry} €{inst.strike}C
                    </div>
                    <div style={{ fontSize: 10, color: i === 0 ? "var(--text-secondary)" : "var(--muted)", marginBottom: 10 }}>
                      {inst.dte} DTE · {EXPIRY_COLORS[inst.expiry] ? inst.expiry : ""}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {[
                        { l: "Bid", v: EUR(inst.bid) },
                        { l: "Yield pa", v: PCT(inst.annYield) },
                        { l: "Delta", v: inst.delta.toFixed(3) },
                        { l: "OTM", v: PCT(inst.otmPct) },
                      ].map(m => (
                        <div key={m.l}>
                          <div style={{ fontSize: 9, color: i === 0 ? "var(--text-secondary)" : "#a09080" }}>{m.l}</div>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? "#f4f2ed" : "#1a2e24" }}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full ranking table */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface)", borderBottom: "2px solid var(--border)" }}>
                    {["", "Instrument", "Bid", "Ask", "Mid", "DTE", "OTM%", "Buffer", "Delta", "P(assign)", "Ann. Yield", "Score", "Macro view"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: i <= 1 ? "left" : "right", fontSize: 10, fontWeight: 600, color: "#3a5040", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCORED.map((inst, idx) => {
                    const isTop = idx < 5;
                    const rank = idx + 1;
                    const rColor = inst.delta < 0.25 ? "var(--muted)" : inst.delta < 0.35 ? "var(--green)" : inst.delta < 0.45 ? "var(--accent)" : "#c0392b";
                    return (
                      <tr key={`${inst.expiry}-${inst.strike}`} className="trow"
                        style={{ borderBottom: "1px solid var(--border)", background: isTop ? "var(--surface)" : "transparent" }}>
                        <td style={{ padding: "7px 10px" }}>
                          {isTop && <span style={{ fontSize: 10, color: "var(--header-bg)", fontWeight: 700 }}>#{rank}</span>}
                        </td>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontWeight: isTop ? 600 : 400, color: "#1a2e24" }}>
                            {inst.expiry} €{inst.strike}C
                          </span>
                          {inst.hasPos && <span className="pill" style={{ marginLeft: 6, background: "var(--green-bg)", color: "var(--green)" }}>held {inst.pos}</span>}
                        </td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right", color: "#2a4a32", fontWeight: 500 }}>{EUR(inst.bid)}</td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right", color: "#8a7e6a" }}>{EUR(inst.ask)}</td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right" }}>{EUR(inst.mid)}</td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right", color: "var(--muted)" }}>{inst.dte}d</td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right", color: "var(--green)", fontWeight: 500 }}>+{PCT(inst.otmPct)}</td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right" }}>{EUR(inst.buffer)}</td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right", color: rColor, fontWeight: 600 }}>{inst.delta.toFixed(3)}</td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right", color: rColor }}>{PCT(inst.pAssign)}</td>
                        <td className="mono" style={{ padding: "7px 10px", textAlign: "right", fontWeight: isTop ? 700 : 400, color: isTop ? "var(--header-bg)" : "var(--text-secondary)" }}>{PCT(inst.annYield)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>
                          <div style={{ display: "inline-block", width: Math.max(4, Math.min(60, inst.score * 4)), height: 6, background: isTop ? "var(--accent)" : "var(--border)", borderRadius: 3 }} />
                        </td>
                        <td style={{ padding: "7px 10px", fontSize: 10, color: "var(--muted)", maxWidth: 160 }}>
                          {inst.dte < 40 ? "Caution: earnings Oct 29" :
                           inst.delta < 0.25 ? "Low risk — income layer" :
                           inst.delta < 0.35 ? "Balanced — recommended" :
                           "Moderate — sell on dips"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Recommendation narrative */}
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "var(--header-bg)", color: "var(--text-primary)", padding: "18px 20px", borderRadius: 6, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 10 }}>Top recommendation: DEC 44C</div>
                <div style={{ fontSize: 12, lineHeight: 1.75, color: "var(--text-secondary)" }}>
                  At bid €0.98, 96 DTE, delta 0.350 and 5.6% OTM — the DEC 44C is the optimal balance across every dimension. The 96-day theta window is the most efficient decay zone. The €2.345 buffer means Shell must rally a further 5.6% above an already above-record price. At 8.9% annualised yield, it is the highest-scoring instrument that clears all three risk gates: delta below 0.35, OTM above 5%, and DTE above 60 days.
                </div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", padding: "18px 20px", borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--header-bg)", marginBottom: 10 }}>Why avoid OCT expiry for new positions</div>
                <div style={{ fontSize: 12, lineHeight: 1.75, color: "var(--text-secondary)" }}>
                  Q3 2026 earnings are released October 29 — inside the OCT 16 window for any roll you might open now. Shell's Q2 blowout was followed by a sell-off. Q3 at $110 oil will likely beat again, but the reaction is binary and unpredictable. The 33 DTE window gives you no time to roll out of a squeeze. For new money, start at NOV minimum, with DEC and MAR as the preferred targets.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SCATTER TAB ── */}
        {activeTab === "scatter" && (
          <div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "18px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--header-bg)", marginBottom: 4 }}>Yield vs Assignment Probability · All OTM Instruments</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
                Optimal zone: high yield, low delta. Target the top-left quadrant. Circle size = buffer distance from spot.
              </div>
              <div style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ede9e0" />
                    <XAxis dataKey="delta" type="number" name="P(assign)" stroke="#a09080" fontSize={10}
                      label={{ value: "Assignment probability %", position: "insideBottom", offset: -10, fontSize: 11, fill: "var(--muted)" }}
                      domain={[10, 55]} tickFormatter={v => `${v}%`} />
                    <YAxis dataKey="yield" type="number" name="Ann. Yield" stroke="#a09080" fontSize={10}
                      label={{ value: "Annualised yield %", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "var(--muted)" }}
                      domain={[0, 20]} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                      formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n === "yield" ? "Ann. Yield" : "P(assign)"]}
                      labelFormatter={() => ""} content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        if (!d) return null;
                        return (
                          <div style={{ background: "var(--card)", border: "1px solid var(--border)", padding: "8px 10px", fontSize: 11 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
                            <div>Yield: {d.yield.toFixed(1)}% pa</div>
                            <div>P(assign): {d.delta.toFixed(1)}%</div>
                          </div>
                        );
                      }} />
                    <ReferenceLine x={35} stroke="var(--accent)" strokeDasharray="4 3" label={{ value: "Delta 0.35 threshold", fill: "var(--accent)", fontSize: 10 }} />
                    <ReferenceLine y={8} stroke="var(--header-bg)" strokeDasharray="4 3" label={{ value: "8% yield target", fill: "var(--header-bg)", fontSize: 10 }} />
                    <Scatter data={scatterData} shape={(props) => {
                      const { cx, cy, payload } = props;
                      const r = payload.isTop ? 9 : 6;
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={r} fill={payload.color} opacity={payload.isTop ? 1 : 0.5} stroke={payload.isTop ? "var(--accent)" : "none"} strokeWidth={payload.isTop ? 2 : 0} />
                          {payload.isTop && <text x={cx + 10} y={cy + 4} fontSize={9} fill="var(--header-bg)" fontFamily="IBM Plex Mono">{payload.label.split(" ")[1]}</text>}
                        </g>
                      );
                    }} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                {Object.entries(EXPIRY_COLORS).map(([expiry, color]) => (
                  <div key={expiry} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                    <span style={{ color: "var(--muted)" }}>{expiry}</span>
                  </div>
                ))}
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>Starred ✦ = top 5 recommendations</span>
              </div>
            </div>

            {/* Bar chart of yields */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--header-bg)", marginBottom: 14 }}>Annualised Yield Ranking · All OTM Candidates</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={SCORED.map(d => ({ label: `${d.expiry} €${d.strike}`, yield: +d.annYield.toFixed(1), delta: d.delta, expiry: d.expiry }))}
                    margin={{ top: 5, right: 10, bottom: 40, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ede9e0" />
                    <XAxis dataKey="label" stroke="#a09080" fontSize={8} angle={-35} textAnchor="end" interval={0} />
                    <YAxis stroke="#a09080" fontSize={10} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }}
                      formatter={(v) => [`${v}%`, "Ann. Yield"]} />
                    <Bar dataKey="yield" radius={[2, 2, 0, 0]}>
                      {SCORED.map((entry, index) => (
                        <Cell key={index} fill={EXPIRY_COLORS[entry.expiry] || "#888"} opacity={index < 5 ? 1 : 0.45} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── BOOK HEALTH ── */}
        {activeTab === "book health" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
              {[
                { l: "Total contracts short", v: `${EXISTING.reduce((s,d) => s + Math.abs(d.pos), 0)}`, c: "var(--header-bg)" },
                { l: "Shares covered", v: `${EXISTING.reduce((s,d) => s + Math.abs(d.pos), 0) * 100}`, c: "var(--header-bg)" },
                { l: "ITM / Critical legs", v: `${EXISTING.filter(d => d.status === "CRITICAL" || d.status === "ITM").length}`, c: "#c0392b" },
                { l: "Book unrealised P&L", v: EUR(totalUnrl, 0), c: totalUnrl >= 0 ? "var(--green)" : "#c0392b" },
              ].map(m => (
                <div key={m.l} style={{ background: "var(--card)", border: "1px solid var(--border)", padding: "14px 16px", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{m.l}</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f0ece2", borderBottom: "2px solid var(--header-bg)" }}>
                    {["Position", "Qty", "Avg Cost", "Live Bid", "ITM/OTM", "Delta", "Unrl P&L", "Status", "Recommended Action"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: h === "Position" || h === "Status" || h === "Recommended Action" ? "left" : "right", fontSize: 10, fontWeight: 600, color: "#3a5040" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EXISTING.map(d => {
                    const statusColors = { CRITICAL: ["#fef2f2", "#c0392b"], ITM: ["var(--card)8f0", "#e07050"], ATM: ["#fefef0", "#c09020"], OTM: ["#f4f9f6", "var(--green)"] };
                    const [bg, fc] = statusColors[d.status] || ["var(--card)", "#333"];
                    return (
                      <tr key={`${d.expiry}-${d.strike}`} className="trow" style={{ borderBottom: "1px solid var(--border)", background: d.status === "CRITICAL" ? "var(--red-bg)" : "transparent" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1a2e24", whiteSpace: "nowrap" }}>{d.expiry} €{d.strike}C</td>
                        <td className="mono" style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-secondary)" }}>{d.pos}</td>
                        <td className="mono" style={{ padding: "8px 10px", textAlign: "right" }}>{EUR(d.avgCost)}</td>
                        <td className="mono" style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>{EUR(d.bid)}</td>
                        <td className="mono" style={{ padding: "8px 10px", textAlign: "right", color: d.itm > 0 ? "#c0392b" : "var(--green)", fontWeight: 600 }}>
                          {d.itm > 0 ? `+${EUR(d.itm)} ITM` : `${EUR(Math.abs(d.itm))} OTM`}
                        </td>
                        <td className="mono" style={{ padding: "8px 10px", textAlign: "right", color: d.delta > 0.5 ? "#c0392b" : d.delta > 0.35 ? "#e07050" : "var(--green)" }}>{d.delta.toFixed(3)}</td>
                        <td className="mono" style={{ padding: "8px 10px", textAlign: "right", color: d.unrlPL >= 0 ? "var(--green)" : "#c0392b", fontWeight: 500 }}>
                          {d.unrlPL >= 0 ? "+" : ""}{EUR(d.unrlPL, 0)}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ background: bg, color: fc, padding: "2px 7px", borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{d.status}</span>
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: d.status === "CRITICAL" ? "#c0392b" : "var(--text-secondary)", fontWeight: d.status === "CRITICAL" ? 600 : 400 }}>{d.action}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Roll guidance */}
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "#fef2f2", border: "1px solid #f0c0b0", borderRadius: 6, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#c0392b", marginBottom: 8 }}>Critical rolls — execute this week</div>
                {EXISTING.filter(d => d.status === "CRITICAL" || d.status === "ITM").map(d => (
                  <div key={`${d.expiry}-${d.strike}`} style={{ fontSize: 11, color: "#7a2a1a", marginBottom: 6, lineHeight: 1.5 }}>
                    <strong>{d.expiry} €{d.strike}C ({d.pos})</strong> · ITM {EUR(d.itm)} · delta {d.delta.toFixed(2)}
                    → Roll to <strong>{d.dte < 70 ? "DEC/MAR" : "MAR/JUN"} €{d.strike + 4}–{d.strike + 6}C</strong>
                  </div>
                ))}
              </div>
              <div style={{ background: "#f4f9f6", border: "1px solid #a0d0b0", borderRadius: 6, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", marginBottom: 8 }}>Positions to hold / harvest</div>
                {EXISTING.filter(d => d.status === "OTM").map(d => (
                  <div key={`${d.expiry}-${d.strike}`} style={{ fontSize: 11, color: "#2a4a32", marginBottom: 6, lineHeight: 1.5 }}>
                    <strong>{d.expiry} €{d.strike}C ({d.pos})</strong> · OTM {EUR(Math.abs(d.itm))} · P&L {d.unrlPL >= 0 ? "+" : ""}{EUR(d.unrlPL, 0)}
                    · <span style={{ color: "var(--green)" }}>GTC close at 70% profit</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── MACRO TAB ── */}
        {activeTab === "macro" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
              {[
                { label: "Shell 3-day move", val: "+16.6%", sub: "€35.72 → €41.655", color: "#c0392b" },
                { label: "Implied Brent target", val: "~$110–115", sub: "back-calculated from beta 0.50", color: "#e07050" },
                { label: "New 52-week high", val: "€41.66", sub: "vs prior record €41.33", color: "var(--accent)" },
              ].map(m => (
                <div key={m.label} style={{ background: "var(--header-bg)", border: "1px solid var(--border)", padding: "16px 18px", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>{m.label}</div>
                  <div className="mono" style={{ fontSize: 24, fontWeight: 600, color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 3 }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {MACRO.map(m => (
              <div key={m.factor} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 18px", marginBottom: 10, display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1a2e24", marginBottom: 3 }}>{m.factor}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3,
                    background: m.risk === "High" ? "#fef2f2" : m.risk === "Medium" ? "var(--card)8f0" : "#f4f9f6",
                    color: m.risk === "High" ? "#c0392b" : m.risk === "Medium" ? "#e07050" : "var(--green)"
                  }}>{m.signal} · {m.risk}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>{m.detail}</div>
              </div>
            ))}

            {/* Strike choice in macro context */}
            <div style={{ background: "var(--header-bg)", borderRadius: 6, padding: "18px 20px", marginTop: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 10 }}>How macro shapes the strike selection</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, fontSize: 12, lineHeight: 1.75, color: "var(--text-secondary)" }}>
                <div>
                  <strong style={{ color: "#f4f2ed" }}>If oil holds $110+ (escalation continues):</strong> Shell may push toward €43–44. All €40–42 strikes are at severe assignment risk. New positions should be at €45C or higher — the NOV 45C (delta 0.234, bid €0.53) becomes the safest income vehicle. The MAR 46C (bid €1.11) is the best long-dated option.
                </div>
                <div>
                  <strong style={{ color: "#f4f2ed" }}>If peace deal reverses the spike (base case):</strong> Shell falls back to €37–39. Existing ITM positions self-heal rapidly. The DEC 44C (5.6% OTM at current spot) becomes deeply comfortable. The rally was the opportunity to roll up all €40 strikes — if you have not done so, execute Monday morning.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
