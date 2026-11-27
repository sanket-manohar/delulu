// SPDX-License-Identifier: MIT
// Block model shared by the HTML renderer and the Markdown exporter (Notion-style blocks).

export const h1 = (text) => ({ type: 'h1', text });
export const h2 = (text, opts = {}) => ({ type: 'h2', text, ...opts });
export const h3 = (text) => ({ type: 'h3', text });
export const p = (text) => ({ type: 'p', text });
export const callout = (icon, tone, text, children = []) => ({ type: 'callout', icon, tone, text, children });
export const todo = (id, text, opts = {}) => ({ type: 'todo', id, text, ...opts });
export const toggle = (title, children, opts = {}) => ({ type: 'toggle', title, children, ...opts });
export const table = (head, rows) => ({ type: 'table', head, rows });
export const code = (text, title = '') => ({ type: 'code', text, title });
export const ul = (items) => ({ type: 'ul', items });
export const ol = (items) => ({ type: 'ol', items });
export const divider = () => ({ type: 'divider' });
export const props = (pairs) => ({ type: 'props', pairs: pairs.filter(([, v]) => v !== undefined && v !== null && v !== '') });
export const bars = (items) => ({ type: 'bars', items });
export const quote = (text) => ({ type: 'quote', text });
export const issue = (data) => ({ type: 'issue', data });
export const stat = (items) => ({ type: 'stats', items });
export const tabs = (items) => ({ type: 'tabs', items }); // [{label, children}]
export const timeline = (items) => ({ type: 'timeline', items }); // [{title, when, text, state}]
export const link = (label, url) => `[${label}](${url})`;

export const fmtBytes = (n) => {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
};
