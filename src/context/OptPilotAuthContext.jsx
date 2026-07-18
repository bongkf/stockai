import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getFirebaseAuthError,
  getOptpilotFirebaseRuntimeState,
  initializeOptpilotFirebaseAuth,
  onUserChanged,
  signInWithGoogle,
  signInWithPassword,
  signOutUser,
} from "../lib/optpilotFirebaseAuth.js";

const OptPilotAuthContext = createContext(null);

export function OptPilotAuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState(null);
  const [selectedUserKey, setSelectedUserKey] = useState("A");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;

    initializeOptpilotFirebaseAuth()
      .then(() => {
        if (cancelled) return;
        const runtime = getOptpilotFirebaseRuntimeState();
        setAuthEnabled(!!runtime.enabled);
        setAuthError(getFirebaseAuthError() || runtime.error || "");
        setReady(true);
        return onUserChanged((currentUser) => {
          setUser(currentUser || null);
        });
      })
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthError(error instanceof Error ? error.message : "Failed to initialize Firebase auth.");
        setReady(true);
      });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  async function loginWithSelectedUser(customKey, credentials) {
    const key = String(customKey || selectedUserKey || "A").toUpperCase();
    const email = String(credentials?.email || "").trim().toLowerCase();
    const password = String(credentials?.password || "");

    setBusy(true);
    setAuthError("");
    try {
      const signedInUser = await signInWithPassword({ email, password });
      setUser(signedInUser || null);
      setSelectedUserKey(key);
      setDialogOpen(false);
      return signedInUser;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign in.";
      setAuthError(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function loginWithGoogle() {
    setBusy(true);
    setAuthError("");
    try {
      const signedInUser = await signInWithGoogle();
      setUser(signedInUser || null);
      setDialogOpen(false);
      return signedInUser;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign in with Google.";
      setAuthError(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setAuthError("");
    try {
      await signOutUser();
      setUser(null);
      setDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign out.";
      setAuthError(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo(
    () => ({
      ready,
      authEnabled,
      authError,
      user,
      selectedUserKey,
      setSelectedUserKey,
      dialogOpen,
      setDialogOpen,
      openDialog: () => setDialogOpen(true),
      closeDialog: () => setDialogOpen(false),
      busy,
      loginWithSelectedUser,
      loginWithGoogle,
      logout,
      isAuthenticated: !!user,
    }),
    [ready, authEnabled, authError, user, selectedUserKey, dialogOpen, busy]
  );

  return <OptPilotAuthContext.Provider value={value}>{children}</OptPilotAuthContext.Provider>;
}

export function useOptPilotAuth() {
  const value = useContext(OptPilotAuthContext);
  if (!value) {
    throw new Error("useOptPilotAuth must be used within OptPilotAuthProvider.");
  }
  return value;
}
