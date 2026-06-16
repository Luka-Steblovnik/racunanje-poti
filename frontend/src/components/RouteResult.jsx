import { useState } from "react";

export default function RouteResult({ result, origin, destination, onSave, saving, saved }) {
  const [namen, setNamen] = useState("");
  const [odhod, setOdhod] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  });
  const [prihod, setPrihod] = useState("");
  const [namenError, setNamenError] = useState(false);

  if (!result) return null;

  function handleSave() {
    if (!namen.trim()) {
      setNamenError(true);
      return;
    }
    setNamenError(false);
    onSave(namen.trim(), odhod, prihod);
  }

  return (
    <div className="result-card">
      <div className="result-header">
        <span className="result-route">{origin} → {destination}</span>
        <span className="source-badge">OSRM</span>
      </div>

      <div className="result-stats">
        <div className="stat">
          <span className="stat-value">{result.distance_km} km</span>
          <span className="stat-label">razdalja</span>
        </div>
      </div>

      <a className="maps-link" href={result.maps_url} target="_blank" rel="noopener noreferrer">
        🗺 Odpri v Google Maps navigaciji
      </a>

      <div className="result-actions">
        {saved ? (
          <span className="saved-notice">✓ Pot je bila zabeležena</span>
        ) : (
          <div className="namen-wrap">
            <div className="namen-field">
              <label htmlFor="namen-input">Namen poti *</label>
              <input
                id="namen-input"
                type="text"
                placeholder="npr. sestanek, kosilo, dostava…"
                value={namen}
                onChange={e => { setNamen(e.target.value); setNamenError(false); }}
                className={namenError ? "namen-error-input" : ""}
                disabled={saving}
              />
              {namenError && <span className="namen-error-msg">Namen je obvezen</span>}
            </div>
            <div className="cas-row">
              <div className="namen-field">
                <label htmlFor="odhod-input">Ura odhoda</label>
                <input
                  id="odhod-input"
                  type="time"
                  value={odhod}
                  onChange={e => setOdhod(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="namen-field">
                <label htmlFor="prihod-input">Ura prihoda</label>
                <input
                  id="prihod-input"
                  type="time"
                  value={prihod}
                  onChange={e => setPrihod(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <button className="btn btn-confirm" onClick={handleSave} disabled={saving}>
              {saving ? "Shranjujem…" : "Potrdi in zabeleži"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
