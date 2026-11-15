import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sites, FIRST_EPOCH } from '../src/data/sites.js';
import { position, horizonAt, visibleSolarDisk, earthCenterVisible } from '../src/domain/geometry.js';
import { sampleAt, stationMask, summarize } from '../src/domain/availability.js';

const read = async name => JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const [horizons, ephemeris, dsn] = await Promise.all(['horizons', 'ephemeris', 'dsn'].map(read));
const flags = dsn.flagsBase64.map(value => Uint8Array.from(Buffer.from(value, 'base64')));
const data = { horizons, ephemeris, dsn, stationFlags: flags };
const finite = value => Number.isFinite(value);
const hours = [0, 24, 48, 168, 336, 695, 696];
const firstProjectCommit = Date.parse('2026-11-14T13:22:22Z');
const receipts = {};

for (const [receiptName, location] of [['terrain-receipt', 'data'], ['sky-receipt', 'data'], ['visual-receipt', 'public']]) {
  const receipt = await read(receiptName);
  receipts[receiptName] = receipt;
  assert.ok(Date.parse(receipt.generated_utc) >= firstProjectCommit &&
    Date.parse(receipt.generated_utc) <= Date.now(), `${receiptName}: invalid generation date`);
  const hashes = location === 'public' ? receipt.output_sha256 : receipt.sha256;
  for (const [name, expected] of Object.entries(hashes)) {
    const url = new URL(location === 'public' ? `../public/${name}` : `../public/data/${name}`, import.meta.url);
    const actual = createHash('sha256').update(await readFile(url)).digest('hex');
    assert.equal(actual, expected, `${receiptName}: ${name} differs from recorded source build`);
  }
}
assert.equal(receipts['sky-receipt'].input_horizons_sha256,
  receipts['terrain-receipt'].sha256['horizons.json'], 'sky inputs differ from terrain receipt');
assert.equal(receipts['terrain-receipt'].malapert_source_sha256,
  '12d280a59cd7580415f6bada638d0abe025ce6727541fddf68d5dc371a6c94cf');

assert.equal(sites.length, 9);
assert.equal(horizons.length, sites.length);
assert.equal(ephemeris.length, sites.length);
assert.equal(flags.length, sites.length);
assert.equal(Date.parse(dsn.startUtc), FIRST_EPOCH);
assert.equal(dsn.stepHours, 1);
assert.equal(dsn.hours, 720);
assert.equal(dsn.stations.length, 3);

// Keep nearby obstructions resolved before calculating visibility from the profiles.
assert.ok(horizonAt(data, 7, 295.5) > 0.6, 'de Gerlache near-field ridge is missing');
assert.ok(horizons[7].obstacleDistance[1182] > 20 && horizons[7].obstacleDistance[1182] < 40,
  'de Gerlache ridge must be resolved within 40 m');
assert.ok(horizonAt(data, 1, 301.0464) > 0.189, 'Nobile near-field ridge is missing');
assert.equal(flags[1][501], 0, 'Nobile contact must clear the local ridge');

