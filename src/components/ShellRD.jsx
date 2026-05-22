import { useMemo, useState } from "react";

function erf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX));
  return sign * y;
}

function N(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function bs(S, K, T, r, sig) {
  if (T <= 0) {
    return {
      call: Math.max(S - K, 0),
      delta: S > K ? 1 : 0,
      prob: S > K ? 1 : 0,
      theta: 0,
      vega: 0,
    };
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * T) / (sig * Math.sqrt(T));
  const d2 = d1 - sig * Math.sqrt(T);

  return {
    call: S * N(d1) - K * Math.exp(-r * T) * N(d2),
    delta: N(d1),
    prob: N(d2),
    theta: (-S * normPDF(d1) * sig / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * N(d2)) / 365,
    vega: (S * normPDF(d1) * Math.sqrt(T)) / 100,
  };
}

const SPOT = 39;
const SHARES = 500;
const RFR = 0.035;

const EXPIRIES = [
  { id: "may", label: "May 15", days: 18, T: 18 / 365 },
  { id: "jun", label: "Jun 19", days: 53, T: 53 / 365 },
  { id: "jul", label: "Jul 17", days: 81, T: 81 / 365 },
  { id: "sep", label: "Sep 18", days: 144, T: 144 / 365 },
  { id: "dec", label: "Dec 18", days: 235, T: 235 / 365 },
];

const RECOMMENDED = {
  may: 40,
  jun: 41,
  jul: 42,
  sep: 43,
  dec: 45,
};

function EUR(n, dec = 2) {
  return `€${n.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

export default function ShellRD() {
  const [iv, setIv] = useState(0.22);

  const rows = useMemo(() => {
    return EXPIRIES.map((exp) => {
      const strike = RECOMMENDED[exp.id];
      const out = bs(SPOT, strike, exp.T, RFR, iv);
      const premium = out.call * SHARES;
      const annualizedYield = (out.call / SPOT) * (365 / exp.days) * 100;
      return {
        ...exp,
        strike,
        premium,
        annualizedYield,
        prob: out.prob,
      };
    });
  }, [iv]);

  const totalPremium = rows.reduce((sum, r) => sum + r.premium, 0);

  return (
    <div className="shellrd-root">
      <div className="shellrd-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <div className="serif" style={{ fontSize: "22px", letterSpacing: "-0.01em" }}>
              Shell RD Covered Call Strategy
            </div>
            <div className="sans" style={{ fontSize: "12px", color: "#a89060", marginTop: "4px" }}>
              Spot €{SPOT} · 500 Shares · 5 Contract Ladder
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: "10px", color: "#6b5030", marginBottom: "4px" }}>
              TOTAL PROJECTED PREMIUM
            </div>
            <div className="mono" style={{ fontSize: "26px", fontWeight: "500", color: "#fbbf24" }}>{EUR(totalPremium)}</div>
          </div>
        </div>
      </div>

      <div className="shellrd-body" style={{ padding: "20px 28px" }}>
        <div className="card-section" style={{ marginBottom: "14px" }}>
          <label htmlFor="iv" style={{ display: "block", marginBottom: "8px", fontFamily: "DM Sans, sans-serif", fontSize: "12px" }}>
            Implied Volatility: {(iv * 100).toFixed(1)}%
          </label>
          <input
            id="iv"
            type="range"
            min="0.12"
            max="0.5"
            step="0.01"
            value={iv}
            onChange={(e) => setIv(Number(e.target.value))}
          />
        </div>

        <div className="card-section" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif", fontSize: "12px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px" }}>Expiry</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Strike</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Premium</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Ann. Yield</th>
                <th style={{ textAlign: "left", padding: "8px" }}>Assignment Prob.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row-hover">
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.label}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>€{r.strike.toFixed(2)}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{EUR(r.premium)}</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{r.annualizedYield.toFixed(1)}%</td>
                  <td style={{ padding: "8px", borderTop: "1px solid #e8dcc8" }}>{(r.prob * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
