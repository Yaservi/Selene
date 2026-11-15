"""Refresh lunar observer angles and DSN geometry from JPL and NAIF sources."""

import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time

import numpy as np
import requests
import spiceypy as spice


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/data"
CACHE = ROOT / ".source-cache"
HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"
KERNEL_BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
KERNELS = [
    "lsk/naif0012.tls",
    "pck/pck00011.tpc",
    "pck/moon_pa_de440_200625.bpc",
    "fk/satellites/moon_de440_250416.tf",
    "spk/planets/de440s.bsp",
    "pck/earth_1962_260806_2126_combined.bpc",
    "spk/stations/earthstns_itrf93_260814.bsp",
    "fk/stations/earth_topo_260814.tf",
]
STATIONS = ["DSS-14", "DSS-43", "DSS-63"]
START = "2027-01-15T00:00:00Z"
HOURS = 720
MOON_RADIUS_KM = 1737.4


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def fetch(url, params=None):
    for attempt in range(7):
        try:
            response = requests.get(url, params=params, timeout=120)
            response.raise_for_status()
            return response.content
        except requests.RequestException:
            if attempt == 6:
                raise
            time.sleep(min(30, 3 * 2 ** attempt))


def observer_rows(task):
    index, body, profile = task
    latitude, longitude = profile["latitude"], profile["longitude"]
    altitude_km = (profile["groundHeight"] + 2) / 1000
    params = {
        "format": "json", "COMMAND": str(body), "EPHEM_TYPE": "OBSERVER",
        "CENTER": "coord@301", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"{longitude % 360},{latitude},{altitude_km}",
        "START_TIME": "2027-01-15", "STOP_TIME": "2027-02-14",
        "STEP_SIZE": "1 h", "QUANTITIES": "4,13", "CSV_FORMAT": "YES",
        "APPARENT": "AIRLESS",
    }
    request_id = sha256(json.dumps(params, sort_keys=True).encode())
    cache_path = CACHE / "jpl" / f"{request_id}.json"
    if cache_path.exists():
        raw = cache_path.read_bytes()
    else:
        raw = fetch(HORIZONS_API, params)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(raw)
    parsed = json.loads(raw)["result"]
    if "$$SOE" not in parsed or "$$EOE" not in parsed:
        raise ValueError(f"No observer table for site {index}, body {body}: {parsed[-500:]}")
    lines = parsed.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip().splitlines()
    if len(lines) < HOURS or "2027-Jan-15 00:00" not in lines[0] or "2027-Feb-13 23:00" not in lines[HOURS - 1]:
        raise ValueError(f"Unexpected Horizons time grid: site {index}, body {body}")
    rows = []
    for line in lines[:HOURS]:
        fields = line.split(",")
        rows.append([float(fields[3]), float(fields[4]), float(fields[5]) / 7200])
    return index, "sun" if body == 10 else "earth", rows, {
        "site": index, "body": body, "url": HORIZONS_API,
        "query": params, "response_sha256": sha256(raw),
    }


def download_kernel(relative):
    url = KERNEL_BASE + relative
    path = CACHE / "kernels" / Path(relative).name
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raw = path.read_bytes()
    else:
        raw = fetch(url)
        path.write_bytes(raw)
    return path, {"url": url, "bytes": len(raw), "sha256": sha256(raw)}


def lunar_horizon(profile, azimuth):
    values = np.asarray(profile["elevation"])
    position = (azimuth % 360) / profile["azimuthStep"]
    left = np.floor(position).astype(int)
    fraction = position - left
    return values[left % len(values)] * (1 - fraction) + values[(left + 1) % len(values)] * fraction


def dsn_geometry(profiles, kernels):
    spice.kclear()
    for path, _ in kernels:
        spice.furnsh(str(path))
    first = spice.str2et("2027-01-15T00:00:00")
    times = first + np.arange(HOURS) * 3600
    encoded = []
    for index, profile in enumerate(profiles):
        latitude = np.radians(profile["latitude"])
        longitude = np.radians(profile["longitude"])
        radius = MOON_RADIUS_KM + (profile["groundHeight"] + 2) / 1000
        observer = spice.latrec(radius, longitude, latitude)
        flags = np.zeros(HOURS, np.uint8)
        for station_index, station in enumerate(STATIONS):
            angles = np.degrees(np.array([
                spice.azlcpo("ELLIPSOID", station, epoch, "LT+S", False, True,
                              observer, "MOON", "MOON_ME")[0][1:3]
                for epoch in times
            ]))
            azimuth, lunar_elevation = angles.T
            vectors = np.array([
                spice.spkcpt(observer, "MOON", "MOON_ME", epoch,
                             f"{station}_TOPO", "OBSERVER", "LT+S", station)[0][:3]
                for epoch in times
            ])
            terrestrial_elevation = np.degrees(np.arctan2(vectors[:, 2], np.hypot(vectors[:, 0], vectors[:, 1])))
            allowed = (lunar_elevation > lunar_horizon(profile, azimuth)) & (terrestrial_elevation >= 6)
            flags |= allowed.astype(np.uint8) << station_index
        encoded.append(base64.b64encode(flags.tobytes()).decode("ascii"))
        print(f"DSN {index + 1}/{len(profiles)}", flush=True)
    spice.kclear()
    return {"startUtc": START, "stepHours": 1, "hours": HOURS,
            "stations": STATIONS, "flagsBase64": encoded}


def main():
    profiles = json.loads((DATA / "horizons.json").read_text())
    receipt = json.loads((DATA / "terrain-receipt.json").read_text())
    terrain_hash = receipt["sha256"]["horizons.json"]
    if sha256((DATA / "horizons.json").read_bytes()) != terrain_hash:
        raise ValueError("Terrain changed after its source receipt was written")
    tasks = [(index, body, profile) for index, profile in enumerate(profiles) for body in (10, 399)]
    angles = [{} for _ in profiles]
    queries = []
    for task in tasks:
        index, body, rows, query = observer_rows(task)
        angles[index][body] = rows
        queries.append(query)
        print(f"JPL {len(queries)}/{len(tasks)}", flush=True)
        time.sleep(1)
    if any(set(site) != {"sun", "earth"} or any(len(site[body]) != HOURS for body in ("sun", "earth"))
           for site in angles):
        raise ValueError("Incomplete Sun/Earth ephemeris for the application")
    with ThreadPoolExecutor(max_workers=3) as pool:
        kernels = list(pool.map(download_kernel, KERNELS))
    masks = dsn_geometry(profiles, kernels)
    outputs = {"ephemeris.json": angles, "dsn.json": masks}
    hashes = {}
    for name, payload in outputs.items():
        raw = (json.dumps(payload, separators=(",", ":")) + "\n").encode()
        (DATA / name).write_bytes(raw)
        hashes[name] = sha256(raw)
    (DATA / "sky-receipt.json").write_text(json.dumps({
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "input_horizons_sha256": terrain_hash,
        "jpl_queries": queries,
        "naif_kernels": [item for _, item in kernels],
        "method": "JPL airless lunar observer angles, 1 h cadence; NAIF geometric station contact at 2 m above LOLA terrain with 6 degree Earth-station cutoff.",
        "sha256": hashes,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
