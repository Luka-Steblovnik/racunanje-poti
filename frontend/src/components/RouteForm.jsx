import { useState, useEffect, useRef, useCallback } from "react";
import { searchAutocomplete, getPlaceDetails, reverseGeocode } from "../api.js";

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
    if (q.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    setSearching(true);
    try {
      const data = await searchAutocomplete(q);
      const results = data.results || [];
      if (results.length > 0) {
        setSuggestions(results);
        setOpen(true);
      }
      // if no results, keep old suggestions visible
    } catch {
      /* keep old suggestions on error */
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 280);
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

  async function select(s) {
    suppressRef.current = true;
    onChange(s.text);
    setOpen(false);
    setSuggestions([]);

    if (s.lat !== null && s.lon !== null) {
      // Nominatim result — coords available immediately
      onCoords({ lat: s.lat, lon: s.lon });
    } else if (s.place_id) {
      // Google Places result — fetch coords via place details
      onCoords(null);
      try {
        const details = await getPlaceDetails(s.place_id);
        onCoords({ lat: details.lat, lon: details.lon });
      } catch {
        // coords unavailable; backend will geocode the text string
      }
    }
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
          const data = await reverseGeocode(lat, lon);
          suppressRef.current = true;
          onChange(data.address);
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
              key={s.place_id}
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
