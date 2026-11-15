# Validation status

## Current nine-site build

The shipped scientific inputs are generated from NASA LOLA south-polar GeoTIFFs, JPL Horizons observer queries, and NAIF/SPICE station kernels. The scripts, source URLs, query parameters and output receipts are in this repository. The display globe texture comes from NASA SVS and is never used to compute visibility.

Run `npm run verify` after regeneration to check the nine coordinates and terrain grids, the hourly Sun and Earth angle arrays, DSN masks, sampled visibility states, period summaries, and agreement of each terrain grid's coordinate metadata with the site catalog. `npm run build` then packages those files. These checks detect missing, malformed or internally inconsistent inputs; they do not prove that LOLA resolves every local obstruction or that predicted illumination matches a measured shadow.

## Method and limits

- The horizon profiles sample NASA's 5 m Site23 LOLA map around Malapert and 10 m LOLA pixels around the other sites inside 5 km, 80 m pixels to 20 km and 240 m pixels to 200 km, from an observer 2 m above the sampled surface. The two Nobile profiles have 0.125° azimuth intervals; the other seven have 0.25°. Radial steps are 0.5 m in the first 100 m, 1 m to 5 km, 80 m to 20 km, and 240 m beyond. These ray steps do not increase the DEM's physical resolution.
- Sun and Earth positions are requested hourly for each lunar coordinate from JPL Horizons. The player interpolates angles between samples; period totals use hourly classifications.
- DSN flags are computed from the same terrain profiles and fresh NAIF kernels for Goldstone DSS-14, Canberra DSS-43, and Madrid DSS-63, with a 6° Earth-station elevation cutoff.
- No comparison against an independent imaging data set or a published illumination map has been completed for these regenerated profiles. Treat solar, Earth and DSN windows as exploratory geometric estimates, not operational predictions.
- DSN scheduling, antenna pointing, radio budgets, dust, weather, panel orientation and power output are not modeled.

An external comparison must use the packaged inputs and record its test period and site coordinates. Internal consistency checks do not establish observational accuracy.
