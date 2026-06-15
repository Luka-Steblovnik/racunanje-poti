import { useState, useEffect, useRef, useCallback } from "react";

function formatAddress(s) {
  const a = s.address || {};
  const street = a.road || a.pedestrian || a.path || a.footway;
  const num = a.house_number;
  const name = a.amenity || a.shop || a.tourism || a.leisure || a.building || a.office;
  const city = a.city || a.town || a.village || a.municipality || a.county;

  let main = "";
  if (name) {
    main = street ? `${name}, ${street}${num ? " " + num : ""}` : name;
  } else if (street) {
    main = num ? `${street} ${num}` : street;
  }
  if (city) main = main ? `${main}, ${city}` : city;
  if (!main) main = s.display_name.split(",")[0].trim();

  const suburb = a.suburb || a.neighbourhood || a.district || a.quarter;
  const postcode = a.postcode;
  const country = a.country_code ? a.country_code.toUpperCase() : a.country;
  const sub = [suburb, postcode, country].filter(Boolean).slice(0, 2).join(", ");

  return { main, sub };
}

function AddressInput({ id, label, value, onChange, disabled, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const suppressRef = useRef(false); // prevent fetch after selecting suggestion

  const search = useCallback(async (q) => {
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "sl,en" } });
      const data = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 350);
    return () => clearTimeout(debounceRef.current);
  }, [value, search]);

  // close on click outside
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
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="form-row ac-wrapper" ref={containerRef}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        disabled={disabled}
        autoComplete="off"
      />
      {loading && <div className="ac-loading">Iščem…</div>}
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
                <span className="ac-icon">📍</span>
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

  function handleSubmit(e) {
    e.preventDefault();
    const o = origin.trim();
    const d = destination.trim();
    if (!o || !d) return;
    onCalculate(o, d);
  }

  return (
    <form className="route-form" onSubmit={handleSubmit}>
      <AddressInput
        id="origin"
        label="Od"
        placeholder="npr. Ljubljana, Kongresni trg"
        value={origin}
        onChange={setOrigin}
        disabled={loading}
      />
      <AddressInput
        id="destination"
        label="Kam"
        placeholder="npr. Maribor, Glavni trg"
        value={destination}
        onChange={setDestination}
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
