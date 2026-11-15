import { sites } from './data/sites.js';
import { loadScientificData, loadLocalTerrain } from './data/load.js';
import { sampleAt, summarize } from './domain/availability.js';
import { position } from './domain/geometry.js';
import { renderHorizon } from './ui/horizon.js';
import { currentMeter, renderAvailability } from './ui/timeline.js';
import { createGlobe } from './ui/globe.js';
import { renderMinimap } from './ui/minimap.js';
import { mountTerrain } from './ui/terrain.js';
import { icon } from './ui/icons.js';

const element = id => document.getElementById(id);
const dateFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const state = { selected: 0, comparison: [0, 1], start: '2027-01-15', days: 14, playing: false, timer: null, data: null, summaries: new Map() };
const startUtc = () => Date.parse(`${state.start}T00:00:00Z`);
const hours = () => state.days * 24;
const timeUtc = () => startUtc() + Number(element('time').value) * 3_600_000;
const percent = (part, total) => Math.round(part / total * 100);
const diskPercent = fraction => fraction > 0 && fraction < .01 ? `${(fraction * 100).toFixed(1)}%` : `${Math.round(fraction * 100)}%`;
const current = site => sampleAt(state.data, site, timeUtc());
let lunarGlobe;

function summary(site) {
  const key = `${site}|${state.start}|${state.days}`;
  if (!state.summaries.has(key)) state.summaries.set(key, summarize(state.data, site, startUtc(), hours()));
  return state.summaries.get(key);
}

function paintCards() {
  element('site-cards').innerHTML = state.comparison.map(site => {
    const info = sites[site];
    const now = current(site);
    const period = summary(site);
    const disk = diskPercent(now.fraction);
    const stationNames = state.data.dsn.stations.filter((_, index) => now.stations & (1 << index));
    return `<button type="button" class="site-card ${site === state.selected ? 'selected' : ''}" data-site="${site}" aria-pressed="${site === state.selected}">
      <span class="card-heading">${icon('pin', 'cyan')}<strong>${info.name}</strong><em>${info.experimental ? 'Experimental' : 'Geometric estimate'}</em></span>
      <span class="card-line"><span>${icon('sun', 'gold')} Sun now: ${now.sunlight ? 'visible' : 'obscured'}</span><span>${icon('power', 'gold')} Disk visible: ${disk}</span></span>
      <span class="card-line"><span>${icon('earth', 'cyan')} Earth now: ${now.earth ? 'visible' : 'obscured'}</span><span>${icon('radio', 'cyan')} DSN: ${stationNames.join(', ') || 'no geometry'}</span></span>
      <span class="card-period">${state.days} days · sunlight ${percent(period.totals.sunlight, hours())}% · Earth ${percent(period.totals.earth, hours())}%</span>
      <span class="card-metrics"><span>Sunlight <b>${period.totals.sunlight} h</b></span><span>Earth visible <b>${period.totals.earth} h</b></span><span>Longest dark <b>${period.longest.darkness} h</b></span><span>Longest DSN gap <b>${period.longest.contactBlackout} h</b></span></span>
      <span class="timeline-label">At selected time</span>
      <span class="card-timeline"><span>${icon('sun', 'gold')} Sun · ${now.sunlight ? disk : 'dark'}</span>${currentMeter('sunlight', now.sunlight ? now.fraction : 0, `Sun disk now: ${now.sunlight ? `${disk} visible` : 'obscured'}`)}</span>
      <span class="card-timeline"><span>${icon('earth', 'cyan')} Earth · ${now.earth ? 'yes' : 'no'}</span>${currentMeter('earth', Number(now.earth), `Earth center now: ${now.earth ? 'visible' : 'obscured'}`)}</span>
      <span class="card-timeline"><span>${icon('radio', 'cyan')} DSN · ${now.contact ? 'yes' : 'no'}</span>${currentMeter('contact', Number(now.contact), `DSN geometry now: ${now.contact ? 'available' : 'unavailable'}`)}</span>
    </button>`;
  }).join('');
}

