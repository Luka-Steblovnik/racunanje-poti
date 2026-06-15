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

export async function calculateRoute(origin, destination, originCoords, destCoords) {
  const body = { origin, destination };
  if (originCoords) { body.origin_lat = originCoords.lat; body.origin_lon = originCoords.lon; }
  if (destCoords)   { body.dest_lat   = destCoords.lat;   body.dest_lon   = destCoords.lon; }
  return request("/calculate", {
    method: "POST",
    body: JSON.stringify(body),
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

export async function searchAutocomplete(q) {
  return request(`/autocomplete?q=${encodeURIComponent(q)}`);
}

export async function getPlaceDetails(place_id) {
  return request(`/place?place_id=${encodeURIComponent(place_id)}`);
}

export async function reverseGeocode(lat, lon) {
  return request(`/reverse?lat=${lat}&lon=${lon}`);
}
