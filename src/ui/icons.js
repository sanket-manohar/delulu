// SPDX-License-Identifier: MIT
// Line icons (24px grid, stroke = currentColor). Original drawings.

const P = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.5-5.1-2.7-5 2.7 1-5.5-4.1-4 5.6-.8z"/>',
  starFill: '<path fill="currentColor" d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.5-5.1-2.7-5 2.7 1-5.5-4.1-4 5.6-.8z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  board: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.2 4.5v15M14.8 4.5v15"/>',
  summary: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v8.5l6 6"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
  doc: '<path d="M7 3.5h7l4.5 4.5v12a.5.5 0 0 1-.5.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2"/>',
  scale: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="m5 7-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z"/>',
  rocket: '<path d="M14.5 4.5c2.5-.8 4.5-.8 5-.3s.5 2.5-.3 5L13 15.4 8.6 11z"/><path d="m8.6 11-3.1.4-2 2.6 3.6.8M13 15.4l-.4 3.1-2.6 2-.8-3.6"/><circle cx="15.5" cy="8.5" r="1.3"/>',
  map: '<path d="m9 4.5-5 2v13l5-2 6 2 5-2v-13l-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  book: '<path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9.5"/>',
  android: '<path d="M4.5 17.5a7.5 7.5 0 0 1 15 0z"/><path d="m7 7.5 1.6 2.6M17 7.5l-1.6 2.6"/><circle cx="9.3" cy="14.3" r=".9" fill="currentColor"/><circle cx="14.7" cy="14.3" r=".9" fill="currentColor"/>',
  apple: '<path d="M15.8 12.6c0-2 1.6-2.9 1.7-3a3.7 3.7 0 0 0-2.9-1.6c-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7a3.9 3.9 0 0 0-3.3 2c-1.4 2.4-.4 6 1 8 .7 1 1.4 2 2.5 2s1.4-.6 2.6-.6 1.5.6 2.6.6 1.8-1 2.4-2a8 8 0 0 0 1.1-2.2 3.4 3.4 0 0 1-2.1-3.2zM13.8 6.4a3.4 3.4 0 0 0 .8-2.5 3.5 3.5 0 0 0-2.3 1.2 3.2 3.2 0 0 0-.8 2.4 2.9 2.9 0 0 0 2.3-1.1z"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.6M12 16.8v.2"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 4.5v15M6 9h.5M6 12h.5"/>',
  share: '<circle cx="17.5" cy="6" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  x: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  dots: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  filter: '<path d="M4.5 6h15M7.5 12h9M10.5 18h3"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  bug: '<rect x="7.5" y="7.5" width="9" height="12" rx="4.5"/><path d="M12 11v8.5M7.5 12H4M20 12h-3.5M7.5 16.5 4.5 18M16.5 16.5l3 1.5M8.5 8 7 5.5M15.5 8 17 5.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  grip: '<circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="17" r="1" fill="currentColor"/><circle cx="15" cy="17" r="1" fill="currentColor"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/** Priority glyphs (chevrons / bars) for severities. */
