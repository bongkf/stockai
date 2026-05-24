import { buildOptpilotAuthHeaders, getCurrentUser, getOptpilotTestUserConfig } from "./optpilotFirebaseAuth.js";

export function resolveOptpilotUserId(userKey) {
  const key = String(userKey || "A").toUpperCase();
  return getOptpilotTestUserConfig(key).uid || key;
}

function pathFromTemplate(template, userId) {
  return String(template || "").replaceAll("{user}", userId);
}

export function resolveOptpilotCollectionPath(userKey) {
  const key = String(userKey || "A").toUpperCase();
  const userId = resolveOptpilotUserId(key);
  const explicit = import.meta.env[`OPTPILOT_TRADES_COLLECTION_PATH_${key}`];
  if (explicit) return explicit;
  const template = import.meta.env.OPTPILOT_TRADES_COLLECTION_TEMPLATE || "Optpilot/{user}/Portfolio.Trades";
  return pathFromTemplate(template, userId);
}

export function resolveOptpilotDocPath(userKey) {
  const key = String(userKey || "A").toUpperCase();
  const userId = resolveOptpilotUserId(key);
  const explicit = import.meta.env[`OPTPILOT_TRADES_DOC_PATH_${key}`];
  if (explicit) return explicit;
  const template = import.meta.env.OPTPILOT_TRADES_DOC_TEMPLATE || "Optpilot/{user}/trades.json";
  return pathFromTemplate(template, userId);
}

function normalizeTradeRows(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.trades)) return payload.trades.filter((row) => row && typeof row === "object");
  if (Array.isArray(payload.rows)) return payload.rows.filter((row) => row && typeof row === "object");
  return [];
}

export async function loadOptpilotTradeRows(input) {
  const options = typeof input === "object" && input !== null ? input : { userKey: input };
  const headers = await buildOptpilotAuthHeaders(options);
  const response = await fetch("/api/trades", {
    headers,
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new Error("Authentication required. Please log in from Home.");
  }
  if (response.status === 403) {
    throw new Error("Signed-in user does not match the selected test user.");
  }
  if (!response.ok) {
    throw new Error(`Trade load failed: ${response.status}`);
  }

  const payload = await response.json();
  const rows = normalizeTradeRows(payload);
  const currentUser = await getCurrentUser().catch(() => null);
  const authUid = String(payload?.uid || options.uid || currentUser?.uid || resolveOptpilotUserId(options.userKey)).trim();
  const sourcePath = payload?.collection && authUid
    ? `${payload.collection}/${authUid}`
    : resolveOptpilotCollectionPath(options.userKey);

  if (!rows.length) {
    throw new Error("No trade rows found for the signed-in user.");
  }

  return {
    rows,
    sourcePath,
    sourceType: "api-trades",
    authEnabled: true,
    authUid,
    authLogin: currentUser?.email || currentUser?.displayName || "",
  };
}
