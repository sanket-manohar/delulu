// SPDX-License-Identifier: MIT
// Kanban board of issues + issue detail drawer (Jira-inspired, Delulu styling).

import { esc, fixLine } from './render.js';
import { icon, priority } from './icons.js';
import { issueKey } from '../report/pages.js';
import { fixFor } from '../report/frameworks.js';
import { SEVERITY_LABEL } from '../analyzers/common.js';

export const CAT_LABEL = { store: 'Store', security: 'Security', privacy: 'Privacy' };

function columns(groupBy) {
  if (groupBy === 'category') {
    return [
      { id: 'store', title: 'Store rules', hint: 'Upload & review', test: (i) => i.category === 'store' },
      { id: 'security', title: 'Security', hint: 'OWASP MASVS', test: (i) => i.category === 'security' },
      { id: 'privacy', title: 'Privacy', hint: 'Declarations', test: (i) => i.category === 'privacy' },
    ];
  }
  return [
    { id: 'blocker', title: 'Blockers', hint: 'Store will reject', test: (i) => i.severity === 'blocker' },
    { id: 'high', title: 'High risk', hint: 'Likely rejection', test: (i) => i.severity === 'high' },
    { id: 'rest', title: 'Should fix', hint: 'Medium & low', test: (i) => i.severity === 'medium' || i.severity === 'low' },
  ];
}

export function visibleIssues(report, filter) {
  const q = (filter.q || '').toLowerCase().trim();
  return report.issues.filter((i) => i.severity !== 'info')
    .filter((i) => !filter.cat || filter.cat === 'all' || i.category === filter.cat)
    .filter((i) => !q || `${i.title} ${i.detail} ${i.itms || ''} ${issueKey(report, i)} ${i.evidence.join(' ')}`.toLowerCase().includes(q));
}

function card(report, i, fixed) {
  const key = issueKey(report, i);
  return `<button type="button" class="card-issue sev-${esc(i.severity)} ${fixed ? 'is-done' : ''}" draggable="true" data-issue="${esc(i.id)}" aria-label="${esc(`${key}: ${i.title}, ${SEVERITY_LABEL[i.severity]}${fixed ? ', fixed' : ''}`)}">
    <span class="ci-title">${esc(i.title)}</span>
    <span class="ci-labels"><span class="lbl lbl-${esc(i.category)}">${esc(CAT_LABEL[i.category] || i.category)}</span>${i.itms ? `<span class="lbl lbl-code">${esc(i.itms.split(' ')[0])}</span>` : ''}</span>
    <span class="ci-foot">
      <span class="ci-key">${fixed ? icon('checks', 'ok') : icon('bug')}${esc(key)}</span>
      ${i.evidence.length ? `<span class="ci-count" title="${i.evidence.length} evidence item(s)">${i.evidence.length}</span>` : ''}
      ${priority(i.severity)}
    </span>
  </button>`;
}

