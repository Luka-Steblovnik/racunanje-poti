export default function RouteResult({ result, origin, destination, onSave, saving, saved }) {
  if (!result) return null;

  const sourceLabel =
    result.source === "google" ? "Google Maps" : "OSRM (brezplačni fallback)";

  return (
    <div className="result-card">
      <div className="result-header">
        <span className="result-route">
          {origin} → {destination}
        </span>
        <span className="source-badge">{sourceLabel}</span>
      </div>

      <div className="result-stats">
        <div className="stat">
          <span className="stat-value">{result.distance_km} km</span>
          <span className="stat-label">razdalja</span>
        </div>
        <div className="stat-divider" />
        <div className="stat">
          <span className="stat-value">{result.duration}</span>
          <span className="stat-label">čas vožnje</span>
        </div>
      </div>

      <a
        className="maps-link"
        href={result.maps_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        🗺 Odpri v Google Maps navigaciji
      </a>

      <div className="result-actions">
        {saved ? (
          <span className="saved-notice">✓ Pot je bila zabeležena</span>
        ) : (
          <button
            className="btn btn-confirm"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Shranjujem…" : "Potrdi in zabeleži"}
          </button>
        )}
      </div>
    </div>
  );
}
