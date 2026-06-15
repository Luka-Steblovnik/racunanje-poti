"""
Kilometer Tracker — FastAPI backend
"""

import os
import csv
import io
import json
import unicodedata
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
_data_dir = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))
ROUTES_FILE = _data_dir / "routes.json"

app = FastAPI(title="Kilometer Tracker")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.pages\.dev" if "*" not in _origins else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Storage ---

def load_routes():
    if not ROUTES_FILE.exists():
        return []
    with ROUTES_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def append_route(route):
    _data_dir.mkdir(parents=True, exist_ok=True)
    routes = load_routes()
    routes.append(route)
    with ROUTES_FILE.open("w", encoding="utf-8") as f:
        json.dump(routes, f, ensure_ascii=False, indent=2)


# --- Formatting ---

def fmt_duration(seconds):
    minutes = seconds // 60
    h, m = divmod(minutes, 60)
    if h > 0:
        return f"{h} h {m} min"
    return f"{m} min"


# --- Google Maps Directions ---

async def calc_google(origin, destination, origin_lat=None, origin_lon=None, dest_lat=None, dest_lon=None):
    import time as _time
    origin_param = f"{origin_lat},{origin_lon}" if origin_lat is not None else origin
    dest_param   = f"{dest_lat},{dest_lon}"     if dest_lat   is not None else destination
    params = {
        "origin": origin_param,
        "destination": dest_param,
        "key": GOOGLE_MAPS_API_KEY,
        "language": "sl",
        "departure_time": int(_time.time()),
        "traffic_model": "best_guess",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get("https://maps.googleapis.com/maps/api/directions/json", params=params)
    data = r.json()
    status = data.get("status", "UNKNOWN")
    if status == "ZERO_RESULTS":
        raise ValueError("Pot med tema krajema ni bila najdena.")
    if status == "NOT_FOUND":
        raise ValueError("Eden od naslovov ni bil prepoznan.")
    if status == "REQUEST_DENIED":
        raise ValueError("Google Maps API kljuc je neveljaven ali Directions API ni aktiviran.")
    if status in ("OVER_DAILY_LIMIT", "OVER_QUERY_LIMIT"):
        raise ValueError("Presezena je dnevna omejitev Google Maps API klicev.")
    if status != "OK":
        raise ValueError(f"Google Maps napaka: {status}")
    leg = data["routes"][0]["legs"][0]
    km = round(leg["distance"]["value"] / 1000, 1)
    traffic = leg.get("duration_in_traffic") or leg["duration"]
    dur = fmt_duration(traffic["value"])
    return km, dur


# --- OSRM + Nominatim ---

async def geocode_nominatim(address):
    params = {"q": address, "format": "json", "limit": 1}
    headers = {"User-Agent": "KilometerTracker/1.0"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get("https://nominatim.openstreetmap.org/search", params=params, headers=headers)
    results = r.json()
    if not results:
        raise ValueError(f"Naslov '{address}' ni bil najden.")
    return float(results[0]["lat"]), float(results[0]["lon"])


async def calc_osrm(origin, destination, origin_lat=None, origin_lon=None, dest_lat=None, dest_lon=None):
    if origin_lat is not None:
        lat1, lon1 = origin_lat, origin_lon
    else:
        lat1, lon1 = await geocode_nominatim(origin)
    if dest_lat is not None:
        lat2, lon2 = dest_lat, dest_lon
    else:
        lat2, lon2 = await geocode_nominatim(destination)
    url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, params={"overview": "false"})
    data = r.json()
    if data.get("code") != "Ok":
        raise ValueError("OSRM: pot ni bila najdena.")
    route = data["routes"][0]
    km = round(route["distance"] / 1000, 1)
    dur = fmt_duration(int(route["duration"]))
    return km, dur


# --- Unified calculate ---

async def calculate_route(origin, destination, origin_lat=None, origin_lon=None, dest_lat=None, dest_lon=None):
    if GOOGLE_MAPS_API_KEY:
        km, dur = await calc_google(origin, destination, origin_lat, origin_lon, dest_lat, dest_lon)
        source = "google"
    else:
        km, dur = await calc_osrm(origin, destination, origin_lat, origin_lon, dest_lat, dest_lon)
        source = "osrm"
    maps_url = (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={origin.replace(' ', '+')}"
        f"&destination={destination.replace(' ', '+')}"
    )
    return {"distance_km": km, "duration": dur, "maps_url": maps_url, "source": source}


# --- Pydantic models ---

class CalculateRequest(BaseModel):
    origin: str
    destination: str
    origin_lat: float = None
    origin_lon: float = None
    dest_lat: float = None
    dest_lon: float = None


class SaveRequest(BaseModel):
    origin: str
    destination: str
    distance_km: float
    duration: str
    source: str


# --- Core endpoints ---

@app.post("/calculate")
async def calculate(req: CalculateRequest):
    if not req.origin.strip() or not req.destination.strip():
        raise HTTPException(400, "Izhodisce in cilj ne smeta biti prazna.")
    try:
        result = await calculate_route(
            req.origin.strip(), req.destination.strip(),
            req.origin_lat, req.origin_lon, req.dest_lat, req.dest_lon,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except httpx.TimeoutException:
        raise HTTPException(503, "Zahteva je potekla. Poskusi znova.")
    except Exception as e:
        raise HTTPException(500, f"Nepricakovana napaka: {e}")
    return result


@app.post("/routes")
async def save_route(req: SaveRequest):
    entry = {
        "datetime": datetime.now().isoformat(timespec="seconds"),
        "origin": req.origin,
        "destination": req.destination,
        "distance_km": req.distance_km,
        "duration": req.duration,
        "source": req.source,
    }
    try:
        append_route(entry)
    except Exception as e:
        raise HTTPException(500, f"Napaka pri shranjevanju: {e}")
    return {"ok": True}


@app.get("/routes")
async def get_routes():
    routes = load_routes()
    total_km = round(sum(r["distance_km"] for r in routes), 1)
    return {"routes": routes, "total_km": total_km}


@app.get("/routes/export")
async def export_csv():
    routes = load_routes()
    output = io.StringIO()
    fields = ["datetime", "origin", "destination", "distance_km", "duration", "source"]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(routes)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=prevozeni_kilometri.csv"},
    )


# --- Autocomplete helpers ---

def _norm(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


async def _places_autocomplete(q):
    params = {
        "input": q,
        "key": GOOGLE_MAPS_API_KEY,
        "language": "sl",
        "location": "46.1,14.9",
        "radius": 300000,
    }
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get("https://maps.googleapis.com/maps/api/place/autocomplete/json", params=params)
    data = r.json()
    results = []
    for p in data.get("predictions", []):
        st   = p.get("structured_formatting", {})
        main = st.get("main_text", "")
        sub  = st.get("secondary_text", "")
        text = p.get("description", main)
        results.append({
            "place_id": p["place_id"],
            "text": text,
            "main": main,
            "sub": sub,
            "lat": None,
            "lon": None,
        })
    return {"results": results, "source": "google"}


async def _nominatim_autocomplete(q):
    def _format_nom(s):
        a = s.get("address", {})
        poi    = a.get("amenity") or a.get("shop") or a.get("tourism") or a.get("leisure") or a.get("historic") or a.get("office")
        street = a.get("road") or a.get("pedestrian") or a.get("path") or a.get("footway")
        num    = a.get("house_number", "")
        city   = a.get("city") or a.get("town") or a.get("village") or a.get("municipality")
        suburb = a.get("suburb") or a.get("neighbourhood") or a.get("district")
        postcode = a.get("postcode", "")
        region   = a.get("county") or a.get("state") or ""
        cc       = (a.get("country_code") or "").upper()
        foreign  = a.get("country") if cc and cc != "SI" else None
        if poi:
            main = poi
            if street:
                main += f", {street}{' ' + num if num else ''}"
            if city:
                main += f", {city}"
        elif street:
            main = f"{street} {num}".strip() if num else street
            if city:
                main += f", {city}"
        elif city:
            main = city
        else:
            main = s.get("display_name", "").split(",")[0].strip()
        sub_parts = [x for x in [suburb, postcode, region, foreign] if x]
        sub = ", ".join(sub_parts[:3])
        return main, sub

    params = {
        "q": q, "format": "json", "limit": 10, "addressdetails": 1,
        "viewbox": "13.4,46.9,16.6,45.4", "bounded": 0,
        "countrycodes": "si,hr,at,it,hu", "dedupe": 1,
        "accept-language": "sl,en",
    }
    headers = {"User-Agent": "KilometerTracker/1.0"}
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get("https://nominatim.openstreetmap.org/search", params=params, headers=headers)
    data = r.json()
    words = [w for w in _norm(q).split() if len(w) >= 2]
    seen = set()
    results = []
    for s in data:
        if len(results) >= 5:
            break
        a = s.get("address", {})
        name_fields = " ".join(filter(None, [
            a.get("amenity"), a.get("shop"), a.get("tourism"), a.get("leisure"),
            a.get("historic"), a.get("office"), a.get("road"), a.get("pedestrian"),
            a.get("path"), a.get("footway"), a.get("city"), a.get("town"),
            a.get("village"), a.get("municipality"), s.get("name"),
        ]))
        if words and not any(w in _norm(name_fields) for w in words):
            continue
        main, sub = _format_nom(s)
        key = _norm(main)
        if key in seen:
            continue
        seen.add(key)
        results.append({
            "place_id": str(s.get("place_id", "")),
            "text": main,
            "main": main,
            "sub": sub,
            "lat": float(s["lat"]),
            "lon": float(s["lon"]),
        })
    return {"results": results, "source": "nominatim"}


# --- Autocomplete endpoints ---

@app.get("/autocomplete")
async def autocomplete(q: str = ""):
    q = q.strip()
    if len(q) < 2:
        return {"results": [], "source": "none"}
    if GOOGLE_MAPS_API_KEY:
        try:
            return await _places_autocomplete(q)
        except Exception:
            pass
    return await _nominatim_autocomplete(q)


@app.get("/place")
async def place_details(place_id: str):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(400, "Ni Google Maps API kljuca.")
    params = {
        "place_id": place_id,
        "key": GOOGLE_MAPS_API_KEY,
        "fields": "geometry",
        "language": "sl",
    }
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get("https://maps.googleapis.com/maps/api/place/details/json", params=params)
    data = r.json()
    if data.get("status") != "OK":
        raise HTTPException(400, f"Kraj ni bil najden: {data.get('status')}")
    loc = data["result"]["geometry"]["location"]
    return {"lat": loc["lat"], "lon": loc["lng"]}


@app.get("/reverse")
async def reverse_geocode(lat: float, lon: float):
    if GOOGLE_MAPS_API_KEY:
        params = {
            "latlng": f"{lat},{lon}",
            "key": GOOGLE_MAPS_API_KEY,
            "language": "sl",
            "result_type": "street_address|route|locality",
        }
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get("https://maps.googleapis.com/maps/api/geocode/json", params=params)
        data = r.json()
        if data.get("status") == "OK" and data.get("results"):
            return {"address": data["results"][0]["formatted_address"]}
    params = {"lat": lat, "lon": lon, "format": "json", "addressdetails": 1, "accept-language": "sl,en"}
    headers = {"User-Agent": "KilometerTracker/1.0"}
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get("https://nominatim.openstreetmap.org/reverse", params=params, headers=headers)
    data = r.json()
    if "error" in data:
        raise HTTPException(400, "Ni mogoche dolociti naslova.")
    a = data.get("address", {})
    street = a.get("road") or a.get("pedestrian") or a.get("path") or ""
    num    = a.get("house_number", "")
    city   = a.get("city") or a.get("town") or a.get("village") or a.get("municipality") or ""
    if street:
        addr = f"{street} {num}".strip() if num else street
        if city:
            addr += f", {city}"
    elif city:
        addr = city
    else:
        addr = data.get("display_name", "").split(",")[0].strip()
    return {"address": addr}
