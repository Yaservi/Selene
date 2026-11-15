import { sites } from '../data/sites.js';
import { icon } from './icons.js';

export function currentMeter(kind, fraction, description) {
  const value = Math.max(0, Math.min(1, fraction));
  return `<span class="current-meter ${kind}" role="img" aria-label="${description}"><i style="width:${(value * 100).toFixed(3)}%"></i></span>`;
}

function runTimeline(samples, key, currentOffset) {
  const runs = [];
  for (const sample of samples) {
    const value = sample[key];
    const last = runs.at(-1);
    if (last?.value === value) last.hours += 1;
    else runs.push({ value, hours: 1 });
  }
  return `<div class="run-timeline ${key}" style="--cursor:${currentOffset / samples.length * 100}%" aria-hidden="true">${runs.map(run => `<i class="${run.value ? 'on' : ''}" style="flex-grow:${run.hours}"></i>`).join('')}</div>`;
}

const percent = (count, total) => Math.round(count * 100 / total);
const displayTime = epoch => new Date(epoch).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export function renderAvailability(comparison, summaries, startUtc, currentOffset, currentStates) {
  const selectedTime = displayTime(startUtc + currentOffset * 3_600_000);
  return `<p class="window-current-time">Selected time · ${selectedTime}</p>` + comparison.map(site => {
    const summary = summaries[site];
    const { samples, totals, longest } = summary;
    const now = currentStates[site];
    const jointWindow = longest.jointStart === null ? 'No simultaneous window in this period.' :
      `Longest joint window: ${longest.joint} h · ${displayTime(startUtc + longest.jointStart * 3_600_000)} to ${displayTime(startUtc + (longest.jointStart + longest.joint) * 3_600_000)}`;
    return `<article class="window-site"><h3>${sites[site].name}</h3>
      <div class="window-row"><span>${icon('sun', 'gold')} Sunlight · ${percent(totals.sunlight, summary.hours)}%</span>${runTimeline(samples, 'sunlight', currentOffset)}<strong class="window-now ${now.sunlight ? 'on' : ''}">${now.sunlight ? 'Lit' : 'Dark'}</strong></div>
      <div class="window-row"><span>${icon('earth', 'cyan')} Earth center · ${percent(totals.earth, summary.hours)}%</span>${runTimeline(samples, 'earth', currentOffset)}<strong class="window-now ${now.earth ? 'on' : ''}">${now.earth ? 'Visible' : 'Hidden'}</strong></div>
      <div class="window-row"><span>${icon('radio', 'cyan')} DSN geometry · ${percent(totals.contact, summary.hours)}%</span>${runTimeline(samples, 'contact', currentOffset)}<strong class="window-now ${now.contact ? 'on' : ''}">${now.contact ? 'Open' : 'Closed'}</strong></div>
      <div class="window-row"><span>${icon('sun', 'green')} Both · ${totals.joint} h</span>${runTimeline(samples, 'joint', currentOffset)}<strong class="window-now ${now.joint ? 'on' : ''}">${now.joint ? 'Open' : 'Closed'}</strong></div>
      <p class="window-result">${jointWindow}</p><p class="window-footnote">Longest darkness ${longest.darkness} h · longest DSN gap ${longest.contactBlackout} h</p></article>`;
  }).join('') + '<p class="window-footnote">Hourly geometric estimate for Goldstone, Canberra and Madrid. A DSN antenna must see the Moon at least 6° above its terrestrial horizon.</p>';
}