function paintClock() {
  const date = new Date(timeUtc());
  element('clock').textContent = `${dateFormatter.format(date)} UTC`;
  element('clock').dateTime = date.toISOString();
  element('horizon-title').textContent = `Local horizon · ${sites[state.selected].name}`;
  element('horizon-preview').innerHTML = renderHorizon(state.data, state.selected, date.getTime());
  paintCards();
  if (lunarGlobe) paintSky(lunarGlobe);
  if (!element('availability').hidden) paintAvailability();
  if (element('detail').open && element('detail').dataset.kind === 'horizon') paintExpandedHorizon();
  element('step-back').disabled = Number(element('time').value) <= 0;
  element('step-next').disabled = Number(element('time').value) >= hours() - 1;
}

function paintExpandedHorizon() {
  element('detail-body').innerHTML = renderHorizon(state.data, state.selected, timeUtc(), true) + `<button type="button" id="dialog-terrain" class="secondary-button">Explore local terrain ↗</button>`;
  element('dialog-terrain').onclick = openTerrain;
}

function paintAvailability() {
  element('window-days').textContent = state.days;
  const summaries = Object.fromEntries(state.comparison.map(site => [site, summary(site)]));
  const currentStates = Object.fromEntries(state.comparison.map(site => [site, current(site)]));
  element('availability-content').innerHTML = renderAvailability(state.comparison, summaries, startUtc(), Number(element('time').value), currentStates);
}

function paintPins(globe) {
  const bounds = element('moon').getBoundingClientRect();
  const parent = element('app').getBoundingClientRect();
  const pointOnScreen = site => {
    const location = globe.markerLocation(site);
    return { location, x: bounds.left - parent.left + bounds.width * parseFloat(location.left) / 100, y: bounds.top - parent.top + bounds.height * parseFloat(location.top) / 100 };
  };
  for (const [site, marker] of [...element('site-markers').children].entries()) {
    const { location, x, y } = pointOnScreen(site);
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.hidden = !location.visible;
    marker.classList.toggle('compared', state.comparison.includes(site));
    marker.classList.toggle('selected', site === state.selected);
  }
  for (const [slot, site] of state.comparison.entries()) {
    const pin = element('app').querySelector(`[data-pin="${slot}"]`);
    const { location, x, y } = pointOnScreen(site);
    pin.textContent = sites[site].name;
    pin.dataset.site = site;
    pin.style.left = `${x}px`;
    pin.style.top = `${y}px`;
    pin.hidden = !location.visible;
    pin.classList.toggle('selected', site === state.selected);
  }
  renderMinimap(element('mini-globe'), element('moon'), site => globe.markerLocation(site), state.comparison, state.selected);
  element('mini-caption').textContent = `${sites[state.selected].code} · reset`;
  element('reset-globe').setAttribute('aria-label', `Reset lunar view; ${sites[state.selected].name} selected`);
}