export function renderBoard(report, { fixed, filter, groupBy }) {
  const all = visibleIssues(report, filter);
  const cols = columns(groupBy);
  const open = all.filter((i) => !fixed[i.id]);
  const done = all.filter((i) => fixed[i.id]);
  const total = report.issues.filter((i) => i.severity !== 'info').length;
  const doneCount = report.issues.filter((i) => i.severity !== 'info' && fixed[i.id]).length;
  const chip = (v, label) => `<button type="button" class="chip ${filter.cat === v || (!filter.cat && v === 'all') ? 'active' : ''}" data-bfilter="${v}">${label}</button>`;
  return `
  <div class="board-toolbar" id="board-toolbar">
    <label class="board-search">${icon('search')}<input type="search" id="board-q" placeholder="Search this board" value="${esc(filter.q || '')}" aria-label="Search issues"></label>
    <div class="chips">${chip('all', 'All')}${chip('store', 'Store')}${chip('security', 'Security')}${chip('privacy', 'Privacy')}</div>
    <div class="board-right">
      <span class="muted small">Group by</span>
      <div class="seg" role="group" aria-label="Group by">
        <button type="button" class="${groupBy !== 'category' ? 'active' : ''}" data-groupby="severity">Severity</button>
        <button type="button" class="${groupBy === 'category' ? 'active' : ''}" data-groupby="category">Category</button>
      </div>
    </div>
  </div>
  <div class="board-progress"><div class="pl-track"><div class="pl-fill" data-w="${total ? Math.round((doneCount / total) * 100) : 100}"></div></div><span>${doneCount} of ${total} fixed</span></div>
  <div class="board" id="board">
    ${cols.map((c) => {
      const list = open.filter(c.test);
      return `<section class="col" data-col="${c.id}" aria-label="${esc(c.title)}">
        <header class="col-head"><span class="col-title">${esc(c.title)}</span><span class="col-count">${list.length}</span><span class="col-hint">${esc(c.hint)}</span></header>
        <div class="col-body">${list.map((i) => card(report, i, false)).join('') || `<div class="col-empty">${icon('check')} Nothing here</div>`}</div>
      </section>`;
    }).join('')}
    <section class="col col-done" data-col="done" aria-label="Done">
      <header class="col-head"><span class="col-title">Done</span><span class="col-count">${done.length}</span><span class="col-hint">Drag a card here</span></header>
      <div class="col-body">${done.map((i) => card(report, i, true)).join('') || `<div class="col-empty">Fixed cards land here</div>`}</div>
    </section>
  </div>`;
}

export function renderDrawer(report, issueId, { fixed, fw }) {
  const i = report.checks.find((c) => c.id === issueId);
  if (!i) return '';
  const steps = fixFor(i.fix, fw, report);
  const isDone = !!fixed[i.id];
  return `
  <div class="drawer-head">
    <span class="ci-key">${icon('bug')}${esc(issueKey(report, i))}</span>
    <span class="pill sev-pill sev-${esc(i.severity)}">${priority(i.severity)} ${esc(SEVERITY_LABEL[i.severity])}</span>
    <button type="button" class="icon-btn" data-action="close-drawer" aria-label="Close">${icon('x')}</button>
  </div>
  <h2 class="drawer-title" id="drawer-title">${esc(i.title)}</h2>
  <div class="drawer-actions">
    <button type="button" class="btn ${isDone ? '' : 'primary'}" data-toggle-fixed="${esc(i.id)}">${isDone ? '↩︎ Reopen' : `${icon('check')} Mark as fixed`}</button>
    <button type="button" class="btn" data-action="copy-issue" data-issue-id="${esc(i.id)}">Copy as Markdown</button>
  </div>
  <div class="drawer-grid">
    <div class="k">Status</div><div>${isDone ? '<span class="pill green">Done</span>' : '<span class="pill gray">To fix</span>'}</div>
    <div class="k">Category</div><div>${esc(CAT_LABEL[i.category] || i.category)} · ${esc(i.group)}</div>
    ${i.itms ? `<div class="k">Store code</div><div><code class="ic">${esc(i.itms)}</code></div>` : ''}
    ${i.masvs ? `<div class="k">OWASP</div><div>${esc(i.masvs)}</div>` : ''}
  </div>
  <div class="ev-label">What's wrong</div>
  <p class="b-p">${esc(i.detail)}</p>
  ${i.evidence.length ? `<div class="ev-label">Found in your build</div><ul class="ev">${i.evidence.slice(0, 40).map((e) => `<li><code class="ic">${esc(e)}</code></li>`).join('')}</ul>` : ''}
  ${steps.length ? `<div class="ev-label">How to fix${fw ? ` · ${esc(fw)}` : ''}</div><ol class="b-ol fix">${steps.map((s) => `<li>${fixLine(s)}</li>`).join('')}</ol>` : ''}
  ${i.refs?.length ? `<div class="ev-label">Official docs</div><div class="issue-foot">${i.refs.map((r) => `<a class="ref" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(r.label)}</a>`).join('')}</div>` : ''}`;
}
