import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import MonteCarlo from "./components/MonteCarlo.jsx";
import ShellRD from "./components/ShellRD.jsx";
import Home from "./components/Home.jsx";
import OptPilotDashboard from "./components/OptPilotDashboard.jsx";
import SP500LongDTEScorecard from "./components/SP500LongDTEScorecard.jsx";
import OptPilotAuthDialog from "./components/OptPilotAuthDialog.jsx";
import { OptPilotAuthProvider } from "./context/OptPilotAuthContext.jsx";

export default function App() {
  return (
    <OptPilotAuthProvider>
      <BrowserRouter>
        <div className="app-root">
          <header className="app-header">
            <nav>
              <Link to="/" className="home-link">Home</Link>
            </nav>
          </header>

          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/montecarlo" element={<MonteCarlo />} />
              <Route path="/shellrd" element={<ShellRD />} />
              <Route path="/optpilot" element={<OptPilotDashboard />} />
              <Route path="/sp500-scorecard" element={<SP500LongDTEScorecard />} />
            </Routes>
          </main>

          <OptPilotAuthDialog />
        </div>
      </BrowserRouter>
    </OptPilotAuthProvider>
  );
}