function paintSky(globe) {
  const overlay = element('sky-overlay');
  const stage = element('app').getBoundingClientRect();
  const moon = element('moon').getBoundingClientRect();
  const origin = globe.markerLocation(state.selected);
  const sun = position(state.data, state.selected, timeUtc(), 'sun');
  const earth = position(state.data, state.selected, timeUtc(), 'earth');
  element('sky-readout').textContent = `${sites[state.selected].name} · ${dateFormatter.format(new Date(timeUtc()))} UTC\nSun · az ${sun.azimuth.toFixed(1)}° · el ${sun.elevation.toFixed(1)}°\nEarth · az ${earth.azimuth.toFixed(1)}° · el ${earth.elevation.toFixed(1)}°`;
  const body = state.data && origin.visible ? ['sun', 'earth'].map(name => {
    const celestial = name === 'sun' ? sun : earth;
    const shown = current(state.selected)[name === 'sun' ? 'sunlight' : 'earth'];
    const vector = globe.skyDirection(state.selected, celestial.azimuth, celestial.elevation);
    const sx = moon.left - stage.left + moon.width * parseFloat(origin.left) / 100;
    const sy = moon.top - stage.top + moon.height * parseFloat(origin.top) / 100;
    const distance = Math.min(moon.width * .32, 260);
    const ex = sx + vector.east * distance;
    const ey = sy - vector.north * distance;
    const color = name === 'sun' ? '#ffce6c' : '#67e4f5';
    const label = name === 'sun' ? 'Sun' : 'Earth';
    return `<g><line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="2" stroke-dasharray="${shown ? '7 4' : '2 5'}"/><circle cx="${ex}" cy="${ey}" r="7" fill="${color}" stroke="#edfaff" stroke-width="1.4"/><rect x="${ex - 53}" y="${ey - 37}" width="106" height="24" rx="6" fill="#071622e8" stroke="${color}"/><text x="${ex}" y="${ey - 21}" text-anchor="middle" fill="${color}" font-size="12">${label} · ${shown ? 'visible' : 'hidden'}</text></g>`;
  }).join('') : '';
  overlay.setAttribute('viewBox', `0 0 ${stage.width} ${stage.height}`);
  overlay.innerHTML = body;
}

function renderSelection(globe) {
  paintPins(globe);
  paintSky(globe);
  paintClock();
}

function stopPlayback() {
  clearInterval(state.timer);
  state.timer = null;
  state.playing = false;
  element('play').innerHTML = icon('play');
  element('play').setAttribute('aria-label', 'Play timeline');
}

function setPeriod(days) {
  if (![7, 14, 28].includes(days)) return;
  stopPlayback();
  state.days = days;
  element('period').value = String(days);
  element('player-period').value = String(days);
  element('time').max = String(hours() - 1);
  element('time').value = String(Math.min(Number(element('time').value), hours() - 1));
  state.summaries.clear();
  paintClock();
}

function changeTime(delta) {
  stopPlayback();
  element('time').value = Math.max(0, Math.min(hours() - 1, Number(element('time').value) + delta));
  paintClock();
}

function showDialog(kind, heading, kicker) {
  const dialog = element('detail');
  dialog.dataset.kind = kind;
  element('detail-heading').textContent = heading;
  element('detail-kicker').textContent = kicker;
  if (!dialog.open) dialog.showModal();
}

function openHorizon() {
  showDialog('horizon', `Local horizon · ${sites[state.selected].name}`, 'SUN AND EARTH / LOCAL VIEW');
  paintExpandedHorizon();
}

async function openTerrain() {
  showDialog('terrain', `Local terrain · ${sites[state.selected].name}`, 'LOLA / ELEVATION MODEL');
  element('detail-body').textContent = 'Loading local elevation grid…';
  const requestedSite = state.selected;
  try {
    const grid = await loadLocalTerrain(requestedSite);
    if (element('detail').dataset.kind !== 'terrain' || state.selected !== requestedSite) return;
    const body = element('detail-body');
    body.innerHTML = `<canvas id="terrain-canvas" width="900" height="510" aria-label="Interactive local LOLA terrain. Drag to rotate."></canvas><p class="terrain-caption"></p><label class="terrain-setting">Vertical exaggeration <select id="exaggeration"><option value="1">1× actual scale</option><option value="2">2×</option><option value="4">4×</option></select></label><p class="method-note">This terrain mesh shows elevation. Its display shading is illustrative; the horizon profile drives visibility calculations.</p>`;
    body.querySelector('.terrain-caption').textContent = grid.caption;
    const view = mountTerrain(element('terrain-canvas'), grid, sites[requestedSite].name);
    element('exaggeration').onchange = event => view.setExaggeration(Number(event.target.value));
  } catch (error) { element('detail-body').textContent = error.message; }
}

