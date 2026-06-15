import { useState, useEffect, useRef, useCallback } from "react";

// Slovenia viewbox for biasing autocomplete results (soft bias, not hard limit)
const SLO_VIEWBOX = "13.4,46.9,16.6,45.4";

function formatAddress(s) {
  const a = s.address || {};

  const poi = a.amenity || a.shop || a.tourism || a.leisure || a.historic || a.office || a.building;
  const street = a.road || a.pedestrian || a.path || a.footway || a.cycleway;
  const num = a.house_number;
  const city = a.city || a.town || a.village || a.municipality;
  const suburb = a.suburb || a.neighbourhood || a.district || a.quarter;

  let main = "";
  if (poi) {
    main = poi;
    if (street) main += `, ${street}${num ? " " + num : ""}`;
    if (city) main += `, ${city}`;
  } else if (street) {
    main = num ? `${street} ${num}` : street;
    if (city) main += `, ${city}`;
  } else if (city) {
    main = city;
  } else {
    // fallback: first two parts of display_name
    main = s.display_name.split(",").slice(0, 2).map(p => p.trim()).join(", ");
  }

  // Subtitle: postcode + wider region + country (if not Slovenia)
  const postcode = a.postcode;
  const region = a.county || a.state;
  const country = a.country_code ? a.country_code.toUpperCase() : "";
  const subParts = [];
  if (suburb && suburb !== city) subParts.push(suburb);
  if (postcode) subParts.push(postcode);
  if (region && region !== city) subParts.push(region);
  if (country && country !== "SI") subParts.push(country);

  return { main, sub: subParts.slice(0, 3).join(", ") };
}

function AddressInput({ id, label, value, onChange, onCoords, disabled, placeholder, showGeoBtn }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const suppressRef = useRef(false);

  const search = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    setSearchLoading(true);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(q)}` +
        `&format=json&limit=6&addressdetails=1` +
        `&viewbox=${SLO_VIEWBOX}&bounded=0` +
        `&dedupe=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "sl,en" } });
      const data = await res.json();
      // Dedupe by display_name to remove near-identical entries
      const seen = new Set();
      const filtered = data.filter(s => {
        const key = formatAddress(s).main;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 5);
      setSuggestions(filtered);
      setOpen(filtered.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
    return () => clearTimeout(debounceRef.current);
  }, [value, search]);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(s) {
    const { main } = formatAddress(s);
    suppressRef.current = true;
    onChange(main);
    onCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
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
          const url =
            `https://nominatim.openstreetmap.org/reverse` +
            `?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
          const res = await fetch(url, { headers: { "Accept-Language": "sl,en" } });
          const data = await res.json();
          const { main } = formatAddress(data);
          suppressRef.current = true;
          onChange(main);
          onCoords({ lat, lon });
        } catch {
          /* silently ignore */
        } finally {
          setGeoLoading(false);
        }
      },
      () => setGeoLoading(false),
      { timeout: 10000, maximumAge: 30000 }
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
            title="Uporabi mojo trenutno lokacijo"
            aria-label="Uporabi mojo trenutno lokacijo"
          >
            {geoLoading ? "…" : "◎"}
          </button>
        )}
      </div>
      {searchLoading && <div className="ac-loading">Iščem…</div>}
      {open && suggestions.length > 0 && (
        <ul className="ac-list" role="listbox">
          {suggestions.map((s) => {
            const { main, sub } = formatAddress(s);
            return (
              <li
                key={s.place_id}
                className="ac-item"
                role="option"
                onMouseDown={() => select(s)}
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

export default function RouteForm({ onCalculate, loading }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originCoords, setOriginCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);

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
