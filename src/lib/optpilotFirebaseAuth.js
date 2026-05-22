import { initializeApp, getApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

const state = {
  ready: false,
  enabled: false,
  error: null,
  config: null,
  app: null,
  auth: null,
};

function env(name, fallback = "") {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : fallback;
}

function envFlag(name, fallback = false) {
  const value = String(import.meta.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function buildClientConfig() {
  const projectId = env("FIREBASE_PROJECT_ID");
  const authDomain = env("FIREBASE_AUTH_DOMAIN", projectId ? `${projectId}.firebaseapp.com` : "");
  const storageBucket = env("FIREBASE_STORAGE_BUCKET", projectId ? `${projectId}.appspot.com` : "");

  const missing = [];
  if (!env("FIREBASE_WEB_API_KEY")) missing.push("FIREBASE_WEB_API_KEY");
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!authDomain) missing.push("FIREBASE_AUTH_DOMAIN");

  return {
    enabled: envFlag("USE_FIREBASE_AUTH", false),
    configured: missing.length === 0,
    missing,
    firebase: {
      apiKey: env("FIREBASE_WEB_API_KEY"),
      authDomain,
      projectId,
      appId: env("FIREBASE_APP_ID"),
      storageBucket,
      messagingSenderId: env("FIREBASE_MESSAGING_SENDER_ID"),
      authEmulatorHost: env("FIREBASE_AUTH_EMULATOR_HOST"),
    },
  };
}

export function getOptpilotTestUserConfig(userKey) {
  const key = String(userKey || "A").toUpperCase();
  return {
    key,
    uid: env(`OPTPILOT_E2E_FIREBASE_USER_${key}_UID`),
    email: env(`OPTPILOT_E2E_FIREBASE_USER_${key}_EMAIL`),
    password: env(`OPTPILOT_E2E_FIREBASE_USER_${key}_PASSWORD`),
  };
}

async function fetchRuntimeConfig() {
  try {
    const response = await fetch("/api/firebase/config", { credentials: "same-origin" });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") return null;
    if (!payload.firebase || typeof payload.firebase !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function initializeOptpilotFirebaseAuth() {
  if (state.ready) return state;

  try {
    const runtimePayload = await fetchRuntimeConfig();
    const cfg = runtimePayload
      ? {
          enabled: !!runtimePayload.runtimeEnabled,
          configured: !!runtimePayload.firebase?.configured,
          missing: Array.isArray(runtimePayload.firebase?.missingFields) ? runtimePayload.firebase.missingFields : [],
          firebase: runtimePayload.firebase,
        }
      : buildClientConfig();

    state.config = cfg.firebase;
    state.enabled = cfg.enabled && cfg.configured;

    if (!cfg.enabled) {
      state.error = "USE_FIREBASE_AUTH is disabled.";
    } else if (!cfg.configured) {
      state.error = `Firebase auth config missing fields: ${cfg.missing.join(", ")}`;
    } else {
      state.app = getApps().length ? getApp() : initializeApp(cfg.firebase);
      state.auth = getAuth(state.app);

      if (cfg.firebase.authEmulatorHost) {
        connectAuthEmulator(state.auth, `http://${cfg.firebase.authEmulatorHost}`, { disableWarnings: true });
      }
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Failed to initialize Firebase auth.";
    state.enabled = false;
  } finally {
    state.ready = true;
  }

  return state;
}

async function requireEnabled() {
  await initializeOptpilotFirebaseAuth();
  if (!state.enabled || !state.auth) {
    throw new Error(state.error || "Firebase auth is not enabled.");
  }
  return state.auth;
}

export async function signInWithPassword({ email, password }) {
  const auth = await requireEnabled();
  const credentials = await signInWithEmailAndPassword(auth, email, password);
  return credentials.user;
}

export async function signInWithGoogle() {
  const auth = await requireEnabled();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credentials = await signInWithPopup(auth, provider);
  return credentials.user;
}

export async function signOutUser() {
  const auth = await requireEnabled();
  await signOut(auth);
}

export async function getCurrentUser() {
  const auth = await requireEnabled();
  return auth.currentUser;
}

export async function getIdToken(forceRefresh = false) {
  const user = await getCurrentUser();
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export async function buildOptpilotAuthHeaders(userKey) {
  const headers = {};
  const user = getOptpilotTestUserConfig(userKey);

  if (user.uid) {
    headers["X-OptPilot-UID"] = user.uid;
  }

  const token = await getIdToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function onUserChanged(callback) {
  const auth = await requireEnabled();
  return onAuthStateChanged(auth, callback);
}

export function isFirebaseAuthEnabled() {
  return !!state.enabled;
}

export function getOptpilotFirebaseRuntimeState() {
  return {
    ready: state.ready,
    enabled: state.enabled,
    error: state.error,
    config: state.config,
  };
}

export function getFirebaseAuthError() {
  return state.error;
}

export function getFirebaseAuthConfig() {
  return state.config;
}
