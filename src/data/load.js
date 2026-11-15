const names = ['horizons', 'ephemeris', 'dsn'];

export async function loadScientificData() {
  const responses = await Promise.all(names.map(name => fetch(`data/${name}.json`)));
  for (const response of responses) {
    if (!response.ok) throw new Error(`Scientific data unavailable (${response.status}).`);
  }
  const [horizons, ephemeris, dsn] = await Promise.all(responses.map(response => response.json()));
  if (horizons.length !== 9 || ephemeris.length !== 9 || dsn.hours !== 720) {
    throw new Error('The scientific data do not match this build.');
  }
  return { horizons, ephemeris, dsn, stationFlags: dsn.flagsBase64.map(encoded => Uint8Array.from(atob(encoded), char => char.charCodeAt(0))) };
}

export async function loadLocalTerrain(index) {
  const response = await fetch(`data/terrain-${index}.json`);
  if (!response.ok) throw new Error('The local terrain grid is unavailable.');
  return response.json();
}
