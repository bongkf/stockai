import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import MonteCarlo from "./components/MonteCarlo.jsx";
import ShellRD from "./components/ShellRD.jsx";
import Home from "./components/Home.jsx";
import OptPilotDashboard from "./components/OptPilotDashboard.jsx";
import SP500LongDTEScorecard from "./components/SP500LongDTEScorecard.jsx";
import ShellCoveredCallRanking from "./components/ShellCoveredCallRanking.jsx";
import OptPilotAuthDialog from "./components/OptPilotAuthDialog.jsx";
import { OptPilotAuthProvider } from "./context/OptPilotAuthContext.jsx";
import { ThemeProvider, useTheme } from "./context/ThemeContext.jsx";

function HeaderWithTheme() {
  const { theme, toggleTheme } = useTheme();

  const getThemeIcon = () => {
    if (theme === "system") return "🖥️";
    if (theme === "dark") return "🌙";
    return "☀️";
  };

  const getThemeLabel = () => {
    if (theme === "system") return "System";
    if (theme === "dark") return "Dark";
    return "Light";
  };

  return (
    <header className="app-header">
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <Link to="/" className="home-link">StockAI Dashboards</Link>
        <button
          onClick={toggleTheme}
          className="theme-toggle-btn"
          title={`Switch theme (currently: ${getThemeLabel()})`}
          style={{
            background: "transparent",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "inherit",
            cursor: "pointer",
            padding: "6px 12px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "rgba(255, 255, 255, 0.1)";
            e.target.style.borderColor = "rgba(255, 255, 255, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "transparent";
            e.target.style.borderColor = "rgba(255, 255, 255, 0.2)";
          }}
        >
          <span>{getThemeIcon()}</span>
          <span>{getThemeLabel()}</span>
        </button>
      </nav>
    </header>
  );
}

function AppContent() {
  return (
    <div className="app-root">
      <HeaderWithTheme />

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/montecarlo" element={<MonteCarlo />} />
          <Route path="/shellrd" element={<ShellRD />} />
          <Route path="/optpilot" element={<OptPilotDashboard />} />
          <Route path="/sp500-scorecard" element={<SP500LongDTEScorecard />} />
          <Route path="/shell-covered-call-ranking" element={<ShellCoveredCallRanking />} />
        </Routes>
      </main>

      <OptPilotAuthDialog />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <OptPilotAuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </OptPilotAuthProvider>
    </ThemeProvider>
  );
}
