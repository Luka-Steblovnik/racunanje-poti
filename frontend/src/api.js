// V produkciji nastavi VITE_API_URL na Railway URL (brez trailing slash),
// npr. https://kilometer-tracker-production.up.railway.app
// Lokalno Vite proxy preusmeri /api → localhost:8000, zato BASE ostane "/api".
const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = `Napaka ${res.status}`;
    try {
      const data = await res.json();
      msg = data.detail ?? msg;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

export async function calculateRoute(origin, destination) {
  return request("/calculate", {
    method: "POST",
    body: JSON.stringify({ origin, destination }),
  });
}

export async function saveRoute(payload) {
  return request("/routes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchRoutes() {
  return request("/routes");
}

export function exportCsvUrl() {
  return `${BASE}/routes/export`;
}
