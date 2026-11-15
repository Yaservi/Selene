import { FIRST_EPOCH } from '../data/sites.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const degrees = Math.PI / 180;
const normalize = angle => (angle % 360 + 360) % 360;

export function position(data, site, dateUtc, body) {
  const rows = data.ephemeris[site][body];
  const sample = (dateUtc - FIRST_EPOCH) / 3_600_000;
  if (sample < 0 || sample > rows.length - 1) throw new RangeError('Time outside the ephemeris interval.');
  const index = Math.floor(sample);
  const next = Math.min(index + 1, rows.length - 1);
  const weight = sample - index;
  const a = rows[index];
  const b = rows[next];
  // Interpolate azimuth along the short arc across the 0°/360° seam.
  const delta = ((b[0] - a[0] + 540) % 360) - 180;
  return { azimuth: normalize(a[0] + weight * delta), elevation: a[1] + weight * (b[1] - a[1]), radius: a[2] + weight * (b[2] - a[2]) };
}

export function horizonAt(data, site, azimuth) {
  const profile = data.horizons[site];
  const values = profile.elevation;
  const sample = normalize(azimuth) / profile.azimuthStep;
  const index = Math.floor(sample) % values.length;
  const next = (index + 1) % values.length;
  return values[index] + (values[next] - values[index]) * (sample - Math.floor(sample));
}

export function visibleSolarDisk(data, site, dateUtc) {
  const sun = position(data, site, dateUtc, 'sun');
  const angularRadius = sun.radius;
  let visibleArea = 0;
  let diskArea = 0;
  for (let strip = 0; strip < 64; strip++) {
    const offset = ((strip + 0.5) / 32 - 1) * angularRadius;
    const halfHeight = Math.sqrt(angularRadius ** 2 - offset ** 2);
    const terrain = horizonAt(data, site, sun.azimuth + offset / Math.cos(sun.elevation * degrees));
    visibleArea += clamp(halfHeight + sun.elevation - terrain, 0, 2 * halfHeight);
    diskArea += 2 * halfHeight;
  }
  return visibleArea / diskArea;
}

export function earthCenterVisible(data, site, dateUtc) {
  const earth = position(data, site, dateUtc, 'earth');
  return earth.elevation > horizonAt(data, site, earth.azimuth);
}
