function normalizeExpiryRows(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.availableExpiries)) {
    return payload.availableExpiries.filter((value) => typeof value === "string" && value.trim());
  }
  if (Array.isArray(payload.expiries)) {
    return payload.expiries.filter((value) => typeof value === "string" && value.trim());
  }
  return [];
}

export async function loadOptpilotOptionExpiries(symbol) {
  const rawSymbol = String(symbol || "").trim();
  if (!rawSymbol) {
    throw new Error("Missing ticker symbol");
  }

  const response = await fetch(`/api/options/expiries?symbol=${encodeURIComponent(rawSymbol)}`, {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`Options availability failed: ${response.status}`);
  }

  const payload = await response.json();
  const availableExpiries = normalizeExpiryRows(payload);

  return {
    symbol: String(payload?.symbol || rawSymbol).trim().toUpperCase(),
    requestedSymbol: String(payload?.requestedSymbol || rawSymbol).trim().toUpperCase(),
    availableExpiries,
    optionCount: Number(payload?.optionCount || availableExpiries.length || 0),
    source: String(payload?.source || "yahoo-options"),
    checkedAt: String(payload?.checkedAt || ""),
    error: String(payload?.error || ""),
  };
}
