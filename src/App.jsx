import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import MonteCarlo from "./components/MonteCarlo.jsx";
import ShellRD from "./components/ShellRD.jsx";
import Home from "./components/Home.jsx";

export default function App() {
  return (
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
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
