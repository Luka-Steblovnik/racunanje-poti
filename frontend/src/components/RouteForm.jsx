import { useState, useEffect, useRef, useCallback } from "react";

// Photon (komoot) — OSM-based autocomplete, designed for typeahead, fast
// Center on Slovenia for biasing results
const PHOTON = "https://photon.komoot.io/api";
const PHOTON_REV = "https://photon.komoot.io/reverse";
const BIAS_LAT = 46.15;
const BIAS_LON = 14.99;

function formatFeature(f) {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;

  const poi    = p.name;
  const street = p.street;
  const num    = p.housenumber;
  const city   = p.city || p.town || p.village || p.county;
  const isSameAsPoi = poi && city && poi.toLowerCase() === city.toLowerCase();

  let main = "";
  if (poi && street) {
    main = `${poi}, ${street}${num ? " " + num : ""}`;
    if (city) main += `, ${city}`;
  } else if (poi && !street) {
    main = isSameAsPoi ? poi : (city ? `${poi}, ${city}` : poi);
  } else if (street) {
    main = num ? `${street} ${num}` : street;
    if (city) main += `, ${city}`;
  } else if (city) {
    main = city;
  }

  if (!main) main = [p.name, p.city].filter(Boolean).join(", ") || "?";

  const postcode = p.postcode;
  const state    = p.state;
  const foreign  = p.countrycode !== "SI" ? p.country : null;
  const sub = [postcode, state, foreign].filter(Boolean).join(", ");

  return { main, sub, lat, lon };
}

async function photonSearch(q) {
  const url =
    `${PHOTON}?q=${encodeURIComponent(q)}&limit=7&lang=sl` +
    `&lat=${BIAS_LAT}&lon=${BIAS_LON}`;
  const res = await fetch(url);
  const data = await res.json();

  // Dedupe by formatted main label
  const seen = new Set();
  return data.features.filter(f => {
    const key = formatFeature(f).main.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

async function photonReverse(lat, lon) {
  const url = `${PHOTON_REV}?lat=${lat}&lon=${lon}&limit=1&lang=sl`;
  const res = await fetch(url);
  const data = await res.json();
  return data.features[0] ?? null;
}

// ── Location pin SVG icon ────────────────────────────────────────────────────
function IconCrosshair() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

// ── AddressInput ─────────────────────────────────────────────────────────────
function AddressInput({ id, label, value, onChange, onCoords, disabled, placeholder, showGeoBtn }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen]               = useState(false);
  const [searching, setSearching]     = useState(false);
  const [geoLoading, setGeoLoading]   = useState(false);

  const containerRef = useRef(null);
  const debounceRef  = useRef(null);
  const suppressRef  = useRef(false); // skip fetch after programmatic onChange

  // ── Autocomplete search ──
  const search = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setSuggestions([]); setOpen(false); return; }
    setSearching(true);
    try {
      const features = await photonSearch(trimmed);
      setSuggestions(features);
      setOpen(features.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 200);
    return () => clearTimeout(debounceRef.current);
  }, [value, search]);

  // ── Close on outside click ──
  useEffect(() => {
    const handle = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Select suggestion ──
  function select(f) {
    const { main, lat, lon } = formatFeature(f);
    suppressRef.current = true;
    onChange(main);
    onCoords({ lat, lon });
    setOpen(false);
    setSuggestions([]);
  }

  // ── Manual edit → invalidate stored coords ──
  function handleChange(e) {
    onChange(e.target.value);
    onCoords(null);
  }

  // ── Geolocation ──
  async function handleGeolocate() {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lon } }) => {
        try {
          const f = await photonReverse(lat, lon);
          if (f) {
            const { main } = formatFeature(f);
            suppressRef.current = true;
            onChange(main);
          }
          onCoords({ lat, lon }); // always store GPS coords regardless of label
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
            className={`ac-geo-btn${geoLoading ? " ac-geo-loading" : ""}`}
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
          {suggestions.map((f) => {
            const { main, sub } = formatFeature(f);
            return (
              <li
                key={`${f.properties.osm_id}-${f.properties.osm_type}`}
                className="ac-item"
                role="option"
                onMouseDown={() => select(f)}
              >
                <span className="ac-pin">📍</span>
                <div className="ac-text">
                  <span className="ac-main">{main}</span>
                  {sub && <span className="ac-sub">{sub}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── RouteForm ────────────────────────────────────────────────────────────────
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
