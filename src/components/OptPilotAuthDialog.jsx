import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getOptpilotTestUserConfig } from "../lib/optpilotFirebaseAuth.js";
import { useOptPilotAuth } from "../context/OptPilotAuthContext.jsx";

const USER_KEYS = ["A", "B", "C"];

export default function OptPilotAuthDialog() {
  const {
    dialogOpen,
    closeDialog,
    selectedUserKey,
    setSelectedUserKey,
    user,
    isAuthenticated,
    busy,
    authError,
    loginWithSelectedUser,
    loginWithGoogle,
    logout,
  } = useOptPilotAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const selectedConfig = useMemo(() => getOptpilotTestUserConfig(selectedUserKey), [selectedUserKey]);

  useEffect(() => {
    if (!dialogOpen) return;
    setEmail(selectedConfig.email || "");
    setPassword(selectedConfig.password || "");
  }, [dialogOpen, selectedConfig.email, selectedConfig.password]);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, closeDialog]);

  if (!dialogOpen) return null;

  const dialog = (
    <div className="optpilot-modal-backdrop" onMouseDown={closeDialog} role="presentation">
      <div className="optpilot-modal" role="dialog" aria-modal="true" aria-labelledby="optpilot-auth-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="optpilot-modal-header">
          <div>
            <h2 id="optpilot-auth-title">OptPilot Login</h2>
            <p>{isAuthenticated ? "Signed in. You can switch users or log out." : "Select a test user and sign in to unlock Portfolio.Trades."}</p>
          </div>
          <button type="button" className="optpilot-modal-close" onClick={closeDialog}>
            Close
          </button>
        </div>

        <div className="optpilot-user-tabs modal-tabs">
          {USER_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`optpilot-user-btn${selectedUserKey === key ? " active" : ""}`}
              onClick={() => setSelectedUserKey(key)}
              disabled={busy}
            >
              Test User {key}
            </button>
          ))}
        </div>

        <div className="optpilot-auth-grid">
          <label className="optpilot-field">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
          </label>
          <label className="optpilot-field">
            <span>Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
          </label>
        </div>

        {selectedConfig.uid ? (
          <div className="optpilot-helper">Expected UID: {selectedConfig.uid}</div>
        ) : null}

        {authError ? <div className="optpilot-error modal-error">{authError}</div> : null}

        {isAuthenticated && user ? (
          <div className="optpilot-signed-in">
            Signed in as <strong>{user.displayName || user.email || user.uid}</strong>
          </div>
        ) : null}

        <div className="optpilot-modal-actions">
          <button type="button" className="optpilot-upload-btn" onClick={() => loginWithSelectedUser(selectedUserKey, { email, password })} disabled={busy}>
            {busy ? "Signing in..." : "Login"}
          </button>
          <button type="button" className="optpilot-secondary-btn" onClick={loginWithGoogle} disabled={busy}>
            Sign in with Google
          </button>
          <button type="button" className="optpilot-secondary-btn danger" onClick={logout} disabled={busy || !isAuthenticated}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
