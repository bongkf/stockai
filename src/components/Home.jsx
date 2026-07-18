import React from "react";
import { Link } from "react-router-dom";
import { useOptPilotAuth } from "../context/OptPilotAuthContext.jsx";

export default function Home() {
  const { ready, user, openDialog, logout, busy, authError } = useOptPilotAuth();

  return (
    <div className="home-container">
      <div className="home-inner">
        <header className="home-header">
          <h1 className="home-title">StockAI Dashboards</h1>
          <p className="home-sub">Choose a dashboard to start.</p>
        </header>

        <section className="home-auth-card">
          <div>
            <div className="home-auth-title">OptPilot Access</div>
            <div className="home-auth-sub">
              {ready ? (user ? `Signed in as ${user.displayName || user.email || user.uid}` : "Not signed in") : "Loading auth runtime..."}
            </div>
            {authError ? <div className="home-auth-error">{authError}</div> : null}
          </div>

          <div className="home-auth-actions">
            <button type="button" className="card-btn primary" onClick={openDialog} disabled={!ready || busy}>
              {user ? "Manage Login" : "Login / Logout"}
            </button>
            <button type="button" className="card-btn" onClick={logout} disabled={!user || busy}>
              Logout
            </button>
          </div>
        </section>

        <div className="home-actions">
          <Link to="/montecarlo" className="card-btn">Monte Carlo Simulator</Link>
          <Link to="/shellrd" className="card-btn">RD Covered Calls</Link>
          <Link to="/optpilot" className="card-btn">OptPilot Weekly Options Dashboard</Link>
          <Link to="/sp500-scorecard" className="card-btn">S&amp;P 500 Long-DTE Scorecard</Link>
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