function openMethod() {
  showDialog('method', 'Method & limitations', 'SCIENCE / TRANSPARENCY');
  element('detail-body').innerHTML = `<div class="method-text">
    <p>SELENE compares nine candidate south pole locations using hourly NASA/JPL Horizons Sun and Earth positions, LOLA terrain profiles, and geometric Deep Space Network station visibility.</p>
    <p>The observer is 2 m above the terrain. A Sun hour counts if more than 0.1% of its disk is above the horizon; Earth visibility uses the center of its disk. The regional horizon reaches 200 km and combines a 5 m LOLA map at Malapert, 10 m LOLA elsewhere, and 80 m and 240 m LOLA farther out. The time range is 15 January to 13 February 2027 UTC.</p>
    <p>The three DSN stations are Goldstone, Canberra, and Madrid. A contact hour requires the lunar site to clear its terrain horizon and the Moon to clear 6° elevation at a station. These are potential geometric windows: no antenna scheduling, link budget, weather, or data rate is modeled.</p>
    <p>The current nine-site calculation has internal consistency checks. Independent observational agreement for these newly generated terrain profiles has not yet been established. The globe and terrain mesh are visual context; quantitative indicators come from the horizon profiles.</p>
    <p>Sources: <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noopener noreferrer">JPL Horizons</a> · <a href="https://pgda.gsfc.nasa.gov/products/78" target="_blank" rel="noopener noreferrer">NASA LOLA</a> · <a href="https://doi.org/10.1029/2025JE009434" target="_blank" rel="noopener noreferrer">Wueller et al.</a> · <a href="https://naif.jpl.nasa.gov/naif/" target="_blank" rel="noopener noreferrer">NAIF SPICE</a>. Read the repository README and VALIDATION.md for reproduction and assumptions.</p>
  </div>`;
}

