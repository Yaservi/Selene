# SELENE — Lunar South Pole Navigator

SELENE is an interactive comparison of candidate lunar south pole locations. Choose two sites, move through a time interval, inspect the local terrain horizon, and compare three related questions:

1. Is any part of the Sun's disk above the local horizon?
2. Is the center of Earth above that horizon?
3. Is at least one of three Deep Space Network antennas geometrically visible from the site, while the Moon is at least 6° above that antenna's terrestrial horizon?

The interface is in English. It works as a static site without login, API keys, or a runtime backend. The globe and local elevation mesh provide spatial context; the quantitative results come from the separate horizon and ephemeris data.

## Quick start

Requirements: Node.js 20+ for packaging, and any modern browser for viewing.

```bash
npm run build
npm run serve
```

Open `http://localhost:8000/`. A static web server is needed because browsers normally block `fetch()` of local JSON from a `file://` page. `npm run build` copies the authored modules and scientific assets into `dist/`; there are no third-party runtime packages.

## Use the app

- **Configure sites** opens the selection panel. Compare exactly two distinct locations from nine candidate locations. The de Gerlache point is marked *Experimental*.
- **Time controls** choose an instant, play at 1, 2, or 5 simulated hours per real second, jump 1, 6, or 12 hours, and select a 7-, 14-, or 28-day comparison period. The player and site settings stay synchronized.
- **Compare sites** reports current visibility and period totals. Its small bars show the selected instant: solar-disk fraction, Earth-center visibility, and DSN geometry, respectively.
- **Availability windows** plots the hourly states and their conjunction, plus the longest simultaneous Sun and DSN run. Period percentages stay fixed while the player moves; the cursor and current-state labels follow the selected instant.
- **Local horizon** plots the terrain profile by azimuth, with the apparent elevations of the Sun and Earth for the selected time.
- **Local terrain** renders the site's sampled LOLA elevation grid. Drag to rotate; vertical exaggeration changes display only.
- **Moon globe** shows all nine candidate locations as georeferenced points. Click a point to put it in the current comparison slot. Drag the globe to rotate it.
- **Live minimap** mirrors the current globe orientation, marks the same sites, and highlights the selected point. Click it to reset the globe view.
- **View tools** enter browser fullscreen or hide the panels for a Moon-only view. The Moon-only view keeps site markers, Sun/Earth directions, the azimuth grid, and a compact readout of their azimuth and elevation. Use the same tool to restore the panels.

The packaged interval is **15 January–13 February 2027 UTC**. Start date is 15 or 16 January; comparison durations are 7, 14, or 28 days. The numerical metrics sample each hour. The time slider interpolates apparent angles between hourly samples, so a current-state label may change between two period samples.

## Scientific method

| Input | Use |
| --- | --- |
| NASA/JPL Horizons positions | Apparent Sun and Earth azimuth, elevation, and angular radius from each lunar point at one-hour intervals. |
| NASA LOLA elevation maps | Nine local/regional horizon profiles regenerated from the 5 m Site23 map at Malapert, 10 m pixels elsewhere to 5 km, 80 m pixels to 20 km, and 240 m pixels from there to 200 km. The Nobile profiles use 0.125° azimuth samples; the others use 0.25°. |
| NAIF/SPICE DSN geometry | Hourly Goldstone DSS-14, Canberra DSS-43, and Madrid DSS-63 station masks. |
| LROC WAC / NASA SVS imagery | Illustrative globe texture and relief shading. |

The nine named region labels come from NASA's Artemis III candidate-region list. Each fixed point is an individual candidate coordinate from Table A1 of Wueller et al., rather than a NASA-designated landing location. The catalog records the paper's point IDs and coordinates; the scientific arrays are regenerated for exactly those coordinates.

The observer is **2 m above the local terrain**. At a chosen azimuth, the computed horizon is interpolated between profile samples. The apparent solar disk is integrated in 64 narrow strips; the Sun is counted as visible when more than **0.1%** of its area clears the terrain. Earth visibility uses **the center of the terrestrial disk**, not any visible fraction of it. A potential DSN window requires visibility at both ends of the geometric line of sight and an Earth-station elevation of at least **6°**. The longest interval is a run of hourly samples, not a precisely timed contact opportunity.

No claim is made about scheduled DSN availability, antenna pointing, weather, radio link budgets, panel orientation, dust, temperature, battery storage, or power output in watts. The global globe lighting and local mesh shading are illustrative.

### Validation limits

SELENE's outputs are exploratory geometric estimates. Terrain resolution, observer height, angle and time sampling, and the visibility threshold all affect the result. The regenerated nine-site inputs pass internal checks, but they have not been independently validated against observed imagery or a published illumination product. See [VALIDATION.md](VALIDATION.md) for the checks and their limits.

## Architecture

```text
index.html                 Semantic static document and accessibility hooks
src/data/                  Site catalog and JSON loading/shape checks
src/domain/                Geometry, solar disk, DSN and hourly summaries
src/ui/                    Horizon chart, timeline, globe and terrain rendering
src/main.js                Application state and event wiring
src/styles.css             Responsive visual system
public/data/               Regenerated scientific inputs and source receipts
public/*.webp              Moon and overview imagery
scripts/build.mjs          Deterministic static packaging
dist/                      Generated deployment directory (ignored by Git)
```

The pure domain modules do not depend on the DOM. Only `main.js` owns mutable app state; the UI modules render provided data. The scientific JSON is fetched once and cached in memory. Period summaries are cached by site, start date, and duration, then invalidated when those inputs change. This keeps the time player responsive without mixing rendering decisions into the geometry model.

## Reproducibility and data provenance

`npm run build` reproducibly packages the interface and the scientific JSON already present in `public/data/`. The input regeneration commands are separate:

```bash
python3 -m pip install -r requirements-science.txt
python3 scripts/regenerate_terrain.py
python3 scripts/regenerate_sky.py
python3 scripts/regenerate_visuals.py
npm run verify
npm run build
```

The terrain script samples NASA LOLA GeoTIFFs by HTTP range requests and downloads the pinned 5 m Site23 map for Malapert. The sky script queries JPL Horizons and downloads NAIF kernels, and the visual script converts NASA SVS maps into display textures. Repeating them requires network access and can take several minutes. Source URLs, the 5 m map hash, query parameters, output hashes, generation times, and kernel hashes are recorded in the three `public/data/*-receipt.json` files. The hidden `.source-cache/` directory holds downloaded inputs and is excluded from Git. `npm run verify` checks structure and internal consistency; it is not scientific validation against observations.

Relevant primary sources:

- [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)
- [NASA Planetary Geology, Geophysics and Geochemistry Laboratory LOLA product](https://pgda.gsfc.nasa.gov/products/78)
- [NAIF SPICE](https://naif.jpl.nasa.gov/naif/)
- [NASA Scientific Visualization Studio Moon resources](https://svs.gsfc.nasa.gov/)
- [Wueller et al., *Journal of Geophysical Research: Planets*](https://doi.org/10.1029/2025JE009434)

## AI use

OpenAI Codex assisted with architecture, application code, interface copy, and documentation. The scientific outputs require human review against the cited sources. No generated NASA branding is used in this interface.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). This project is a prototype for comparison and education, not certified navigation, power, or communications software.
