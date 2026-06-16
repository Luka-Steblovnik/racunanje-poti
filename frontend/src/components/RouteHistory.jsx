import { exportXlsx } from "../api.js";

export default function RouteHistory({ routes, totalKm, loading }) {
  if (loading) return <p className="history-loading">Nalagam zgodovino…</p>;

  async function handleExport() {
    try { await exportXlsx(); }
    catch (e) { alert(e.message); }
  }

  return (
    <section className="history-section">
      <div className="history-header">
        <h2>Zabeležene poti</h2>
        <div className="history-summary">
          <span className="total-km">Skupaj: <strong>{totalKm} km</strong></span>
          {routes.length > 0 && (
            <button className="btn btn-export" onClick={handleExport}>
              ↓ Izvozi Excel
            </button>
          )}
        </div>
      </div>

      {routes.length === 0 ? (
        <p className="history-empty">Še ni zabeleženih poti.</p>
      ) : (
        <div className="table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Od</th>
                <th>Kam</th>
                <th>km</th>
              </tr>
            </thead>
            <tbody>
              {[...routes].reverse().map((r, i) => (
                <tr key={i}>
                  <td className="td-date">{formatDt(r.datetime)}</td>
                  <td>{r.origin}</td>
                  <td>{r.destination}</td>
                  <td className="td-num">{r.distance_km}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatDt(iso) {
  const d = new Date(iso);
  return d.toLocaleString("sl-SI", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