function configure(globe) {
  const settings = element('settings');
  const toggleSettings = visible => {
    settings.hidden = !visible;
    element('open-settings').setAttribute('aria-expanded', String(visible));
  };
  const cleanButton = element('toggle-clean');
  const setCleanView = active => {
    if (active) {
      toggleSettings(false);
      element('availability').hidden = true;
      if (element('detail').open) element('detail').close();
    }
    element('app').classList.toggle('clean-view', active);
    document.body.classList.toggle('clean-view', active);
    cleanButton.setAttribute('aria-pressed', String(active));
    cleanButton.setAttribute('aria-label', active ? 'Show panels' : 'Show Moon only');
    cleanButton.title = active ? 'Show panels' : 'Show Moon only';
    cleanButton.innerHTML = icon(active ? 'panels' : 'panels-off');
    requestAnimationFrame(() => { paintPins(globe); paintSky(globe); });
  };
  cleanButton.onclick = () => setCleanView(!element('app').classList.contains('clean-view'));
  const fullscreenButton = element('show-fullscreen');
  const syncFullscreenButton = () => {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute('aria-pressed', String(active));
    fullscreenButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreenButton.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreenButton.innerHTML = icon(active ? 'minimize' : 'maximize');
    requestAnimationFrame(() => { paintPins(globe); paintSky(globe); });
  };
  fullscreenButton.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      fullscreenButton.title = 'Fullscreen is unavailable in this browser';
    }
  };
  document.addEventListener('fullscreenchange', syncFullscreenButton);
  for (const [slot, id] of ['site-a', 'site-b'].entries()) {
    const select = element(id);
    select.innerHTML = sites.map((site, index) => `<option value="${index}">${site.name}${site.experimental ? ' · Experimental' : ''}</option>`).join('');
    select.value = state.comparison[slot];
    select.onchange = () => {
      const picked = Number(select.value);
      const other = 1 - slot;
      if (picked === state.comparison[other]) {
        state.comparison[other] = state.comparison[slot];
        element(other === 0 ? 'site-a' : 'site-b').value = state.comparison[other];
      }
      state.comparison[slot] = picked;
      state.selected = picked;
      renderSelection(globe);
    };
  }
  element('open-settings').onclick = () => toggleSettings(settings.hidden);
  element('close-settings').onclick = () => toggleSettings(false);
  element('apply').onclick = () => { toggleSettings(false); element('availability').hidden = false; paintAvailability(); };
  element('start-date').onchange = event => {
    stopPlayback();
    const value = event.target.value;
    state.start = value === '2027-01-16' ? value : '2027-01-15';
    event.target.value = state.start;
    state.summaries.clear();
    paintClock();
  };
  element('period').onchange = event => setPeriod(Number(event.target.value));
  element('player-period').onchange = event => setPeriod(Number(event.target.value));
  element('show-windows').onclick = () => { if (element('app').classList.contains('clean-view')) setCleanView(false); element('availability').hidden = !element('availability').hidden; if (!element('availability').hidden) paintAvailability(); };
  element('close-availability').onclick = () => { element('availability').hidden = true; };
  element('open-horizon').onclick = openHorizon;
  element('open-terrain').onclick = openTerrain;
  element('show-terrain').onclick = openTerrain;
  element('open-method').onclick = openMethod;
  element('close-detail').onclick = () => element('detail').close();
  element('detail').addEventListener('click', event => { if (event.target === element('detail')) element('detail').close(); });
  element('reset-globe').onclick = globe.reset;
  window.addEventListener('resize', () => { paintPins(globe); paintSky(globe); });
  element('app').addEventListener('click', event => {
    const option = event.target.closest('[data-site]');
    if (!option) return;
    const picked = Number(option.dataset.site);
    if (!state.comparison.includes(picked)) {
      const slot = state.comparison.indexOf(state.selected);
      state.comparison[slot] = picked;
      element(slot === 0 ? 'site-a' : 'site-b').value = String(picked);
    }
    state.selected = picked;
    renderSelection(globe);
    if (element('detail').open && element('detail').dataset.kind === 'terrain') openTerrain();
  });
  element('toggle-compare').onclick = () => {
    const cards = element('site-cards');
    cards.hidden = !cards.hidden;
    element('toggle-compare').setAttribute('aria-expanded', String(!cards.hidden));
  };
  element('time').oninput = () => { stopPlayback(); paintClock(); };
  element('step').onchange = event => {
    const amount = event.target.value;
    element('step-back').setAttribute('aria-label', `Step back ${amount} hours`);
    element('step-next').setAttribute('aria-label', `Step forward ${amount} hours`);
  };
  element('step-back').onclick = () => changeTime(-Number(element('step').value));
  element('step-next').onclick = () => changeTime(Number(element('step').value));
  element('speed').onchange = event => { element('rate').textContent = `${event.target.value} simulated hours / second`; };
  element('play').onclick = () => {
    if (state.playing) { stopPlayback(); return; }
    if (Number(element('time').value) >= hours() - 1) element('time').value = 0;
    state.playing = true;
    element('play').innerHTML = icon('pause');
    element('play').setAttribute('aria-label', 'Pause timeline');
    let previous = performance.now();
    state.timer = setInterval(() => {
      const now = performance.now();
      const next = Number(element('time').value) + (now - previous) / 1000 * Number(element('speed').value);
      previous = now;
      element('time').value = Math.min(hours() - 1, next);
      if (next >= hours() - 1) stopPlayback();
      paintClock();
    }, 200);
  };
}

async function launch() {
  try {
    document.querySelectorAll('[data-icon]').forEach(holder => { holder.innerHTML = icon(holder.dataset.icon); });
    element('site-markers').innerHTML = sites.map((site, index) => `<button type="button" class="site-marker" data-site="${index}" data-name="${site.name}" aria-label="Select ${site.name}" title="${site.name} · ${site.latitude}°, ${site.longitude}°"></button>`).join('');
    state.data = await loadScientificData();
    let globe;
    globe = createGlobe(element('moon'), () => { paintPins(globe); paintSky(globe); });
    lunarGlobe = globe;
    configure(globe);
    renderSelection(globe);
  } catch (error) {
    element('notice').hidden = false;
    element('notice').textContent = `Unable to load SELENE: ${error.message}`;
  }
}

launch();
