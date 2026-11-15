import { earthCenterVisible, visibleSolarDisk } from './geometry.js';

export function stationMask(data, site, dateUtc) {
  const index = Math.floor((dateUtc - Date.parse(data.dsn.startUtc)) / 3_600_000);
  return data.stationFlags[site][index] ?? 0;
}

export function sampleAt(data, site, dateUtc) {
  const fraction = visibleSolarDisk(data, site, dateUtc);
  const sunlight = fraction > 0.001;
  const earth = earthCenterVisible(data, site, dateUtc);
  const stations = stationMask(data, site, dateUtc);
  return { fraction, sunlight, earth, stations, contact: stations !== 0, joint: sunlight && stations !== 0 };
}

export function summarize(data, site, startUtc, hours) {
  const samples = [];
  const totals = { sunlight: 0, earth: 0, contact: 0, joint: 0 };
  const longest = { darkness: 0, earthBlackout: 0, contactBlackout: 0, joint: 0, jointStart: null };
  let darkRun = 0, earthRun = 0, contactRun = 0, jointRun = 0;
  for (let hour = 0; hour < hours; hour++) {
    const state = sampleAt(data, site, startUtc + hour * 3_600_000);
    samples.push(state);
    for (const key of Object.keys(totals)) totals[key] += Number(state[key]);
    darkRun = state.sunlight ? 0 : darkRun + 1;
    earthRun = state.earth ? 0 : earthRun + 1;
    contactRun = state.contact ? 0 : contactRun + 1;
    jointRun = state.joint ? jointRun + 1 : 0;
    longest.darkness = Math.max(longest.darkness, darkRun);
    longest.earthBlackout = Math.max(longest.earthBlackout, earthRun);
    longest.contactBlackout = Math.max(longest.contactBlackout, contactRun);
    if (jointRun > longest.joint) {
      longest.joint = jointRun;
      longest.jointStart = hour + 1 - jointRun;
    }
  }
  return { samples, totals, longest, hours };
}
