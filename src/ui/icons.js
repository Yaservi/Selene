const strokes = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  pin: '<path d="M12 21s7-7.5 7-13A7 7 0 0 0 5 8c0 5.5 7 13 7 13Z"/><circle cx="12" cy="8" r="2.3"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.5 4.5l2.2 2.2M17.3 17.3l2.2 2.2M4.5 19.5l2.2-2.2M17.3 6.7l2.2-2.2"/>',
  earth: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/>',
  radio: '<path d="m9 21 3-11 3 11M7 6a7 7 0 0 0 0 12M17 6a7 7 0 0 1 0 12M3 3a13 13 0 0 0 0 18M21 3a13 13 0 0 1 0 18"/><circle cx="12" cy="8" r="1"/>',
  horizon: '<path d="M2 15c3-4 6-4 9-1 3-5 7-6 11-2M2 20h20M12 3v6M9 6h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  windows: '<path d="M4 20V10M9 20V5M14 20v-8M19 20V3"/>',
  terrain: '<path d="M2.5 19 10 6l11.5 13H2.5Z"/><path d="m6.8 11.5 3.2 2.2 3.2-2.2"/>',
  close: '<path d="M6 6 18 18M18 6 6 18"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  pause: '<path d="M7 4h4v16H7zM15 4h4v16h-4z"/>',
  'chevron-left': '<path d="m15 5-7 7 7 7"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  maximize: '<path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/>',
  minimize: '<path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>',
  'panels-off': '<path d="M4 5h16v14H4zM15 5v14M3 21 21 3"/>',
  panels: '<path d="M4 5h16v14H4zM15 5v14"/>',
  power: '<path d="M3 20v-4h3v4M9 20v-7h3v7M15 20V9h3v11M21 20V4h2v16"/>',
};

export function icon(name, className = '') {
  const solid = name === 'play' || name === 'pause';
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="${solid ? 'currentColor' : 'none'}" stroke="${solid ? 'none' : 'currentColor'}" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${strokes[name]}</svg>`;
}
