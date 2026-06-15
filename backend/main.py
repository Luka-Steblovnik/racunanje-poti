"""
Kilometer Tracker — FastAPI backend
=====================================
Prioriteta API-jev za izračun razdalje:
  1. Google Maps Directions API  (zahteva GOOGLE_MAPS_API_KEY v .env)
  2. OSRM + Nominatim fallback   (brezplačno, brez ključa)
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

GOOGLE_MAPS_API_KEY: str | None = os.getenv("GOOGLE_MAPS_API_KEY")

# DATA_DIR: za Railway nastavi na pot volumna (npr. /data), lokalno pusti prazno
_data_dir = Path(os.getenv("DATA_DIR", str(Path(__file__).parent)))
ROUTES_FILE = _data_dir / "routes.json"

app = FastAPI(title="Kilometer Tracker")

# ALLOWED_ORIGINS: za produkcijo nastavi na svojo Cloudflare Pages domeno,
# npr. "https://kilometer-tracker.pages.dev" — ali "*" za vse domene.
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


# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def load_routes() -> list[dict]:
    if not ROUTES_FILE.exists():
        return []
    with ROUTES_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def append_route(route: dict) -> None:
    _data_dir.mkdir(parents=True, exist_ok=True)  # ustvari mapo, če ne obstaja
    routes = load_routes()
    routes.append(route)
    with ROUTES_FILE.open("w", encoding="utf-8") as f:
        json.dump(routes, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Duration formatting
# ---------------------------------------------------------------------------

def fmt_duration(seconds: int) -> str:
    minutes = seconds // 60
    h, m = divmod(minutes, 60)
    if h > 0:
        return f"{h} h {m} min"
    return f"{m} min"


# ---------------------------------------------------------------------------
# Distance calculation — Google Maps
# ---------------------------------------------------------------------------

async def calc_google(origin: str, destination: str) -> tuple[float, str]:
    """Returns (distance_km, duration_str). Raises ValueError on bad input."""
    url = "https://maps.googleapis.com/maps/api/directions/json"
    import time as _time
    params = {
        "origin": origin,
        "destination": destination,
        "key": GOOGLE_MAPS_API_KEY,
        "language": "sl",
        "departure_time": int(_time.time()),  # promet v realnem času
        "traffic_model": "best_guess",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params=params)
    data = r.json()

    status = data.get("status", "UNKNOWN")
    if status == "ZERO_RESULTS":
        raise ValueError("Pot med tema krajema ni bila najdena.")
    if status == "NOT_FOUND":
        raise ValueError("Eden od naslovov ni bil prepoznan.")
    if status == "REQUEST_DENIED":
        raise ValueError(
            "Google Maps API ključ je neveljaven ali Directions API ni aktiviran."
        )
    if status in ("OVER_DAILY_LIMIT", "OVER_QUERY_LIMIT"):
        raise ValueError("Presežena je dnevna omejitev Google Maps API klicev.")
    if status != "OK":
        raise ValueError(f"Google Maps napaka: {status}")

    leg = data["routes"][0]["legs"][0]
    km = round(leg["distance"]["value"] / 1000, 1)
    # duration_in_traffic = čas z gnevčo, duration = brez (fallback)
    traffic = leg.get("duration_in_traffic") or leg["duration"]
    dur = fmt_duration(traffic["value"])
    return km, dur


# ---------------------------------------------------------------------------
# Distance calculation — OSRM + Nominatim fallback
# ---------------------------------------------------------------------------

async def geocode_nominatim(address: str) -> tuple[float, float]:
    """Geocode an address via Nominatim. Returns (lat, lon)."""
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": address, "format": "json", "limit": 1}
    headers = {"User-Agent": "KilometerTracker/1.0 (open-source)"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params=params, headers=headers)
    results = r.json()
    if not results:
        raise ValueError(f"Naslov '{address}' ni bil najden (Nominatim).")
    return float(results[0]["lat"]), float(results[0]["lon"])


async def calc_osrm(
    origin: str,
    destination: str,
    origin_lat: float | None = None,
    origin_lon: float | None = None,
    dest_lat: float | None = None,
    dest_lon: float | None = None,
) -> tuple[float, str]:
    """Returns (distance_km, duration_str) using OSRM public demo server."""
    if origin_lat is not None and origin_lon is not None:
        lat1, lon1 = origin_lat, origin_lon
    else:
        lat1, lon1 = await geocode_nominatim(origin)

    if dest_lat is not None and dest_lon is not None:
        lat2, lon2 = dest_lat, dest_lon
    else:
        lat2, lon2 = await geocode_nominatim(destination)

    url = (
        f"http://router.project-osrm.org/route/v1/driving/"
        f"{lon1},{lat1};{lon2},{lat2}"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url, params={"overview": "false"})
    data = r.json()

    if data.get("code") != "Ok":
        raise ValueError("OSRM: pot ni bila najdena.")

    route = data["routes"][0]
    km = round(route["distance"] / 1000, 1)
    dur = fmt_duration(int(route["duration"]))
    return km, dur


# ---------------------------------------------------------------------------
# Unified calculate
# ---------------------------------------------------------------------------

async def calculate_route(
    origin: str,
    destination: str,
    origin_lat: float | None = None,
    origin_lon: float | None = None,
    dest_lat: float | None = None,
    dest_lon: float | None = None,
) -> dict:
    """Try Google Maps first; fall back to OSRM."""
    if GOOGLE_MAPS_API_KEY:
        km, dur = await calc_google(origin, destination)
        source = "google"
    else:
        # OSRM fallback — clearly marked as per spec
        km, dur = await calc_osrm(origin, destination, origin_lat, origin_lon, dest_lat, dest_lon)
        source = "osrm"  # fallback: no GOOGLE_MAPS_API_KEY set

    maps_url = (
        "https://www.google.com/maps/dir/?api=1"
        f"&origin={origin.replace(' ', '+')}"
        f"&destination={destination.replace(' ', '+')}"
    )
    return {"distance_km": km, "duration": dur, "maps_url": maps_url, "source": source}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CalculateRequest(BaseModel):
    origin: str
    destination: str
    origin_lat: float | None = None
    origin_lon: float | None = None
    dest_lat: float | None = None
    dest_lon: float | None = None


class SaveRequest(BaseModel):
    origin: str
    destination: str
    distance_km: float
    duration: str
    source: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/calculate")
async def calculate(req: CalculateRequest):
    if not req.origin.strip() or not req.destination.strip():
        raise HTTPException(400, "Izhodišče in cilj ne smeta biti prazna.")
    try:
        result = await calculate_route(
            req.origin.strip(), req.destination.strip(),
            req.origin_lat, req.origin_lon, req.dest_lat, req.dest_lon,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except httpx.TimeoutException:
        raise HTTPException(
            503,
            "Zahteva je potekla. Preveri internetno povezavo ali poskusi znova.",
        )
    except Exception as e:
        raise HTTPException(500, f"Nepričakovana napaka: {e}")
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
        headers={
            "Content-Disposition": "attachment; filename=prevozeni_kilometri.csv"
        },
    )
