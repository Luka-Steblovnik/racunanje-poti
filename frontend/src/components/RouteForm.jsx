import { useState } from "react";

export default function RouteForm({ onCalculate, loading }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const o = origin.trim();
    const d = destination.trim();
    if (!o || !d) return;
    onCalculate(o, d);
  }

  return (
    <form className="route-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="origin">Od</label>
        <input
          id="origin"
          type="text"
          placeholder="npr. Ljubljana, Kongresni trg"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
      </div>
      <div className="form-row">
        <label htmlFor="destination">Kam</label>
        <input
          id="destination"
          type="text"
          placeholder="npr. Maribor, Glavni trg"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading || !origin.trim() || !destination.trim()}>
        {loading ? "Računam…" : "Izračunaj pot"}
      </button>
    </form>
  );
}
