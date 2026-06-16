import { useState, useEffect, useCallback } from "react";
import RouteForm from "./components/RouteForm.jsx";
import RouteResult from "./components/RouteResult.jsx";
import RouteHistory from "./components/RouteHistory.jsx";
import AuthForm from "./components/AuthForm.jsx";
import { calculateRoute, saveRoute, fetchRoutes, logout, getStoredUser } from "./api.js";

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());

  const [origin,      setOrigin]      = useState("");
  const [destination, setDestination] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [calcError,   setCalcError]   = useState(null);
  const [result,      setResult]      = useState(null);
  const [saved,       setSaved]       = useState(false);
  const [saving,      setSaving]      = useState(false);

  const [routes,      setRoutes]      = useState([]);
  const [totalKm,     setTotalKm]     = useState(0);
  const [histLoading, setHistLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const data = await fetchRoutes();
      setRoutes(data.routes);
      setTotalKm(data.total_km);
    } catch (e) {
      console.error("Napaka pri nalaganju zgodovine:", e);
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadHistory();
  }, [user, loadHistory]);

  function handleAuth(username) {
    setUser({ username, token: localStorage.getItem("km_token") });
  }

  function handleLogout() {
    logout();
    setUser(null);
    setRoutes([]);
    setTotalKm(0);
    setResult(null);
    setCalcError(null);
  }

  async function handleCalculate(o, d, originCoords, destCoords) {
    setOrigin(o);
    setDestination(d);
    setResult(null);
    setSaved(false);
    setCalcError(null);
    setCalculating(true);
    try {
      const data = await calculateRoute(o, d, originCoords, destCoords);
      setResult(data);
    } catch (e) {
      setCalcError(e.message);
    } finally {
      setCalculating(false);
    }
  }

  async function handleSave(namen) {
    if (!result) return;
    setSaving(true);
    try {
      await saveRoute({
        origin, destination,
        distance_km: result.distance_km,
        duration: result.duration,
        source: result.source,
        namen,
      });
      setSaved(true);
      await loadHistory();
      if (result.maps_url) window.open(result.maps_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setCalcError(`Napaka pri shranjevanju: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <AuthForm onAuth={handleAuth} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-icon">🚗</span>
        <div style={{ flex: 1 }}>
          <h1>Beležnik kilometrov</h1>
          <p className="app-subtitle">Izračunaj in zabeleži prevožene poti</p>
        </div>
        <div className="user-info">
          <span className="user-name">👤 {user.username}</span>
          <button className="btn-logout" onClick={handleLogout}>Odjava</button>
        </div>
      </header>

      <main className="app-main">
        <section className="card">
          <h2>Nova pot</h2>
          <RouteForm onCalculate={handleCalculate} loading={calculating} />
          {calcError && (
            <div className="error-box" role="alert">
              <strong>Napaka:</strong> {calcError}
            </div>
          )}
          <RouteResult
            result={result}
            origin={origin}
            destination={destination}
            onSave={handleSave}
            saving={saving}
            saved={saved}
          />
        </section>

        <RouteHistory routes={routes} totalKm={totalKm} loading={histLoading} />
      </main>

      <footer className="app-footer">
        Vir razdalje: OSRM / OpenStreetMap
      </footer>
    </div>
  );
}
