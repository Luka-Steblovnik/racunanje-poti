import { useState, useEffect, useRef, useCallback } from "react";
import { autocomplete as backendAutocomplete } from "../api.js";

// Nominatim — only for reverse geocoding (geolocation button)
const NOM = "https://nominatim.openstreetmap.org";

// Format a Photon GeoJSON feature into { main, sub, lat, lon }
function formatPhoton(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;

  const name    = p.name || "";
  const street  = p.street || "";
  const hnum    = p.housenumber || "";
  const city    = p.city || p.town || p.village || p.county || "";
  const postcode = p.postcode || "";
  const state   = p.state || "";
  const country = p.country || "";
  const isSlovenia = country === "Slovenija" || country === "Slovenia" || p.countrycode === "SI";

  let main = "";
  const isPlace = ["city","town","village","hamlet","locality","suburb","borough","quarter","neighbourhood","municipality"].includes(p.type);

  if (name && !isPlace && street) {
    // POI with a street
    main = `${name}, ${street}${hnum ? " " + hnum : ""}`;
    if (city) main += `, ${city}`;
  } else if (name && !isPlace) {
    // POI without street
    main = name;
    if (city && city !== name) main += `, ${city}`;
  } else if (street) {
    // Street / address
    main = hnum ? `${street} ${hnum}` : street;
    if (city) main += `, ${city}`;
  } else if (name) {
    // Settlement / place name
    main = name;
    if (city && city !== name) main += `, ${city}`;
  } else {
    main = city || country;
  }

  const subParts = [postcode, state, isSlovenia ? null : country].filter(Boolean);
  const sub = subParts.slice(0, 2).join(", ");

  return { main, sub, lat, lon };
}

async function photonSearch(q) {
  const data = await backendAutocomplete(q);

  const seen = new Set();
  const results = [];
  for (const f of (data.features || [])) {
    const { main, sub, lat, lon } = formatPhoton(f);
    const key = main.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ id: `${lat},${lon}`, main, sub, lat, lon });
    if (results.length >= 5) break;
  }
  return results;
}

async function nominatimReverse(lat, lon) {
  const url =
    `${NOM}/reverse?lat=${lat}&lon=${lon}` +
    `&format=json&addressdetails=1&accept-language=sl,en`;
  const res = await fetch(url, { headers: { "User-Agent": "KilometerTracker/1.0" } });
  const data = await res.json();

  // Build a clean address string from reverse result
  const a = data.address || {};
  const street  = a.road || a.pedestrian || a.path || "";
  const hnum    = a.house_number || "";
  const city    = a.city || a.town || a.village || a.municipality || "";
  if (street) return hnum ? `${street} ${hnum}, ${city}` : city ? `${street}, ${city}` : street;
  return city || data.display_name?.split(",")[0] || "";
}

function IconCrosshair() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

function AddressInput({ id, label, value, onChange, onCoords, disabled, placeholder, showGeoBtn }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open,        setOpen]        = useState(false);
  const [searching,   setSearching]   = useState(false);
  const [geoLoading,  setGeoLoading]  = useState(false);

  const containerRef = useRef(null);
  const debounceRef  = useRef(null);
  const suppressRef  = useRef(false);

  const search = useCallback(async (q) => {
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    setSearching(true);
    try {
      const results = await photonSearch(q);
      if (results.length > 0) {
        setSuggestions(results);
        setOpen(true);
      }
    } catch {
      /* keep old suggestions on error */
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 250);
    return () => clearTimeout(debounceRef.current);
  }, [value, search]);

  useEffect(() => {
    const handle = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function select(s) {
    suppressRef.current = true;
    onChange(s.main);
    onCoords({ lat: s.lat, lon: s.lon });
    setOpen(false);
    setSuggestions([]);
  }

  function handleChange(e) {
    onChange(e.target.value);
    onCoords(null);
  }

  async function handleGeolocate() {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lon } }) => {
        try {
          const addr = await nominatimReverse(lat, lon);
          suppressRef.current = true;
          onChange(addr);
          onCoords({ lat, lon });
        } catch { /* ignore */ }
        finally { setGeoLoading(false); }
      },
      () => setGeoLoading(false),
      { timeout: 8000, maximumAge: 60000 }
    );
  }

  return (
    <div className="form-row ac-wrapper" ref={containerRef}>
      <label htmlFor={id}>{label}</label>
      <div className="ac-input-wrap">
        <input
          id={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          disabled={disabled}
          autoComplete="off"
          className={showGeoBtn ? "has-geo-btn" : ""}
        />
        {showGeoBtn && (
          <button
            type="button"
            className="ac-geo-btn"
            onClick={handleGeolocate}
            disabled={disabled || geoLoading}
            title="Moja lokacija"
            aria-label="Moja lokacija"
          >
            {geoLoading ? <span className="ac-spinner" /> : <IconCrosshair />}
          </button>
        )}
      </div>

      {searching && !open && <div className="ac-loading">Iščem…</div>}

      {open && suggestions.length > 0 && (
        <ul className="ac-list" role="listbox">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="ac-item"
              role="option"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(s)}
            >
              <span className="ac-pin">📍</span>
              <div className="ac-text">
                <span className="ac-main">{s.main}</span>
                {s.sub && <span className="ac-sub">{s.sub}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RouteForm({ onCalculate, loading }) {
  const [origin,       setOrigin]       = useState("");
  const [destination,  setDestination]  = useState("");
  const [originCoords, setOriginCoords] = useState(null);
  const [destCoords,   setDestCoords]   = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    const o = origin.trim();
    const d = destination.trim();
    if (!o || !d) return;
    onCalculate(o, d, originCoords, destCoords);
  }

  return (
    <form className="route-form" onSubmit={handleSubmit}>
      <AddressInput
        id="origin"
        label="Od"
        placeholder="npr. Ljubljana, Kongresni trg"
        value={origin}
        onChange={setOrigin}
        onCoords={setOriginCoords}
        disabled={loading}
        showGeoBtn
      />
      <AddressInput
        id="destination"
        label="Kam"
        placeholder="npr. Maribor, Glavni trg"
        value={destination}
        onChange={setDestination}
        onCoords={setDestCoords}
        disabled={loading}
      />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={loading || !origin.trim() || !destination.trim()}
      >
        {loading ? "Računam…" : "Izračunaj pot"}
      </button>
    </form>
  );
}
