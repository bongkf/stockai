import React from "react";

export default function Home({ onSelect }) {
  return (
    <div style={{ padding: 28, minHeight: "100vh", background: "#f7fafc" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>StockAI Dashboards</h1>
          <p style={{ marginTop: 8, color: "#475569" }}>Choose a dashboard to start.</p>
        </header>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => onSelect("montecarlo")}
            style={{ padding: "14px 18px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", minWidth: 220 }}
          >
            Monte Carlo Simulator
          </button>

          <button
            onClick={() => onSelect("shellrd")}
            style={{ padding: "14px 18px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", minWidth: 220 }}
          >
            RD Covered Calls
          </button>
        </div>

        <section style={{ marginTop: 28, color: "#475569", fontSize: 13 }}>
          <p>
            Use the buttons above to start a dashboard. Click <strong>Home</strong> in the top-left while in a
            dashboard to return here.
          </p>
        </section>
      </div>
    </div>
  );
}
