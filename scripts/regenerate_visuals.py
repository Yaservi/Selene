"""Create illustrative globe textures from NASA SVS CGI Moon Kit originals."""

from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path

import numpy as np
from PIL import Image
import requests
import tifffile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
FILES = ("lroc_color_poles_4k.tif", "ldem_4.tif")


def main():
    originals = {}
    for name in FILES:
        response = requests.get(SOURCE + name, timeout=180)
        response.raise_for_status()
        originals[name] = response.content
        print(f"NASA SVS {name}: {len(response.content)} bytes", flush=True)

    color = Image.open(BytesIO(originals[FILES[0]])).convert("RGB")
    color.save(ROOT / "public/moon.webp", format="WEBP", quality=87, method=6)

    elevation = tifffile.imread(BytesIO(originals[FILES[1]])).astype(np.float32)
    if elevation.shape != (720, 1440):
        raise ValueError("Unexpected NASA displacement-map dimensions")
    # Encode local east and north slopes around 127, as expected by the globe renderer.
    east = np.roll(elevation, -1, axis=1) - np.roll(elevation, 1, axis=1)
    north = np.empty_like(elevation)
    north[1:-1] = elevation[:-2] - elevation[2:]
    north[0], north[-1] = north[1], north[-2]
    normal = np.empty((*elevation.shape, 3), dtype=np.uint8)
    normal[..., 0] = np.clip(127.5 + east * 64, 0, 255)
    normal[..., 1] = np.clip(127.5 + north * 64, 0, 255)
    normal[..., 2] = 128
    Image.fromarray(normal).resize((2048, 1024), Image.Resampling.BILINEAR).save(
        ROOT / "public/relief.webp", format="WEBP", quality=86, method=6
    )
    unused = ROOT / "public/overview.webp"
    if unused.exists():
        unused.unlink()
    receipt = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source": "NASA Scientific Visualization Studio CGI Moon Kit, https://svs.gsfc.nasa.gov/4720/",
        "source_sha256": {name: hashlib.sha256(raw).hexdigest() for name, raw in originals.items()},
        "output_sha256": {name: hashlib.sha256((ROOT / "public" / name).read_bytes()).hexdigest()
                          for name in ("moon.webp", "relief.webp")},
        "note": "Globe rendering only; no scientific visibility calculation uses these textures.",
    }
    (ROOT / "public/data/visual-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
