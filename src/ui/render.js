// SPDX-License-Identifier: MIT
// Renders the block model to Notion-style HTML. All dynamic text is escaped.

import { SEV_ICON } from '../report/pages.js';
import { SEVERITY_LABEL } from '../analyzers/common.js';
import { APP_TYPES } from '../rules/policy.js';
import { FRAMEWORKS } from '../report/frameworks.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Minimal inline markdown: **bold**, _italic_, `code`, [text](https://url) */
export function inline(s) {
  let h = esc(s).replace(/\\([*_`[\]()\\])/g, (m, c) => `&#${c.charCodeAt(0)};`);
  h = h.replace(/`([^`]+)`/g, '<code class="ic">$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[\s(])_([^_]+)_(?=[\s).,:;!?]|$)/g, '$1<em>$2</em>');
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return h;
}

let uid = 0;
const nid = (p) => `${p}-${++uid}`;

export function renderBlocks(blocks, ctx) {
  return blocks.map((b) => renderBlock(b, ctx)).join('');
}

function renderBlock(b, ctx) {
  switch (b.type) {
    case 'h1': return `<h1 class="b-h1">${inline(b.text)}</h1>`;
    case 'h2': return `<h2 class="b-h2" id="${esc(slug(b.text))}">${inline(b.text)}</h2>`;
    case 'h3': return `<h3 class="b-h3">${inline(b.text)}</h3>`;
    case 'p': return `<p class="b-p">${inline(b.text)}</p>`;
    case 'quote': return `<blockquote class="b-quote">${inline(b.text)}</blockquote>`;
    case 'divider': return '<hr class="b-hr">';
    case 'callout':
      return `<div class="b-callout tone-${esc(b.tone)}"><span class="b-callout-icon" aria-hidden="true">${esc(b.icon)}</span><div>${inline(b.text)}${b.children?.length ? renderBlocks(b.children, ctx) : ''}</div></div>`;
    case 'ul': return `<ul class="b-ul">${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
    case 'ol': return `<ol class="b-ol">${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`;
    case 'code': {
      const id = nid('code');
      return `<div class="b-code">${b.title ? `<div class="b-code-head"><span>${esc(b.title)}</span>` : '<div class="b-code-head"><span>Code</span>'}<button class="btn-ghost sm" data-copy="${id}" type="button">Copy</button></div><pre id="${id}"><code>${esc(b.text)}</code></pre></div>`;
    }
    case 'todo': {
      const auto = b.status && b.status !== 'manual';
      const checked = b.status === 'pass' || (!auto && ctx.state[b.id]);
      const badge = b.status === 'fail' ? '<span class="pill red">Failing</span>' : b.status === 'warn' ? '<span class="pill orange">Review</span>' : b.status === 'pass' ? '<span class="pill green">Verified</span>' : '';
      return `<label class="b-todo ${checked ? 'done' : ''} ${auto ? 'auto' : ''}">
        <input type="checkbox" data-todo="${esc(b.id)}" ${checked ? 'checked' : ''} ${auto ? 'disabled' : ''}>
        <span class="box" aria-hidden="true"></span>
        <span class="t">${inline(b.text)} ${badge}${b.note ? `<span class="note">${inline(b.note)}</span>` : ''}</span>
      </label>`;
    }
    case 'toggle': {
      const open = b.open || ctx.openAll ? 'open' : '';
      return `<details class="b-toggle ${b.step ? 'step' : ''}" ${open}><summary><span class="tri" aria-hidden="true"></span><span class="tt">${inline(b.title)}</span></summary><div class="b-toggle-body">${renderBlocks(b.children, ctx)}</div></details>`;
    }
    case 'table':
      return `<div class="b-table-wrap"><table class="b-table"><thead><tr>${b.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    case 'props':
      return `<div class="b-props">${b.pairs.map(([k, v]) => `<div class="prop"><div class="k">${esc(k)}</div><div class="v">${inline(String(v))}</div></div>`).join('')}</div>`;
    case 'bars':
      return `<div class="b-bars">${b.items.map((i) => `<div class="bar-row"><div class="bar-label">${esc(i.label)}</div><div class="bar-track"><div class="bar-fill" data-w="${Math.max(1, Math.round((i.value / i.max) * 100))}"></div></div><div class="bar-sub">${esc(i.sub)}</div></div>`).join('')}</div>`;
    case 'stats':
      return `<div class="b-stats">${b.items.map((i) => `<div class="stat tone-${esc(i.tone || 'gray')}"><div class="stat-v">${esc(i.value)}</div><div class="stat-l">${esc(i.label)}${i.sub ? ` · ${esc(i.sub)}` : ''}</div></div>`).join('')}</div>`;
    case 'tabs': {
      const g = nid('tabs');
      return `<div class="b-tabs" role="tablist">${b.items.map((t, i) => `<button class="tab ${i ? '' : 'active'}" role="tab" data-tabs="${g}" data-idx="${i}" type="button">${esc(t.label)}</button>`).join('')}</div>${b.items.map((t, i) => `<div class="tab-panel ${i ? 'hidden' : ''}" data-panel="${g}" data-idx="${i}">${renderBlocks(t.children, ctx)}</div>`).join('')}`;
    }
    case 'timeline':
      return `<ol class="b-timeline">${b.items.map((t) => `<li class="tl ${esc(t.state)}"><span class="dot" aria-hidden="true"></span><div><div class="tl-head"><strong>${esc(t.title)}</strong><span class="tl-when">${esc(t.when)}</span>${t.state === 'current' ? '<span class="pill blue">You are here</span>' : ''}</div><p>${inline(t.text)}</p></div></li>`).join('')}</ol>`;
    case 'issue': return renderIssue(b.data, ctx);
    case 'nextstep':
      return `<div class="next-step tone-${esc(b.tone)}" id="next-step"><div class="ns-body"><div class="ns-title">${esc(b.title)}</div><div class="ns-text">${inline(b.text)}</div></div><a class="btn primary" href="${esc(b.action.href)}">${esc(b.action.label)} →</a></div>`;
    case 'stepper':
      return `<ol class="stepper" aria-label="Release progress">${b.steps.map((x, i) => `<li class="st ${esc(x.state)}"><span class="st-dot">${x.state === 'done' ? '✓' : i + 1}</span><span class="st-l">${esc(x.label)}</span></li>`).join('')}</ol>`;
    case 'apptype':
      return `<div class="picker"><span class="picker-label">App category</span><div class="chips">${Object.entries(APP_TYPES).map(([k, t]) => `<button type="button" class="chip ${ctx.appType === k ? 'active' : ''}" data-apptype="${k}">${t.icon} ${esc(t.label)}</button>`).join('')}</div></div>`;
    case 'fwpicker':
      return `<div class="picker"><span class="picker-label">Your framework</span><div class="chips">${Object.entries(FRAMEWORKS).filter(([k]) => k !== 'other' && !(b.platform === 'android' && k === 'native-ios') && !(b.platform === 'ios' && k === 'native-android')).map(([k, f]) => `<button type="button" class="chip ${ctx.fw === k ? 'active' : ''}" data-fw="${k}">${f.icon} ${esc(f.label)}</button>`).join('')}</div></div>`;
    default: return '';
  }
}

function renderIssue(i, ctx) {
  return `<details class="b-issue sev-${esc(i.severity)}" ${ctx.openAll ? 'open' : ''}>
    <summary>
      <span class="tri" aria-hidden="true"></span>
      <span class="sev-dot" aria-hidden="true">${SEV_ICON[i.severity]}</span>
      <span class="it">${inline(i.title)}</span>
      <span class="meta">${i.itms ? `<span class="pill gray mono">${esc(i.itms)}</span>` : ''}<span class="pill sev">${esc(SEVERITY_LABEL[i.severity])}</span></span>
    </summary>
    <div class="b-issue-body">
      <p class="b-p">${esc(i.detail)}</p>
      ${i.evidence?.length ? `<div class="ev-label">Evidence</div><ul class="ev">${i.evidence.slice(0, 30).map((e) => `<li><code class="ic">${esc(e)}</code></li>`).join('')}${i.evidence.length > 30 ? `<li>…and ${i.evidence.length - 30} more</li>` : ''}</ul>` : ''}
      ${i.fixSteps?.length ? `<div class="ev-label">How to fix</div><ol class="b-ol fix">${i.fixSteps.map((s) => `<li>${fixLine(s)}</li>`).join('')}</ol>` : ''}
      <div class="issue-foot">${[i.group, i.masvs].filter(Boolean).map((x) => `<span class="pill gray">${esc(x)}</span>`).join('')}${(i.refs || []).map((r) => `<a class="ref" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(r.label)}</a>`).join('')}</div>
    </div>
  </details>`;
}

// A fix step that looks like a shell command or code is shown as code.
export function fixLine(s) {
  if (/^(flutter|\.\/gradlew|cd |eas |npx |keytool|xcodebuild|grep|android\/|app\/|buildTypes|pubspec|ios\/|Xcode)/.test(s) && !/\s—\s/.test(s)) return `<code class="ic">${esc(s)}</code>`;
  return inline(s);
}

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
