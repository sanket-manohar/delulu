// SPDX-License-Identifier: MIT
// StoreReady UI controller — Notion-style workspace. No frameworks, no network calls.

import { analyze, SUPPORTED } from '../analyzers/index.js';
import { buildPages } from '../report/pages.js';
import { pageToMarkdown } from '../report/markdown.js';
import { frameworkKey, FRAMEWORKS } from '../report/frameworks.js';
import { buildZip } from '../core/zipwriter.js';
import { sampleApk, sampleIpa } from '../core/samples.js';
import { renderBlocks, esc, inline } from './render.js';
import { REPO_URL, SITE_URL, VERSION } from '../config.js';
import { LAST_REVIEWED } from '../rules/policy.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const S = {
  report: null,
  pages: [],
  fw: store.get('sr:fw', 'flutter'),
  appType: store.get('sr:appType', 'general'),
  checks: {},
  openAll: false,
};

const checksKey = () => (S.report ? `sr:checks:${S.report.platform}:${S.report.app.id}:${S.report.app.versionName}` : 'sr:checks:global');

// ---------------------------------------------------------------- theme
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set('sr:theme', t);
  $$('[data-action="theme"]').forEach((b) => { b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); b.textContent = t === 'dark' ? '☀️' : '🌙'; });
}
applyTheme(store.get('sr:theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

// ---------------------------------------------------------------- pages
function rebuild() {
  S.checks = store.get(checksKey(), {});
  S.pages = buildPages({ report: S.report, fw: S.fw, appType: S.appType });
  renderNav();
}

function renderNav() {
  const sections = [...new Set(S.pages.map((p) => p.section))];
  const cur = currentId();
  $('#nav').innerHTML = sections.map((sec) => `
    <div class="nav-section">${esc(sec)}</div>
    ${S.pages.filter((p) => p.section === sec).map((p) => `
      <a class="nav-item ${cur === p.id ? 'active' : ''}" href="#/${p.id}" data-nav="${p.id}">
        <span class="ni">${esc(p.icon)}</span><span class="nt">${esc(p.title)}</span>${p.badge ? `<span class="nb">${p.badge}</span>` : ''}
      </a>`).join('')}`).join('');
  $('[data-nav-home]').classList.toggle('active', cur === 'home');
}

const currentId = () => (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];

function route() {
  const id = currentId();
  if (id === 'home') return renderHome();
  const page = S.pages.find((p) => p.id === id);
  if (!page) { location.hash = '#/'; return; }
  renderPage(page);
}

function setCrumbs(parts) {
  $('#crumbs').innerHTML = parts.map((p, i) => `<span class="crumb">${esc(p)}</span>${i < parts.length - 1 ? '<span class="sep">/</span>' : ''}`).join('');
}

function animatePage() {
  const page = $('#page');
  page.classList.remove('enter');
  void page.offsetWidth;
  page.classList.add('enter');
  $('#scroller').scrollTop = 0;
}

function renderPage(page) {
  const ctx = { state: S.checks, appType: S.appType, fw: S.fw, openAll: S.openAll };
  document.title = `${page.title} · StoreReady`;
  setCrumbs(S.report && page.section === 'This build' ? [S.report.app.name || S.report.fileName, page.id === 'overview' ? 'Overview' : page.title] : [page.section, page.title]);
  const todos = countTodos(page.blocks);
  $('#page').innerHTML = `
    <div class="page-icon" aria-hidden="true">${esc(page.icon)}</div>
    <h1 class="page-title">${esc(page.title)}</h1>
    ${page.subtitle ? `<div class="page-sub">${inline(page.subtitle)}</div>` : ''}
    ${todos.total ? `<div class="progress-line" title="Checklist progress"><div class="pl-track"><div class="pl-fill" data-w="${Math.round((todos.done / todos.total) * 100)}"></div></div><span>${todos.done}/${todos.total} done</span></div>` : ''}
    <div class="page-actions">
      <button class="btn-ghost sm" type="button" data-action="toggle-all">${S.openAll ? 'Collapse all' : 'Expand all'}</button>
      <button class="btn-ghost sm" type="button" data-action="copy-md">Copy as Markdown</button>
    </div>
    <div class="blocks">${renderBlocks(page.blocks, ctx)}</div>`;
  hydrate();
  renderNav();
  animatePage();
}

function countTodos(blocks) {
  let total = 0, done = 0;
  const walk = (bs) => bs.forEach((b) => {
    if (b.type === 'todo') { total++; if (b.status === 'pass' || ((!b.status || b.status === 'manual') && S.checks[b.id])) done++; }
    if (b.children) walk(b.children);
    if (b.type === 'tabs') b.items.forEach((t) => walk(t.children));
  });
  walk(blocks);
  return { total, done };
}

function hydrate() {
  $$('[data-w]').forEach((el) => { requestAnimationFrame(() => { el.style.width = `${el.dataset.w}%`; }); });
}

// ---------------------------------------------------------------- home
function renderHome() {
  document.title = 'StoreReady — Will your app pass Google Play & App Store review?';
  setCrumbs(['StoreReady']);
  const r = S.report;
  $('#page').innerHTML = `
    <div class="page-icon" aria-hidden="true">🚀</div>
    <h1 class="page-title">Will your app pass store review?</h1>
    <div class="page-sub">Drop an <strong>APK, AAB or IPA</strong>. StoreReady runs the same checks Google Play Console and App Store Connect run on upload, plus OWASP security checks. You get every fix and every step to go live.</div>

    <div class="drop" id="drop" tabindex="0" role="button" aria-label="Choose an APK, AAB or IPA file to analyze">
      <div class="drop-inner">
        <div class="drop-icon" aria-hidden="true">📦</div>
        <div class="drop-title">Drop your build here or <u>browse</u></div>
        <div class="drop-sub">${SUPPORTED} · Flutter · React Native · Expo · Kotlin · Swift · Unity · MAUI · Capacitor</div>
        <div class="drop-privacy">🔒 100% in your browser — your file is never uploaded</div>
      </div>
    </div>
    <div class="sample-row">
      <span class="muted">No build handy?</span>
      <button class="btn" type="button" data-action="sample-apk">🤖 Try a sample APK</button>
      <button class="btn" type="button" data-action="sample-ipa">🍎 Try a sample IPA</button>
      ${r ? `<a class="btn primary" href="#/overview">Open last report →</a>` : ''}
    </div>

    <h2 class="b-h2">What it checks</h2>
    <div class="cards">
      ${[
        ['🧪', 'Store upload checks', 'Target API 36, 16 KB pages, 64-bit, signing, AAB, debuggable · Xcode 26 SDK, ITMS-90683/91053/90809, profiles, entitlements'],
        ['🔐', 'Security (OWASP MASVS)', 'Hard-coded secrets, leaked keystores, cleartext traffic, exported components, ATS, obfuscation, backups'],
        ['🧾', 'Privacy & policy', 'Restricted permissions, Data safety / App Privacy draft, privacy manifests, ATT, Sign in with Apple'],
        ['🏗️', 'Architecture', 'Framework & engine detection, SDK inventory, components, deep links, size breakdown'],
        ['🔑', 'Keys & secrets', 'Exactly where each key belongs (and never belongs) for your framework, plus CI signing'],
        ['🗺️', 'Step-by-step to live', 'Account → build → testing → review → rollout for both stores, with your framework\'s commands'],
      ].map(([i, t, d]) => `<div class="card"><div class="card-i">${i}</div><div class="card-t">${t}</div><div class="card-d">${d}</div></div>`).join('')}
    </div>

    <h2 class="b-h2">Playbooks — no upload needed</h2>
    <div class="link-list">
      ${S.pages.filter((p) => p.section !== 'This build').map((p) => `<a class="link-row" href="#/${p.id}"><span>${esc(p.icon)}</span><span>${esc(p.title)}</span><span class="muted">${esc(p.subtitle || '')}</span></a>`).join('')}
    </div>

    <div class="b-callout tone-gray"><span class="b-callout-icon">📅</span><div>Rules last reviewed <strong>${LAST_REVIEWED}</strong> — Play target API 36 (31 Aug 2026), Apple Xcode 26 SDK (28 Apr 2026), iOS 13+ deployment target, 16 KB page sizes, Android developer verification. Open source: <a href="${esc(REPO_URL)}" target="_blank" rel="noopener noreferrer">star or contribute on GitHub</a>.</div></div>
  `;
  const drop = $('#drop');
  drop.addEventListener('click', () => $('#file').click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
  renderNav();
  animatePage();
}

// ---------------------------------------------------------------- analysis
async function runAnalysis(file) {
  const modal = $('#progress');
  modal.hidden = false;
  modal.classList.add('show');
  $('#progress-file').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
  const setP = (msg, frac) => {
    $('#progress-msg').textContent = msg;
    if (frac !== undefined) $('#progress-bar').style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
  };
  setP('Opening archive…', 0.02);
  try {
    const report = await analyze(file, { onProgress: setP });
    S.report = report;
    const fk = frameworkKey(report);
    if (fk && fk !== 'other') { S.fw = fk; store.set('sr:fw', fk); }
    rebuild();
    setP('Done', 1);
    setTimeout(() => { modal.classList.remove('show'); modal.hidden = true; }, 250);
    location.hash = '#/overview';
    route();
    toast(report.summary.ready ? `✅ ${report.summary.verdict}` : `⛔ ${report.summary.counts.blocker} blocker(s) found`);
  } catch (e) {
    modal.classList.remove('show');
    modal.hidden = true;
    toast(`⚠️ ${e.message || e}`, 6000);
    console.error(e);
  }
}

function sampleFile(kind) {
  const bytes = kind === 'apk' ? sampleApk() : sampleIpa();
  return new File([bytes], kind === 'apk' ? 'acme-wallet-sample.apk' : 'AcmeShop-sample.ipa');
}

// ---------------------------------------------------------------- exports
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const baseName = () => (S.report ? `${S.report.app.id || 'app'}-${S.report.app.versionName || ''}`.replace(/[^\w.-]+/g, '_') : 'storeready-playbooks');

function exportZip() {
  const files = S.pages.map((p, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${p.id}.md`, data: pageToMarkdown(p, S.checks) }));
  files.unshift({ name: 'README.md', data: `# StoreReady docs pack\n\n${S.report ? `**${S.report.app.name}** \`${S.report.app.id}\` ${S.report.app.versionName} — score ${S.report.summary.score}/100 (${S.report.summary.verdict})\n\n` : ''}${S.pages.map((p, i) => `- [${p.icon} ${p.title}](${files[i].name})`).join('\n')}\n` });
  if (S.report) files.push({ name: 'report.json', data: JSON.stringify(S.report, null, 2) });
  download(`${baseName()}-storeready-docs.zip`, buildZip(files), 'application/zip');
}

function exportMd() { download(`${baseName()}-storeready.md`, S.pages.map((p) => pageToMarkdown(p, S.checks)).join('\n\n'), 'text/markdown'); }
function exportJson() { if (S.report) download(`${baseName()}-report.json`, JSON.stringify(S.report, null, 2), 'application/json'); else toast('Analyze a build first'); }

function printAll() {
  const ctx = { state: S.checks, appType: S.appType, fw: S.fw, openAll: true };
  $('#print-root').innerHTML = S.pages.map((p) => `<section class="print-page"><div class="page-icon">${esc(p.icon)}</div><h1 class="page-title">${esc(p.title)}</h1>${renderBlocks(p.blocks, ctx)}</section>`).join('');
  document.body.classList.add('printing-all');
  $$('#print-root details').forEach((d) => { d.open = true; });
  setTimeout(() => { window.print(); document.body.classList.remove('printing-all'); }, 50);
}

function badgeMarkdown() {
  const s = S.report.summary;
  const color = !s.ready ? 'red' : s.counts.high ? 'orange' : 'brightgreen';
  const store = S.report.platform === 'ios' ? 'App_Store' : 'Google_Play';
  return `[![StoreReady ${store.replace('_', ' ')}](https://img.shields.io/badge/StoreReady_${store}-${s.score}%2F100-${color})](${SITE_URL})`;
}

async function copy(text, msg = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(`📋 ${msg}`); } catch { toast('Copy failed — your browser blocked clipboard access'); }
}

// ---------------------------------------------------------------- palette (Ctrl/Cmd+K)
function openPalette() {
  const pal = $('#palette');
  pal.hidden = false;
  pal.classList.add('show');
  const input = $('#palette-input');
  input.value = '';
  renderPalette('');
  input.focus();
}
function closePalette() { const pal = $('#palette'); pal.classList.remove('show'); pal.hidden = true; }
function renderPalette(q) {
  q = q.toLowerCase();
  const items = [];
  for (const p of S.pages) {
    if (!q || p.title.toLowerCase().includes(q)) items.push({ label: `${p.icon} ${p.title}`, hint: p.section, href: `#/${p.id}` });
    const walk = (bs) => bs.forEach((b) => {
      const t = b.title || b.text || b.data?.title;
      if (q.length > 1 && typeof t === 'string' && t.toLowerCase().includes(q) && items.length < 40) items.push({ label: t.replace(/\*\*|`/g, '').slice(0, 90), hint: p.title, href: `#/${p.id}` });
      if (b.children) walk(b.children);
    });
    walk(p.blocks);
  }
  $('#palette-list').innerHTML = items.slice(0, 40).map((it, i) => `<a class="pal-item ${i ? '' : 'sel'}" href="${it.href}"><span>${esc(it.label)}</span><span class="muted">${esc(it.hint)}</span></a>`).join('') || '<div class="pal-empty">No results</div>';
}

// ---------------------------------------------------------------- toast
let toastTimer;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- events
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action],[data-copy],[data-tabs],[data-apptype],[data-fw],[data-nav],.pal-item');
  if (!t) {
    if (!e.target.closest('.menu')) $$('.menu.open').forEach((m) => m.classList.remove('open'));
    return;
  }
  if (t.matches('.pal-item')) { closePalette(); return; }
  if (t.dataset.nav) { if (matchMedia('(max-width: 860px)').matches) document.body.classList.remove('nav-open'); return; }
  if (t.dataset.copy) { copy($(`#${t.dataset.copy}`).innerText, 'Code copied'); return; }
  if (t.dataset.tabs) {
    const g = t.dataset.tabs;
    $$(`[data-tabs="${g}"]`).forEach((b) => b.classList.toggle('active', b === t));
    $$(`[data-panel="${g}"]`).forEach((p) => p.classList.toggle('hidden', p.dataset.idx !== t.dataset.idx));
    return;
  }
  if (t.dataset.apptype) { S.appType = t.dataset.apptype; store.set('sr:appType', S.appType); rebuild(); route(); return; }
  if (t.dataset.fw) { S.fw = t.dataset.fw; store.set('sr:fw', S.fw); rebuild(); route(); return; }
  const a = t.dataset.action;
  if (a === 'theme') applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  else if (a === 'new') { location.hash = '#/'; setTimeout(() => $('#file').click(), 50); }
  else if (a === 'sample-apk') runAnalysis(sampleFile('apk'));
  else if (a === 'sample-ipa') runAnalysis(sampleFile('ipa'));
  else if (a === 'search') openPalette();
  else if (a === 'collapse') document.body.classList.toggle('nav-collapsed');
  else if (a === 'menu') document.body.classList.toggle('nav-open');
  else if (a === 'export-menu') { t.closest('.menu').classList.toggle('open'); }
  else if (a === 'share-menu') { t.closest('.menu').classList.toggle('open'); }
  else if (a === 'export-zip') exportZip();
  else if (a === 'export-md') exportMd();
  else if (a === 'export-json') exportJson();
  else if (a === 'print') printAll();
  else if (a === 'toggle-all') { S.openAll = !S.openAll; route(); }
  else if (a === 'copy-md') { const p = S.pages.find((x) => x.id === currentId()); if (p) copy(pageToMarkdown(p, S.checks), 'Page copied as Markdown'); }
  else if (a === 'copy-badge') { if (S.report) copy(badgeMarkdown(), 'README badge copied'); else toast('Analyze a build first'); }
  else if (a === 'copy-summary') {
    if (!S.report) { copy(`StoreReady — free, open-source checks that tell you if your APK/AAB/IPA will pass Google Play & App Store review. Runs in your browser. ${SITE_URL}`, 'Link copied'); return; }
    const s = S.report.summary;
    copy(`My ${S.report.platform === 'ios' ? 'iOS' : 'Android'} build scored ${s.score}/100 on StoreReady — ${s.counts.blocker} blockers, ${s.counts.high} high-risk issues caught before store review. Free & runs in your browser: ${SITE_URL}`, 'Summary copied');
  }
  if (t.closest('.menu') && a && !a.endsWith('-menu')) t.closest('.menu').classList.remove('open');
});

document.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-todo]');
  if (cb) {
    S.checks[cb.dataset.todo] = cb.checked;
    store.set(checksKey(), S.checks);
    cb.closest('.b-todo').classList.toggle('done', cb.checked);
    const page = S.pages.find((p) => p.id === currentId());
    if (page) {
      const c = countTodos(page.blocks);
      const fill = $('.pl-fill');
      if (fill) { fill.style.width = `${Math.round((c.done / c.total) * 100)}%`; fill.parentElement.nextElementSibling.textContent = `${c.done}/${c.total} done`; }
    }
  }
  if (e.target.id === 'file' && e.target.files[0]) { runAnalysis(e.target.files[0]); e.target.value = ''; }
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  if (e.key === 'Escape') { closePalette(); $$('.menu.open').forEach((m) => m.classList.remove('open')); document.body.classList.remove('nav-open'); }
  if (!$('#palette').hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
    const items = $$('.pal-item');
    let i = items.findIndex((x) => x.classList.contains('sel'));
    if (e.key === 'Enter') { if (items[i]) { location.hash = items[i].getAttribute('href'); closePalette(); } e.preventDefault(); return; }
    e.preventDefault();
    i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((x, j) => x.classList.toggle('sel', j === i));
    items[i]?.scrollIntoView({ block: 'nearest' });
  }
});
$('#palette-input').addEventListener('input', (e) => renderPalette(e.target.value));
$('#palette').addEventListener('click', (e) => { if (e.target.id === 'palette') closePalette(); });

// Drag & drop anywhere
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (f) runAnalysis(f);
});

window.addEventListener('hashchange', route);
$('#version').textContent = `v${VERSION}`;
$$('[data-repo]').forEach((a) => { a.href = REPO_URL; });
rebuild();
route();

// Expose for debugging & e2e tests.
window.StoreReady = { analyzeFile: runAnalysis, sampleFile, get report() { return S.report; }, FRAMEWORKS };
