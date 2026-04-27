import React, { useState } from "react";
import MonteCarlo from "../montecarlo-shell.jsx";
import ShellRD from "../shell-rd-covered-calls.jsx";
import Home from "./Home.jsx";

export default function App() {
	const [view, setView] = useState("home");

	return (
		<div style={{ minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
			{view === "home" ? (
				<Home onSelect={(v) => setView(v)} />
			) : (
				<div>
					<div style={{ padding: 12 }}>
						<button
							onClick={() => setView("home")}
							style={{
								padding: "8px 12px",
								borderRadius: 6,
								border: "1px solid #ddd",
								background: "#fff",
								cursor: "pointer",
							}}
						>
							← Home
						</button>
					</div>

					<div>
						{view === "montecarlo" && <MonteCarlo />}
						{view === "shellrd" && <ShellRD />}
					</div>
				</div>
			)}
		</div>
	);
}
