"""Build the nine comparison horizons directly from public NASA LOLA GeoTIFFs.

The 5 m Site23 grid covers Malapert inside 5 km; a 10 m polar grid covers
the other sites. The 80 m grid covers 5–20 km and 240 m covers 20–200 km.
The display mesh is a separate 100 m grid and does not drive visibility.
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import time

import numpy as np
import rasterio
import requests
from rasterio.windows import from_bounds
from scipy.ndimage import map_coordinates


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/data"
BASE = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/"
SOURCES = {
    "fine": BASE + "LDEM_83S_10MPP_ADJ.TIF",
    "near": BASE + "LDEM_80S_80MPP_ADJ.TIF",
    "far": BASE + "LDEM_60S_240MPP_ADJ.TIF",
    "malapert": "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site23/Site23_final_adj_5mpp_surf.tif",
}
MALAPERT_SHA256 = "12d280a59cd7580415f6bada638d0abe025ce6727541fddf68d5dc371a6c94cf"
RADIUS = 1_737_400.0
SITES = [
    (-85.295, 36.917), (-84.074, 59.197), (-85.992, 2.056),
    (-83.763, -69.983), (-86.990, -24.254), (-84.805, 24.887),
    (-85.466, 33.040), (-88.450, -67.859), (-87.478, 124.521),
]


def basis(latitude, longitude):
    lat, lon = np.radians([latitude, longitude])
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.cross(up, east)
    return up, east, north


def project(direction):
    denominator = 1.0 - direction[..., 2]
    return 2 * RADIUS * direction[..., 1] / denominator, 2 * RADIUS * direction[..., 0] / denominator


def crop(dataset, center, half_width):
    x, y = center
    window = from_bounds(x - half_width, y - half_width, x + half_width, y + half_width, dataset.transform)
    window = window.round_offsets().round_lengths()
    data = dataset.read(1, window=window, masked=True).filled(np.nan)
    transform = dataset.window_transform(window)
    return data, transform


def sample(grid, transform, x, y):
    x, y = np.broadcast_arrays(np.asarray(x), np.asarray(y))
    col = (x - transform.c) / transform.a - 0.5
    row = (y - transform.f) / transform.e - 0.5
    values = map_coordinates(grid, [np.atleast_1d(row), np.atleast_1d(col)], order=1,
                             mode="constant", cval=np.nan, prefilter=False).reshape(x.shape)
    if not np.isfinite(values).all():
        raise ValueError("LOLA does not cover the required sample positions")
    return values


def write_json(name, data):
    path = OUTPUT / name
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def malapert_source():
    path = ROOT / ".source-cache" / "Site23_final_adj_5mpp_surf.tif"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        probe = requests.get(SOURCES["malapert"], headers={"Range": "bytes=0-0"}, timeout=60)
        probe.raise_for_status()
        if probe.status_code != 206:
            raise ValueError("The Malapert source does not support byte ranges")
        size = int(probe.headers["Content-Range"].split("/")[-1])
        partial = path.with_suffix(".part")
        with partial.open("ab") as output:
            for offset in range(output.tell(), size, 2 * 1024 * 1024):
                last = min(offset + 2 * 1024 * 1024, size) - 1
                for attempt in range(5):
                    try:
                        response = requests.get(SOURCES["malapert"],
                                                headers={"Range": f"bytes={offset}-{last}"}, timeout=60)
                        response.raise_for_status()
                        if response.status_code != 206 or len(response.content) != last - offset + 1:
                            raise ValueError("Incomplete Malapert source range")
                        output.write(response.content)
                        break
                    except (requests.RequestException, ValueError):
                        if attempt == 4:
                            raise
                        time.sleep(2 ** attempt)
        partial.replace(path)
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if digest != MALAPERT_SHA256:
        raise ValueError("The Malapert NASA GeoTIFF differs from the pinned source")
    return path


def main():
    profiles = []
    receipts = {}
    settings = {
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".TIF",
        "GDAL_HTTP_MAX_RETRY": "3",
    }
    with rasterio.Env(**settings):
        with rasterio.open("/vsicurl/" + SOURCES["fine"]) as fine:
            with rasterio.open("/vsicurl/" + SOURCES["near"]) as near:
                with rasterio.open("/vsicurl/" + SOURCES["far"]) as far:
                    with rasterio.open(malapert_source()) as malapert:
                        build_sites(fine, near, far, malapert, profiles, receipts)


def build_sites(fine, near, far, malapert, profiles, receipts):
    for index, (latitude, longitude) in enumerate(SITES):
        up, east, north = basis(latitude, longitude)
        center = tuple(float(value) for value in project(up))
        detail_source = malapert if index == 2 else fine
        detailed, detailed_transform = crop(detail_source, center, 5_500)
        close, close_transform = crop(near, center, 22_000)
        distant, distant_transform = crop(far, center, 202_000)
        ground = float(sample(detailed, detailed_transform, *center))

        azimuth_step = 0.125 if index < 2 else 0.25
        angles = np.radians(np.arange(0, 360, azimuth_step))
        # Nearby crests can dominate a 2 m observer's horizon. A 1 m ray step
        # across the local DEM catches maxima between its pixel centers.
        distance = np.r_[np.arange(0.5, 100.0, 0.5),
                         np.arange(100.0, 5_000, 1.0),
                         np.arange(5_000.0, 20_000, 80.0),
                         np.arange(20_000.0, 200_001, 240.0)]
        arc = distance / RADIUS
        split_fine = int(np.count_nonzero(distance < 5_000))
        split_near = int(np.count_nonzero(distance < 20_000))
        elevations, obstructions = [], []
        for first in range(0, len(angles), 64):
            azimuth = angles[first:first + 64]
            headings = np.sin(azimuth)[:, None] * east + np.cos(azimuth)[:, None] * north
            direction = np.cos(arc)[None, :, None] * up + np.sin(arc)[None, :, None] * headings[:, None, :]
            x, y = project(direction)
            heights = np.empty(x.shape)
            heights[:, :split_fine] = sample(detailed, detailed_transform, x[:, :split_fine], y[:, :split_fine])
            heights[:, split_fine:split_near] = sample(close, close_transform,
                                                       x[:, split_fine:split_near], y[:, split_fine:split_near])
            heights[:, split_near:] = sample(distant, distant_transform,
                                             x[:, split_near:], y[:, split_near:])
            horizon_angles = np.degrees(np.arctan2(
                (RADIUS + heights) * np.cos(arc) - RADIUS - ground - 2.0,
                (RADIUS + heights) * np.sin(arc),
            ))
            winner = np.argmax(horizon_angles, axis=1)
            elevations.extend(horizon_angles[np.arange(len(winner)), winner].tolist())
            obstructions.extend(distance[winner].tolist())
        profile = {
            "elevation": np.round(elevations, 7).tolist(),
            "azimuthStep": azimuth_step,
            "groundHeight": ground,
            "observerHeight": 2,
            "obstacleDistance": obstructions,
            "latitude": latitude,
            "longitude": longitude,
            "sources": [SOURCES["malapert"] if index == 2 else SOURCES["fine"], SOURCES["near"], SOURCES["far"]],
        }
        profiles.append(profile)

        axis = np.arange(-3_000.0, 3_001.0, 100.0)
        east_grid, north_grid = np.meshgrid(axis, axis)
        tangent = up + (east_grid[..., None] * east + north_grid[..., None] * north) / RADIUS
        tangent /= np.linalg.norm(tangent, axis=-1)[..., None]
        local_x, local_y = project(tangent)
        local = sample(detailed, detailed_transform, local_x, local_y)
        terrain = {
            "n": len(axis), "spacing": 100,
            "heights": np.round(local.ravel(), 2).tolist(),
            "latitude": latitude, "longitude": longitude,
            "caption": f"Local LOLA terrain · {5 if index == 2 else 10} m source pixels · 100 m display grid · 6 × 6 km extent · drag to rotate.",
        }
        receipts[f"terrain-{index}.json"] = write_json(f"terrain-{index}.json", terrain)
        print(f"LOLA {index + 1}/{len(SITES)}: {latitude}, {longitude}", flush=True)
    receipts["horizons.json"] = write_json("horizons.json", profiles)
    (OUTPUT / "terrain-receipt.json").write_text(json.dumps({
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "sources": SOURCES,
        "malapert_source_sha256": MALAPERT_SHA256,
        "method": "Bilinear south-polar stereographic LOLA heights; 5 m Site23 near Malapert, 10 m elsewhere; spherical rays at 0.125 degrees for Nobile sites and 0.25 degrees elsewhere, 0.5 m radial steps inside 100 m, 1 m to 5 km, 80 m to 20 km, 240 m to 200 km; observer height 2 m.",
        "sha256": receipts,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
