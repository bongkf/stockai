import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="home-container">
      <div className="home-inner">
        <header className="home-header">
          <h1 className="home-title">StockAI Dashboards</h1>
          <p className="home-sub">Choose a dashboard to start.</p>
        </header>

        <div className="home-actions">
          <Link to="/montecarlo" className="card-btn">Monte Carlo Simulator</Link>
          <Link to="/shellrd" className="card-btn">RD Covered Calls</Link>
        </div>

        <section className="home-note">
          <p>
            Use the buttons above to start a dashboard. Click <strong className="home-link">Home</strong> in the top-left while in a
            dashboard to return here.
          </p>
        </section>
      </div>
    </div>
  );
}
