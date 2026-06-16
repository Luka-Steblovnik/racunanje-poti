import { useState } from "react";
import { exportXlsx, deleteRoute, deleteAllRoutes } from "../api.js";

export default function RouteHistory({ routes, totalKm, loading, onRefresh }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  if (loading) return <p className="history-loading">Nalagam zgodovino…</p>;

  async function handleExport() {
    try { await exportXlsx(fromDate, toDate); }
    catch (e) { alert(e.message); }
  }

  async function handleDelete(r) {
    if (!confirm(`Izbriši pot:\n${r.origin} → ${r.destination} (${r.distance_km} km)?`)) return;
    try { await deleteRoute(r.id); await onRefresh(); }
    catch (e) { alert(e.message); }
  }

  async function handleDeleteAll() {
    if (!confirm(`Izbriši VSE zabeležene poti (${routes.length})?\nTega ni mogoče razveljaviti.`)) return;
    try { await deleteAllRoutes(); await onRefresh(); }
    catch (e) { alert(e.message); }
  }

  return (
    <section className="history-section">
      <div className="history-header">
        <h2>Zabeležene poti</h2>
        <div className="history-summary">
          <span className="total-km">Skupaj: <strong>{totalKm} km</strong></span>
          {routes.length > 0 && (
            <button className="btn btn-delete-all" onClick={handleDeleteAll}>🗑 Izbriši vse</button>
          )}
        </div>
      </div>

      {routes.length === 0 ? (
        <p className="history-empty">Še ni zabeleženih poti.</p>
      ) : (
        <>
          <div className="export-row">
            <label>Od</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <label>Do</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-export" onClick={handleExport}>↓ Izvozi Excel</button>
          </div>

          <div className="table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Od</th>
                  <th>Kam</th>
                  <th>Namen</th>
                  <th>km</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...routes].reverse().map((r) => (
                  <tr key={r.id}>
                    <td className="td-date">{formatDt(r.datetime)}</td>
                    <td>{r.origin}</td>
                    <td>{r.destination}</td>
                    <td>{r.namen || "—"}</td>
                    <td className="td-num">{r.distance_km}</td>
                    <td>
                      <button className="btn-del-row" onClick={() => handleDelete(r)} title="Izbriši">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
