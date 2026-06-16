const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : "/api";

function getToken() {
  return localStorage.getItem("km_token");
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 401) {
    localStorage.removeItem("km_token");
    localStorage.removeItem("km_username");
    window.location.reload();
    return;
  }
  if (!res.ok) {
    let msg = `Napaka ${res.status}`;
    try { const d = await res.json(); msg = d.detail ?? msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || "Napaka pri prijavi");
  }
  const data = await res.json();
  localStorage.setItem("km_token", data.token);
  localStorage.setItem("km_username", data.username);
  return data;
}

export async function register(username, password) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || "Napaka pri registraciji");
  }
  const data = await res.json();
  localStorage.setItem("km_token", data.token);
  localStorage.setItem("km_username", data.username);
  return data;
}

export function logout() {
  localStorage.removeItem("km_token");
  localStorage.removeItem("km_username");
}

export function getStoredUser() {
  const token = localStorage.getItem("km_token");
  const username = localStorage.getItem("km_username");
  return token ? { token, username } : null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function calculateRoute(origin, destination, originCoords, destCoords) {
  const body = { origin, destination };
  if (originCoords) { body.origin_lat = originCoords.lat; body.origin_lon = originCoords.lon; }
  if (destCoords)   { body.dest_lat   = destCoords.lat;   body.dest_lon   = destCoords.lon; }
  return request("/calculate", { method: "POST", body: JSON.stringify(body) });
}

export async function saveRoute(payload) {
  return request("/routes", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchRoutes() {
  return request("/routes");
}

export async function exportXlsx() {
  const token = getToken();
  const res = await fetch(`${BASE}/routes/export`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Napaka pri izvozu");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prevozeni_kilometri.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

export async function autocomplete(q) {
  const res = await fetch(`${BASE}/autocomplete?q=${encodeURIComponent(q)}`);
  if (!res.ok) return { suggestions: [] };
  return res.json();
}

export async function getPlace(placeId) {
  const res = await fetch(`${BASE}/place/${encodeURIComponent(placeId)}`);
  if (!res.ok) return null;
  return res.json();
}
