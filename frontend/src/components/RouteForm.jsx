import { useState, useEffect, useRef, useCallback } from "react";

// Slovenia viewbox — bias results toward Slovenia without hard-limiting
// format: left,top,right,bottom  (lon_min, lat_max, lon_max, lat_min)
const SLO_VIEWBOX = "13.4,46.9,16.6,45.4";
const NOM = "https://nominatim.openstreetmap.org";

function formatResult(s) {
  const a = s.address || {};

  const poi    = a.amenity || a.shop || a.tourism || a.leisure || a.historic || a.office;
  const street = a.road || a.pedestrian || a.path || a.footway;
  const num    = a.house_number;
  const city   = a.city || a.town || a.village || a.municipality;
  const suburb = a.suburb || a.neighbourhood || a.district;

  let main = "";
  if (poi) {
    main = poi;
    if (street) main += `, ${street}${num ? " " + num : ""}`;
    if (city)   main += `, ${city}`;
  } else if (street) {
    main = num ? `${street} ${num}` : street;
    if (city) main += `, ${city}`;
  } else if (city) {
    main = city;
  } else {
    main = s.display_name.split(",").slice(0, 2).map(p => p.trim()).join(", ");
  }

  const postcode = a.postcode;
  const region   = a.county || a.state;
  const foreign  = a.country_code && a.country_code.toUpperCase() !== "SI" ? a.country : null;
  const subParts = [suburb, postcode, region, foreign].filter(Boolean);
  const sub = subParts.slice(0, 3).join(", ");

  return { main, sub };
}

// Normalize: strip diacritics, lowercase
function norm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function nominatimSearch(q) {
  const url =
    `${NOM}/search?q=${encodeURIComponent(q)}` +
    `&format=json&limit=10&addressdetails=1` +
    `&viewbox=${SLO_VIEWBOX}&bounded=0` +
    `&countrycodes=si,hr,at,it,hu` +
    `&dedupe=1&accept-language=sl,en`;
  const res = await fetch(url, { headers: { "User-Agent": "KilometerTracker/1.0" } });
  const data = await res.json();

  // Only keep results where at least one query word appears in the formatted label or display_name
  const words = norm(q).split(/\s+/).filter(w => w.length >= 2);

  const seen = new Set();
  return data.filter(s => {
    const { main } = formatResult(s);
    const haystack = norm(main) + " " + norm(s.display_name);
    const relevant = words.some(w => haystack.includes(w));
    if (!relevant) return false;

    const key = norm(main);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

async function nominatimReverse(lat, lon) {
  const url =
    `${NOM}/reverse?lat=${lat}&lon=${lon}` +
    `&format=json&addressdetails=1&accept-language=sl,en`;
  const res = await fetch(url, { headers: { "User-Agent": "KilometerTracker/1.0" } });
  return res.json();
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
    if (q.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    setSearching(true);
    try {
      const results = await nominatimSearch(q);
      if (results.length > 0) {
        setSuggestions(results);
        setOpen(true);
      }
      // če ni zadetkov, obdrži stare predloge vidne (ne zapri dropdowna)
    } catch {
      /* ob napaki pusti stare predloge */
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

  function select(s) {
    const { main } = formatResult(s);
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
          const data = await nominatimReverse(lat, lon);
          const { main } = formatResult(data);
          suppressRef.current = true;
          onChange(main);
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
          {suggestions.map((s) => {
            const { main, sub } = formatResult(s);
            return (
              <li
                key={s.place_id}
                className="ac-item"
                role="option"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} // prepreči blur inputa
                onClick={() => select(s)}
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
