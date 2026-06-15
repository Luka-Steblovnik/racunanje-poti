"""
Kilometer Tracker — FastAPI backend
"""

import os
import csv
import io
import json
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


def fmt_duration(seconds):
    minutes = seconds // 60
    h, m = divmod(minutes, 60)
    if h > 0:
        return f"{h} h {m} min"
    return f"{m} min"


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


@app.get("/autocomplete")
async def autocomplete(q: str = ""):
    if not q or len(q.strip()) < 2:
        return {"type": "FeatureCollection", "features": []}
    params = {"q": q, "lat": "46.1", "lon": "14.9", "zoom": "12", "limit": "7", "lang": "sl"}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                "https://photon.komoot.io/api/",
                params=params,
                headers={"User-Agent": "KilometerTracker/1.0"},
            )
        return r.json()
    except Exception:
        return {"type": "FeatureCollection", "features": []}


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
