import { horizonAt, position, visibleSolarDisk, earthCenterVisible } from '../domain/geometry.js';
import { sites } from '../data/sites.js';

export function renderHorizon(data, site, dateUtc, expanded = false) {
  const values = data.horizons[site].elevation;
  const step = data.horizons[site].azimuthStep;
  const sun = position(data, site, dateUtc, 'sun');
  const earth = position(data, site, dateUtc, 'earth');
  const sunFraction = visibleSolarDisk(data, site, dateUtc);
  const earthVisible = earthCenterVisible(data, site, dateUtc);
  const lower = Math.min(-10, Math.floor((Math.min(...values) - 2) / 5) * 5);
  const upper = Math.max(15, Math.ceil((Math.max(...values) + 2) / 5) * 5);
  const x = azimuth => 44 + azimuth * 1.5;
  const y = elevation => 24 + (upper - elevation) / (upper - lower) * 214;
  const outline = values.map((height, index) => `${index === 0 ? 'M' : 'L'}${x(index * step).toFixed(2)} ${y(height).toFixed(2)}`).join(' ');
  const finalOutline = `${outline} L584 ${y(values[0]).toFixed(2)}`;
  const marker = (label, body, shown, color) => {
    const cx = x(body.azimuth);
    const cy = y(body.elevation);
    const terrainY = y(horizonAt(data, site, body.azimuth));
    const anchor = cx > 480 ? 'end' : 'start';
    const labelX = cx + (anchor === 'end' ? -12 : 12);
    return `<g><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${terrainY}" stroke="${color}" stroke-dasharray="3 4" opacity=".6"/><circle cx="${cx}" cy="${cy}" r="${label === 'Sun' ? 7 : 6}" fill="${shown ? color : '#172b39'}" stroke="${color}" stroke-width="2"/><text x="${labelX}" y="${cy - 12}" text-anchor="${anchor}" fill="${color}" font-size="13">${label}${shown ? '' : ' · obscured'}</text></g>`;
  };
  const grid = Array.from({ length: 6 }, (_, index) => lower + (upper - lower) * index / 5)
    .map(height => `<line x1="44" x2="584" y1="${y(height)}" y2="${y(height)}" class="chart-grid"/><text x="37" y="${y(height) + 4}" text-anchor="end" class="chart-label">${height.toFixed(0)}°</text>`).join('');
  const bearings = [0, 90, 180, 270, 360].map((azimuth, index) => `<line x1="${x(azimuth)}" x2="${x(azimuth)}" y1="24" y2="238" class="chart-grid"/><text x="${x(azimuth)}" y="258" text-anchor="middle" class="chart-label">${['N', 'E', 'S', 'W', 'N'][index]} · ${azimuth}°</text>`).join('');

  return `<div class="chart-caption">${sites[site].code} · LOLA regional profile · 2 m observer</div>
    <svg viewBox="0 0 628 275" role="img" aria-label="Local terrain horizon with Sun at ${sun.elevation.toFixed(2)} degrees and Earth at ${earth.elevation.toFixed(2)} degrees elevation">
      <defs><linearGradient id="sky-${expanded ? 'large' : 'small'}" x2="0" y2="1"><stop stop-color="#07121f"/><stop offset="1" stop-color="#1c3644"/></linearGradient><linearGradient id="ridge-${expanded ? 'large' : 'small'}" x2="0" y2="1"><stop stop-color="#9ca8ad"/><stop offset="1" stop-color="#22313c"/></linearGradient></defs>
      <rect x="44" y="24" width="540" height="214" fill="url(#sky-${expanded ? 'large' : 'small'})"/>
      ${grid}${bearings}<path d="${finalOutline} L584 238 L44 238 Z" fill="url(#ridge-${expanded ? 'large' : 'small'})"/><path d="${finalOutline}" fill="none" stroke="#e1e7e8" stroke-width="1.2"/>
      ${marker('Sun', sun, sunFraction > .001, '#ffc963')}${marker('Earth', earth, earthVisible, '#63dbf0')}
    </svg>
    <div class="chart-readout"><span>☀ Sun disk ${Math.round(sunFraction * 100)}% visible · ${sun.elevation.toFixed(2)}°</span><span>⊕ Earth center ${earthVisible ? 'visible' : 'obscured'} · ${earth.elevation.toFixed(2)}°</span></div>`;
}