let checkedAngles = 0;
let checkedStates = 0;
for (const [site, info] of sites.entries()) {
  const horizon = horizons[site];
  assert.equal(horizon.azimuthStep, site < 2 ? 0.125 : 0.25, info.name);
  if (site === 2) assert.equal(horizon.sources[0], receipts['terrain-receipt'].sources.malapert);
  assert.equal(horizon.elevation.length * horizon.azimuthStep, 360, info.name);
  assert.ok(horizon.elevation.every(value => finite(value) && Math.abs(value) <= 90), info.name);
  if (horizon.latitude !== undefined) assert.ok(Math.abs(horizon.latitude - info.latitude) < 1e-6, info.name);
  if (horizon.longitude !== undefined) assert.ok(Math.abs(horizon.longitude - info.longitude) < 1e-6, info.name);
  if (horizon.observerHeight !== undefined) assert.equal(horizon.observerHeight, 2, info.name);
  assert.ok(Math.abs(horizonAt(data, site, 0) - horizonAt(data, site, 360)) < 1e-10, info.name);

  assert.equal(flags[site].length, dsn.hours, info.name);
  assert.ok([...flags[site]].every(mask => mask <= 7), info.name);
  const terrain = await read(`terrain-${site}`);
  assert.ok(Number.isInteger(terrain.n) && terrain.n > 1 && finite(terrain.spacing) && terrain.spacing > 0, info.name);
  assert.equal(terrain.heights.length, terrain.n ** 2, info.name);
  assert.ok(terrain.heights.every(finite), info.name);
  if (terrain.latitude !== undefined) assert.ok(Math.abs(terrain.latitude - info.latitude) < 1e-6, info.name);
  if (terrain.longitude !== undefined) assert.ok(Math.abs(terrain.longitude - info.longitude) < 1e-6, info.name);

  const solar = ephemeris[site].sun;
  const terrestrial = ephemeris[site].earth;
  assert.equal(solar.length, terrestrial.length, info.name);
  assert.ok(solar.length > 695, info.name); // Last selectable 28-day period ends at sample 695.
  for (const body of ['sun', 'earth']) {
    for (const [hour, row] of ephemeris[site][body].entries()) {
      assert.ok(row.length === 3 && row.every(finite), `${info.name} ${body} ${hour}`);
      assert.ok(row[0] >= 0 && row[0] < 360 && Math.abs(row[1]) <= 90 && row[2] > 0, `${info.name} ${body} ${hour}`);
      const point = position(data, site, FIRST_EPOCH + hour * 3_600_000, body);
      assert.ok(Math.abs(point.azimuth - row[0]) < 1e-8 && point.elevation === row[1] && point.radius === row[2], `${info.name} ${body} ${hour}`);
      checkedAngles++;
    }
  }

  for (const hour of hours) {
    assert.equal(stationMask(data, site, FIRST_EPOCH + hour * 3_600_000), flags[site][hour], info.name);
    const state = sampleAt(data, site, FIRST_EPOCH + hour * 3_600_000);
    assert.ok(finite(state.fraction) && state.fraction >= 0 && state.fraction <= 1, `${info.name} ${hour}`);
    assert.equal(state.sunlight, state.fraction > .001);
    assert.equal(state.earth, earthCenterVisible(data, site, FIRST_EPOCH + hour * 3_600_000));
    assert.equal(state.contact, flags[site][hour] !== 0);
    assert.equal(state.joint, state.sunlight && state.contact);
    checkedStates++;
  }

  for (const first of [0, 24]) {
    for (const length of [168, 336, 672]) {
      const result = summarize(data, site, FIRST_EPOCH + first * 3_600_000, length);
      assert.equal(result.samples.length, length);
      for (const key of ['sunlight', 'earth', 'contact', 'joint']) {
        assert.equal(result.totals[key], result.samples.reduce((sum, sample) => sum + Number(sample[key]), 0), `${info.name} ${key}`);
      }
      assert.ok(result.totals.joint <= result.totals.sunlight && result.totals.joint <= result.totals.contact);
      assert.ok(result.longest.joint <= result.totals.joint);
      checkedStates += length;
    }
  }
}

// Flat-horizon limiting cases test the solar disk area, independent of mission data.
for (const [elevation, expected] of [[0, .5], [.5, 1], [-.5, 0]]) {
  const fixture = { horizons: [{ azimuthStep: 90, elevation: [0, 0, 0, 0] }], ephemeris: [{ sun: [[0, elevation, .27]] }] };
  assert.ok(Math.abs(visibleSolarDisk(fixture, 0, FIRST_EPOCH) - expected) < 1e-10);
}

console.log(`Verified ${sites.length} sites, ${checkedAngles} ephemeris angles, ${checkedStates} sampled states, nine terrain meshes, and DSN masks.`);
console.log('Scientific agreement with independent imagery or external illumination maps remains outside this internal check.');