export function priority(sev) {
  const map = {
    blocker: '<path d="m6 12 6-5 6 5M6 17l6-5 6 5"/><path d="M6 7l6-5 6 5" opacity=".9"/>',
    high: '<path d="m6 13 6-5 6 5M6 18l6-5 6 5"/>',
    medium: '<path d="M6 10h12M6 15h12"/>',
    low: '<path d="m6 9 6 5 6-5"/>',
    info: '<circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  };
  return `<svg class="prio prio-${sev}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${sev} priority">${map[sev] || ''}</svg>`;
}

// ---------------------------------------------------------------- colorful "product" icons
// Original filled icons in the Delulu palette (blue, red, yellow, green), Google-product style.
const B = '#3B82F6', DB = '#1D4ED8', R = '#EF4444', Y = '#FBBF24', O = '#F59E0B', G = '#22C55E', DG = '#15803D', W = '#fff';
const C = {
  home: `<path d="M2.8 11.2 12 3.3l9.2 7.9z" fill="${R}"/><path d="M5.2 10.6h13.6v9.1a1.3 1.3 0 0 1-1.3 1.3H6.5a1.3 1.3 0 0 1-1.3-1.3z" fill="${B}"/><rect x="10" y="14" width="4" height="7" rx="1" fill="${Y}"/>`,
  clock: `<circle cx="12" cy="12" r="9.3" fill="${B}"/><path d="M12 12V2.7A9.3 9.3 0 0 1 21.3 12z" fill="${DB}"/><path d="M12 6.8V12l3.6 2.3" stroke="${W}" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle cx="12" cy="12" r="1.5" fill="${Y}"/>`,
  star: `<path d="m12 2.6 2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" fill="${Y}"/><path d="M12 2.6v14.9l5.8 3.1-1.1-6.5 4.7-4.6-6.5-.9z" fill="${O}"/>`,
  board: `<rect x="2.8" y="3.5" width="5.4" height="15" rx="1.6" fill="${B}"/><rect x="9.3" y="3.5" width="5.4" height="10.5" rx="1.6" fill="${Y}"/><rect x="15.8" y="3.5" width="5.4" height="17" rx="1.6" fill="${G}"/>`,
  summary: `<circle cx="12" cy="12" r="6.6" fill="none" stroke="${B}" stroke-width="5" stroke-dasharray="15 41.5" transform="rotate(-90 12 12)"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="${R}" stroke-width="5" stroke-dasharray="0 15 9 32.5" transform="rotate(-90 12 12)"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="${Y}" stroke-width="5" stroke-dasharray="0 24 9 23.5" transform="rotate(-90 12 12)"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="${G}" stroke-width="5" stroke-dasharray="0 33 8.5 15" transform="rotate(-90 12 12)"/>`,
  list: `<circle cx="5" cy="6" r="2.2" fill="${R}"/><circle cx="5" cy="12" r="2.2" fill="${Y}"/><circle cx="5" cy="18" r="2.2" fill="${G}"/><rect x="9" y="4.8" width="12" height="2.5" rx="1.25" fill="${B}"/><rect x="9" y="10.8" width="10" height="2.5" rx="1.25" fill="${B}"/><rect x="9" y="16.8" width="11" height="2.5" rx="1.25" fill="${B}"/>`,
  checks: `<rect x="3" y="3" width="18" height="18" rx="5" fill="${G}"/><path d="M3 12.5V8a5 5 0 0 1 5-5h4.5z" fill="${DG}" opacity=".35"/><path d="m7.5 12.3 3 3 6-6.5" stroke="${W}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  shield: `<path d="M12 2.5 20 5.6v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10v-6z" fill="${B}"/><path d="M12 2.5v19.1c4.6-1.3 8-5 8-10v-6z" fill="${DB}"/><path d="m8.6 12 2.4 2.4 4.4-4.6" stroke="${W}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  layers: `<path d="m12 13.6 9 -4.3-9-4.3-9 4.3z" fill="${B}" transform="translate(0 7)" opacity=".95"/><path d="m12 13.6 9 -4.3-9-4.3-9 4.3z" fill="${G}" transform="translate(0 3.5)"/><path d="m12 13.6 9 -4.3-9-4.3-9 4.3z" fill="${Y}"/>`,
  eye: `<path d="M1.8 12C4 7.6 7.7 5 12 5s8 2.6 10.2 7c-2.2 4.4-5.9 7-10.2 7S4 16.4 1.8 12z" fill="${B}"/><circle cx="12" cy="12" r="4.4" fill="${W}"/><circle cx="12" cy="12" r="2.4" fill="${DB}"/><circle cx="13.1" cy="10.9" r=".9" fill="${Y}"/>`,
  android: `<path d="M3.5 18.5a8.5 8.5 0 0 1 17 0z" fill="${G}"/><path d="m6.6 7.6 1.8 2.9M17.4 7.6l-1.8 2.9" stroke="${G}" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="15" r="1.2" fill="${W}"/><circle cx="15" cy="15" r="1.2" fill="${W}"/>`,
  apple: `<path d="M12 7.6c-1.3-1.1-3-1.6-4.6-1.1C4.6 7.4 3.6 10.6 4.4 14c.8 3.6 3.2 7 5.6 6.5.8-.2 1.3-.5 2-.5s1.2.3 2 .5c2.4.5 4.8-2.9 5.6-6.5.8-3.4-.2-6.6-3-7.5-1.6-.5-3.3 0-4.6 1.1z" fill="${R}"/><path d="M12 7.6C12 5.4 13.3 3.5 16 2.8c.1 2.6-1.4 4.4-4 4.8z" fill="${G}"/><path d="M7.3 9.6c-.9.8-1.3 2-1.2 3.3" stroke="${W}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".7"/>`,
  key: `<circle cx="8" cy="15" r="5.2" fill="${Y}"/><circle cx="8" cy="15" r="2" fill="${W}"/><path d="m11.4 11.6 8.4-8.4 1.8 1.8-1.6 1.6 1.4 1.4-1.8 1.8-1.4-1.4-1.2 1.2 1.2 1.2-1.8 1.8-1.2-1.2-2 2z" fill="${O}"/>`,
  scale: `<rect x="11" y="4" width="2" height="15" rx="1" fill="${DB}"/><rect x="6.5" y="18.5" width="11" height="2.5" rx="1.25" fill="${DB}"/><rect x="3.5" y="5.5" width="17" height="2" rx="1" fill="${B}"/><path d="M2.3 13.5h7.4a3.7 3.7 0 0 1-7.4 0z" fill="${R}"/><path d="M14.3 13.5h7.4a3.7 3.7 0 0 1-7.4 0z" fill="${G}"/><path d="m6 7.5-3 6m3-6 3 6m9-6-3 6m3-6 3 6" stroke="${B}" stroke-width="1.2"/>`,
  map: `<path d="M2.5 5.8 8.5 3.5v14.7l-6 2.3z" fill="${G}"/><path d="m8.5 3.5 7 2.3v14.7l-7-2.3z" fill="${Y}"/><path d="m15.5 5.8 6-2.3v14.7l-6 2.3z" fill="${B}"/><circle cx="12" cy="10" r="2" fill="${R}"/>`,
  book: `<path d="M5 3.5h12a2 2 0 0 1 2 2v13H7a2 2 0 0 0-2 2z" fill="${R}"/><path d="M5 20.5a2 2 0 0 1 2-2h12v2.5H7a2 2 0 0 1-2-.5z" fill="#FCA5A5"/><path d="M13 3.5h3.5v7l-1.75-1.4-1.75 1.4z" fill="${Y}"/>`,
  compass: `<circle cx="12" cy="12" r="9.3" fill="${B}"/><path d="M16.2 7.8 13 13 11 11z" fill="${R}"/><path d="M7.8 16.2 11 11 13 13z" fill="${W}"/><circle cx="12" cy="12" r="1.2" fill="${Y}"/>`,
  upload: `<path d="M7 19a5 5 0 0 1-.6-10A6.5 6.5 0 0 1 19 9.6 4.8 4.8 0 0 1 18 19z" fill="${B}"/><path d="M12 16.5v-6.5m-3 2.8 3-3 3 3" stroke="${W}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  lock: `<path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" stroke="${DB}" stroke-width="2.4" fill="none"/><rect x="4.5" y="10" width="15" height="11" rx="3" fill="${Y}"/><circle cx="12" cy="15.5" r="1.8" fill="${O}"/>`,
  doc: `<path d="M6 2.5h8.5l4.5 4.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z" fill="${B}"/><path d="M14.5 2.5V7H19z" fill="${DB}"/><rect x="8" y="11" width="8" height="1.8" rx=".9" fill="${W}"/><rect x="8" y="14.5" width="6" height="1.8" rx=".9" fill="${W}"/>`,
  coffee: `<path d="M8 2.8c-1 1.2 1 2.2 0 3.6M12 2.3c-1 1.3 1 2.4 0 3.9M16 2.8c-1 1.2 1 2.2 0 3.6" stroke="${R}" stroke-width="1.5" stroke-linecap="round" fill="none" class="steam"/><path d="M17.5 10.5h1a3 3 0 0 1 0 6h-1.6" stroke="${O}" stroke-width="2.2" fill="none"/><path d="M4 8.5h14v6.5a5.5 5.5 0 0 1-5.5 5.5h-3A5.5 5.5 0 0 1 4 15z" fill="${Y}"/><ellipse cx="11" cy="8.6" rx="7" ry="1.4" fill="#92400E"/><rect x="2.5" y="20.3" width="17" height="1.8" rx=".9" fill="${B}"/>`,
  heart: `<path d="M12 20.5S3 15 3 9a4.5 4.5 0 0 1 9-1.2A4.5 4.5 0 0 1 21 9c0 6-9 11.5-9 11.5z" fill="${R}"/><path d="M12 20.5V7.8A4.5 4.5 0 0 1 21 9c0 6-9 11.5-9 11.5z" fill="#DC2626"/>`,
};

/** Colorful product icon; falls back to the line icon if no colored version exists. */
export function cicon(name, cls = '') {
  if (!C[name]) return icon(name, cls);
  return `<svg class="cico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${C[name]}</svg>`;
}
