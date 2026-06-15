import { useState, useEffect, useCallback } from "react";
import RouteForm from "./components/RouteForm.jsx";
import RouteResult from "./components/RouteResult.jsx";
import RouteHistory from "./components/RouteHistory.jsx";
import { calculateRoute, saveRoute, fetchRoutes } from "./api.js";

export default function App() {
  // Form state
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState(null);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // History state
  const [routes, setRoutes] = useState([]);
  const [totalKm, setTotalKm] = useState(0);
  const [histLoading, setHistLoading] = useState(true);

  const loadHistory = useCallback(async () => {
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
    loadHistory();
  }, [loadHistory]);

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

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    try {
      await saveRoute({
        origin,
        destination,
        distance_km: result.distance_km,
        duration: result.duration,
        source: result.source,
      });
      setSaved(true);
      await loadHistory();
    } catch (e) {
      setCalcError(`Napaka pri shranjevanju: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-icon">🚗</span>
        <div>
          <h1>Beležnik kilometrov</h1>
          <p className="app-subtitle">Izračunaj in zabeleži prevožene poti</p>
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
        Vir razdalje: {routes.length > 0 && routes.some(r => r.source === "osrm")
          ? "OSRM / OpenStreetMap (fallback — brez Google Maps API ključa)"
          : "Google Maps ali OSRM"}
      </footer>
    </div>
  );
}
