import { useState } from "react";
import { login, register } from "../api.js";

export default function AuthForm({ onAuth }) {
  const [mode,     setMode]     = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const fn = mode === "login" ? login : register;
      const data = await fn(username.trim(), password);
      onAuth(data.username);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setError(null);
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="app-icon">🚗</span>
          <h1>Beležnik kilometrov</h1>
          <p className="app-subtitle">Izračunaj in zabeleži prevožene poti</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${mode === "login" ? " active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Prijava
          </button>
          <button
            type="button"
            className={`auth-tab${mode === "register" ? " active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Registracija
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="auth-username">Uporabniško ime</label>
            <input
              id="auth-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="npr. janez.novak"
              required
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Geslo</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "register" ? "vsaj 6 znakov" : ""}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? "…" : mode === "login" ? "Prijava" : "Ustvari račun"}
          </button>
        </form>
      </div>
    </div>
  );
}
