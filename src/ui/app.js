// SPDX-License-Identifier: MIT
// Delulu UI controller — Jira-style navigation with Notion-style pages.
// Nothing about your app is stored: reports live in memory and can be downloaded / reopened as a file.

import { analyze, SUPPORTED, summarize } from '../analyzers/index.js';
import { buildPages, issueKey } from '../report/pages.js';
import { pageToMarkdown, blocksToMarkdown } from '../report/markdown.js';
import { frameworkKey, FRAMEWORKS, fixFor } from '../report/frameworks.js';
import { buildZip } from '../core/zipwriter.js';
import { sampleApk, sampleIpa } from '../core/samples.js';
import { renderBlocks, esc, inline } from './render.js';
import { renderBoard, renderDrawer } from './board.js';
import { icon } from './icons.js';
import { Tour } from './tour.js';
import { REPO_URL, SITE_URL, VERSION } from '../config.js';
import { LAST_REVIEWED } from '../rules/policy.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// UI preferences only (theme, framework, starred pages, tour seen). Never app data.
const prefs = {
  get(k, d) { try { const v = localStorage.getItem(`delulu:${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`delulu:${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

const BUILD_TABS = ['overview', 'board', 'issues', 'checks', 'security', 'architecture', 'privacy'];
const TAB_LABEL = { overview: 'Summary', board: 'Board', issues: 'Issues', checks: 'Store checks', security: 'Security', architecture: 'Architecture', privacy: 'Privacy' };
const TAB_ICON = { overview: 'summary', board: 'board', issues: 'list', checks: 'checks', security: 'shield', architecture: 'layers', privacy: 'eye' };
const PAGE_ICON = { keys: 'key', compliance: 'scale', play: 'android', appstore: 'apple', roadmap: 'map', policies: 'book' };

const S = {
  report: null,
  session: [], // builds analyzed in this tab (memory only)
  pages: [],
  fw: prefs.get('fw', 'flutter'),
  appType: prefs.get('appType', 'general'),
  starred: prefs.get('starred', []),
  checks: {}, // todo ticks for the current report (memory; included in the downloaded report)
  fixed: {}, // board "fixed" state (memory; included in the downloaded report)
  board: { q: '', cat: 'all', groupBy: 'severity' },
  openAll: false,
  dirty: false, // changes since last download
  expanded: { recent: true, starred: true, build: true },
  drawer: null,
};

// ---------------------------------------------------------------- theme
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  prefs.set('theme', t);
  const b = $('#btn-theme');
  if (b) { b.innerHTML = icon(t === 'dark' ? 'sun' : 'moon'); b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); }
}

// ---------------------------------------------------------------- state helpers
function setReport(report, progress = {}) {
  S.report = report;
  S.checks = progress.checks || {};
  S.fixed = progress.fixed || {};
  S.drawer = null;
  S.dirty = !progress.fromFile;
  if (!S.session.some((x) => x.report === report)) S.session.unshift({ report, progress: { checks: S.checks, fixed: S.fixed } });
  S.session = S.session.slice(0, 8);
  const fk = frameworkKey(report);
  if (fk && fk !== 'other') { S.fw = fk; prefs.set('fw', fk); }
  rebuild();
}
function markDirty() { S.dirty = true; updateSaveState(); }
function rebuild() { S.pages = buildPages({ report: S.report, fw: S.fw, appType: S.appType }); renderSidebar(); updateSaveState(); }

const currentId = () => (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
const pageById = (id) => S.pages.find((p) => p.id === id);
const isBuildPage = (id) => !!S.report && BUILD_TABS.includes(id);
const guideId = () => (S.report?.platform === 'ios' ? 'appstore' : 'play');

// ---------------------------------------------------------------- sidebar
function navItem(id, label, ic, opts = {}) {
  const active = currentId() === id;
  return `<a class="nav-item ${active ? 'active' : ''} ${opts.cls || ''}" href="#/${id}" data-nav="${id}" ${opts.attrs || ''}>${typeof ic === 'string' && ic.length > 2 ? icon(ic) : `<span class="ni">${ic}</span>`}<span class="nt">${esc(label)}</span>${opts.badge ? `<span class="nb">${opts.badge}</span>` : ''}</a>`;
}

function renderSidebar() {
  const r = S.report;
  const cur = currentId();
  const starredPages = S.starred.map(pageById).filter(Boolean);
  const unfixed = r ? r.issues.filter((i) => i.severity !== 'info' && !S.fixed[i.id]).length : 0;
  const playbookIds = r ? [guideId(), r.platform === 'ios' ? 'play' : 'appstore', 'keys', 'compliance', 'roadmap'] : ['play', 'appstore', 'keys', 'compliance', 'roadmap'];
  $('#nav').innerHTML = `
    ${navItem('home', 'Home', 'home')}
    <button type="button" class="nav-item nav-group" data-expand="recent" aria-expanded="${S.expanded.recent}">${icon('clock')}<span class="nt">Recent</span><span class="chev">${icon(S.expanded.recent ? 'chevronDown' : 'chevron')}</span></button>
    ${S.expanded.recent ? `<div class="nav-sub">${S.session.length ? S.session.map((x, k) => `<button type="button" class="nav-item sub ${x.report === r ? 'current' : ''}" data-session="${k}">${icon(x.report.platform === 'ios' ? 'apple' : 'android')}<span class="nt">${esc(x.report.app.name || x.report.fileName)}</span><span class="nv">${esc(x.report.app.versionName || '')}</span></button>`).join('') : '<div class="nav-empty">Builds you analyze appear here (this tab only)</div>'}</div>` : ''}
    <button type="button" class="nav-item nav-group" data-expand="starred" aria-expanded="${S.expanded.starred}">${icon('star')}<span class="nt">Starred</span><span class="chev">${icon(S.expanded.starred ? 'chevronDown' : 'chevron')}</span></button>
    ${S.expanded.starred ? `<div class="nav-sub">${starredPages.length ? starredPages.map((p) => navItem(p.id, p.title, PAGE_ICON[p.id] || TAB_ICON[p.id] || 'doc', { cls: 'sub' })).join('') : '<div class="nav-empty">Star a page with ☆ to pin it here</div>'}</div>` : ''}

    ${r ? `
    <div class="nav-section">Current build</div>
    <div id="nav-build">
      <button type="button" class="nav-item nav-proj ${isBuildPage(cur) ? 'in' : ''}" data-expand="build" aria-expanded="${S.expanded.build}">
        <span class="proj-ico ${r.platform}">${icon(r.platform === 'ios' ? 'apple' : 'android')}</span>
        <span class="nt"><span class="proj-name">${esc(r.app.name || r.app.id || r.fileName)}</span><span class="proj-sub">${r.platform === 'ios' ? 'iOS' : 'Android'} · ${esc(r.framework.name)}</span></span>
        <span class="chev">${icon(S.expanded.build ? 'chevronDown' : 'chevron')}</span>
      </button>
      ${S.expanded.build ? `<div class="nav-sub tree">${BUILD_TABS.map((id) => navItem(id, TAB_LABEL[id], TAB_ICON[id], { cls: 'sub', badge: id === 'board' && unfixed ? unfixed : '' })).join('')}</div>` : ''}
    </div>` : ''}

    <div class="nav-section">Playbooks</div>
    <div id="nav-playbooks">
      ${playbookIds.map((id, k) => { const p = pageById(id); return p ? navItem(id, p.title, PAGE_ICON[id], { attrs: k === 0 ? 'id="nav-guide"' : '' }) : ''; }).join('')}
    </div>
    <div class="nav-section">Reference</div>
    ${navItem('policies', 'Store policy tracker', 'book')}`;
}

// ---------------------------------------------------------------- header + tabs
function pageHeader(page) {
  const r = S.report;
  const starred = S.starred.includes(page.id);
  const star = `<button type="button" class="icon-btn star ${starred ? 'on' : ''}" data-star="${page.id}" aria-pressed="${starred}" aria-label="${starred ? 'Unstar page' : 'Star page'}" title="${starred ? 'Unstar' : 'Star'}">${icon(starred ? 'starFill' : 'star')}</button>`;
  if (isBuildPage(page.id)) {
    return `
    <div class="page-head" id="page-head">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span class="sep">/</span><span>Builds</span><span class="sep">/</span><a href="#/overview">${esc(r.app.name || r.fileName)}</a></nav>
      <div class="title-row">
        <span class="proj-ico lg ${r.platform}">${icon(r.platform === 'ios' ? 'apple' : 'android')}</span>
        <h1 class="page-title">${esc(r.app.name || r.app.id || r.fileName)}</h1>
        ${star}
        <span class="title-meta"><span class="pill ${r.summary.ready ? 'green' : 'red'}">${r.summary.ready ? 'Ready' : 'Not ready'}</span><span class="pill gray">🫠 ${r.summary.delulu}% delulu</span><span class="pill gray">${esc(r.format.toUpperCase())} · ${esc(r.app.versionName)}</span></span>
      </div>
      <nav class="tabs" id="tabs" aria-label="Report views">${BUILD_TABS.map((id) => `<a class="tab ${id === page.id ? 'active' : ''}" href="#/${id}" ${id === page.id ? 'aria-current="page"' : ''}>${icon(TAB_ICON[id])}${TAB_LABEL[id]}</a>`).join('')}</nav>
    </div>`;
  }
  return `
    <div class="page-head" id="page-head">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span class="sep">/</span><span>${esc(page.section)}</span></nav>
      <div class="page-icon" aria-hidden="true">${esc(page.icon)}</div>
      <div class="title-row"><h1 class="page-title">${esc(page.title)}</h1>${star}</div>
      ${page.subtitle ? `<div class="page-sub">${inline(page.subtitle)}</div>` : ''}
    </div>`;
}

function saveBanner() {
  if (!S.report || prefs.get('bannerHidden', false)) return '';
  return `<div class="save-banner" role="note">${icon('download')}<div><strong>Nothing is saved on this site.</strong> Download the report to reopen it later — no need to upload your build again.</div><button type="button" class="btn sm primary" data-action="download-report">Download report</button><button type="button" class="icon-btn" data-action="hide-banner" aria-label="Dismiss">${icon('x')}</button></div>`;
}

// ---------------------------------------------------------------- router
function route() {
  const id = currentId();
  closeDrawer(true);
  if (id === 'home') renderHome();
  else {
    const page = pageById(id);
    if (!page) { location.hash = '#/'; return; }
    renderPage(page);
  }
  renderSidebar();
  if (matchMedia('(max-width: 860px)').matches) document.body.classList.remove('nav-open');
}

function animatePage() {
  const page = $('#page');
  page.classList.remove('enter');
  void page.offsetWidth;
  page.classList.add('enter');
  $('#scroller').scrollTop = 0;
}

function hydrate() { $$('[data-w]').forEach((el) => requestAnimationFrame(() => { el.style.width = `${el.dataset.w}%`; })); }

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

function renderPage(page, { keepScroll } = {}) {
  document.title = `${page.title} · Delulu`;
  const wide = page.custom === 'board';
  $('#page').classList.toggle('wide', wide);
  let body;
  if (page.custom === 'board') body = renderBoard(S.report, { fixed: S.fixed, filter: S.board, groupBy: S.board.groupBy });
  else {
    const todos = countTodos(page.blocks);
    body = `
      ${todos.total ? `<div class="progress-line" title="Checklist progress"><div class="pl-track"><div class="pl-fill" data-w="${Math.round((todos.done / todos.total) * 100)}"></div></div><span>${todos.done}/${todos.total} done</span></div>` : ''}
      <div class="page-actions">
        <button class="btn-ghost sm" type="button" data-action="toggle-all">${S.openAll ? 'Collapse all' : 'Expand all'}</button>
        <button class="btn-ghost sm" type="button" data-action="copy-md">Copy as Markdown</button>
      </div>
      <div class="blocks">${renderBlocks(page.blocks, { state: S.checks, appType: S.appType, fw: S.fw, openAll: S.openAll })}</div>`;
  }
  const scroll = $('#scroller').scrollTop;
  $('#page').innerHTML = `${pageHeader(page)}${isBuildPage(page.id) ? saveBanner() : ''}<div class="page-body">${body}</div>`;
  hydrate();
  if (keepScroll) $('#scroller').scrollTop = scroll; else animatePage();
}

// ---------------------------------------------------------------- home
function renderHome() {
  document.title = 'Delulu — is your app store-ready or are you just delulu?';
  $('#page').classList.remove('wide');
  const r = S.report;
  $('#page').innerHTML = `
    <div class="page-head" id="page-head">
      <nav class="crumbs" aria-label="Breadcrumb"><span>Home</span></nav>
      <div class="page-icon" aria-hidden="true">🫠</div>
      <h1 class="page-title">Is your app store-ready, or are you just <span class="grad">delulu</span>?</h1>
      <div class="page-sub">It's only delulu until it's approved. Drop an <strong>APK, AAB or IPA</strong> and Delulu runs the checks Google Play Console and App Store Connect run on upload, plus security checks. You get every fix and every step to go live.</div>
    </div>

    <ol class="howto" aria-label="How it works">
      <li><span class="hn">1</span><div><strong>Upload your build</strong><span>APK, AAB or IPA — stays on your device</span></div></li>
      <li><span class="hn">2</span><div><strong>Fix what the stores would reject</strong><span>Board of issues with exact fixes</span></div></li>
      <li><span class="hn">3</span><div><strong>Follow the release guide</strong><span>Account → review → live, step by step</span></div></li>
    </ol>

    <div class="drop" id="drop" tabindex="0" role="button" aria-label="Choose an APK, AAB or IPA file to analyze">
      <div class="drop-inner">
        <div class="drop-icon" aria-hidden="true">${icon('upload')}</div>
        <div class="drop-title">Drop your build here or <u>browse</u></div>
        <div class="drop-sub">${SUPPORTED} · Flutter · React Native · Expo · Kotlin · Swift · Unity · MAUI · Capacitor</div>
        <div class="drop-privacy">${icon('lock')} 100% in your browser — nothing is uploaded or stored</div>
      </div>
    </div>
    <div class="sample-row" id="sample-row">
      <span class="muted">No build handy?</span>
      <button class="btn" type="button" data-action="sample-apk">${icon('android')} Try a sample APK</button>
      <button class="btn" type="button" data-action="sample-ipa">${icon('apple')} Try a sample IPA</button>
      <button class="btn" type="button" data-action="open-report">${icon('doc')} Open a saved report</button>
      ${r ? `<a class="btn primary" href="#/overview">Back to ${esc(r.app.name || 'report')} →</a>` : ''}
    </div>

    <h2 class="b-h2">What it checks</h2>
    <div class="cards">
      ${[
        ['checks', 'Store upload checks', 'Target API 36, 16 KB pages, 64-bit, signing, AAB, debuggable · Xcode 26 SDK, ITMS-90683 / 91053 / 90809, profiles'],
        ['shield', 'Security (OWASP MASVS)', 'Hard-coded secrets, leaked keystores, cleartext traffic, exported components, ATS, obfuscation'],
        ['eye', 'Privacy & policy', 'Restricted permissions, Data safety / App Privacy drafts, privacy manifests, ATT, Sign in with Apple'],
        ['layers', 'Architecture', 'Framework & engine, SDK inventory, components, deep links, size breakdown'],
        ['key', 'Keys & secrets', 'Where every key belongs — and where it must never be — for your framework'],
        ['map', 'Step-by-step to live', 'Account → build → testing → review → rollout, with copy-paste commands'],
      ].map(([i, t, d]) => `<div class="card"><div class="card-i">${icon(i)}</div><div class="card-t">${t}</div><div class="card-d">${d}</div></div>`).join('')}
    </div>

    <h2 class="b-h2">Playbooks — no upload needed</h2>
    <div class="link-list">
      ${S.pages.filter((p) => !BUILD_TABS.includes(p.id) || !S.report).filter((p) => !BUILD_TABS.includes(p.id)).map((p) => `<a class="link-row" href="#/${p.id}">${icon(PAGE_ICON[p.id] || 'doc')}<span>${esc(p.title)}</span><span class="muted">${esc(p.subtitle || '')}</span></a>`).join('')}
    </div>

    <div class="b-callout tone-gray"><span class="b-callout-icon">📅</span><div>Rules last reviewed <strong>${LAST_REVIEWED}</strong>. Open source — <a href="${esc(REPO_URL)}" target="_blank" rel="noopener noreferrer">star or contribute on GitHub</a>. New here? <a href="#" data-action="tour">Take the 1-minute tour</a>.</div></div>`;
  const drop = $('#drop');
  drop.addEventListener('click', () => $('#file').click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
  animatePage();
}

// ---------------------------------------------------------------- drawer (issue detail)
function openDrawer(issueId) {
  S.drawer = issueId;
  const d = $('#drawer');
  d.innerHTML = renderDrawer(S.report, issueId, { fixed: S.fixed, fw: S.fw });
  d.hidden = false;
  $('#drawer-veil').hidden = false;
  requestAnimationFrame(() => { d.classList.add('open'); $('#drawer-veil').classList.add('show'); });
  d.focus();
}
function closeDrawer(instant) {
  const d = $('#drawer');
  if (d.hidden) return;
  S.drawer = null;
  d.classList.remove('open');
  $('#drawer-veil').classList.remove('show');
  const done = () => { d.hidden = true; $('#drawer-veil').hidden = true; };
  if (instant) done(); else setTimeout(done, 220);
}
function setFixed(id, val) {
  if (val) S.fixed[id] = true; else delete S.fixed[id];
  markDirty();
  const page = pageById(currentId());
  if (page?.custom === 'board') renderPage(page, { keepScroll: true });
  if (S.drawer === id) $('#drawer').innerHTML = renderDrawer(S.report, id, { fixed: S.fixed, fw: S.fw });
  renderSidebar();
  toast(val ? '✅ Marked as fixed' : '↩︎ Reopened');
}

// ---------------------------------------------------------------- analysis & files
async function runAnalysis(file) {
  const head = new TextDecoder().decode(await file.slice(0, 64).arrayBuffer()).trimStart();
  if (/\.json$/i.test(file.name) || head.startsWith('{')) return openReportFile(file);
  const modal = $('#progress');
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('show'));
  $('#progress-file').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
  const setP = (msg, frac) => {
    $('#progress-msg').textContent = msg;
    if (frac !== undefined) $('#progress-bar').style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
  };
  setP('Opening archive…', 0.02);
  try {
    const report = await analyze(file, { onProgress: setP });
    setReport(report);
    setP('Done', 1);
    setTimeout(() => { modal.classList.remove('show'); modal.hidden = true; }, 250);
    location.hash = '#/overview';
    toast(report.summary.ready ? `✨ ${report.summary.delulu}% delulu — ${report.summary.vibe}` : `🫠 ${report.summary.delulu}% delulu — ${report.summary.counts.blocker} blocker(s) found. Download the report to keep it`, 5000);
    if (!prefs.get('tour:report', false)) setTimeout(() => startTour('report'), 900);
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

function reportFileData() {
  return JSON.stringify({ format: 'delulu-report', schema: 1, savedAt: new Date().toISOString(), tool: { name: 'Delulu', version: VERSION }, progress: { fixed: S.fixed, checks: S.checks }, report: S.report });
}

async function openReportFile(file) {
  try {
    const data = JSON.parse(await file.text());
    const report = data.format === 'delulu-report' ? data.report : data;
    if (!report || !Array.isArray(report.checks) || !report.app || !['android', 'ios'].includes(report.platform)) throw new Error('This is not a Delulu report file.');
    report.issues = report.checks.filter((c) => c.status === 'fail' || c.status === 'warn').sort((a, b) => ['blocker', 'high', 'medium', 'low', 'info'].indexOf(a.severity) - ['blocker', 'high', 'medium', 'low', 'info'].indexOf(b.severity));
    report.summary = summarize(report);
    setReport(report, { ...(data.progress || {}), fromFile: true });
    location.hash = '#/overview';
    route();
    toast(`📂 Reopened ${report.app.name || report.fileName}${data.savedAt ? ` (saved ${new Date(data.savedAt).toLocaleDateString()})` : ''}`);
  } catch (e) {
    toast(`⚠️ ${e.message || 'Could not read the report file.'}`, 5000);
  }
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
const baseName = () => (S.report ? `${S.report.app.id || 'app'}-${S.report.app.versionName || ''}`.replace(/[^\w.-]+/g, '_') : 'delulu-playbooks');

function downloadReport() {
  if (!S.report) { toast('Analyze a build first'); return; }
  download(`${baseName()}.delulu.json`, reportFileData(), 'application/json');
  S.dirty = false;
  updateSaveState();
  toast('💾 Report downloaded — drop this file on Delulu any time to reopen it', 5000);
}

function exportZip() {
  const pages = S.pages;
  const files = pages.map((p, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${p.id}.md`, data: pageToMarkdown(p, S.checks) }));
  files.unshift({ name: 'README.md', data: `# Delulu docs pack\n\n${S.report ? `**${S.report.app.name}** \`${S.report.app.id}\` ${S.report.app.versionName} — score ${S.report.summary.score}/100 (${S.report.summary.verdict})\n\nReopen the full interactive report by dropping \`report.delulu.json\` on Delulu.\n\n` : ''}${pages.map((p, i) => `- [${p.icon} ${p.title}](${files[i].name})`).join('\n')}\n` });
  if (S.report) files.push({ name: 'report.delulu.json', data: reportFileData() });
  download(`${baseName()}-delulu-docs.zip`, buildZip(files), 'application/zip');
  if (S.report) { S.dirty = false; updateSaveState(); }
}
function exportMd() { download(`${baseName()}-delulu.md`, S.pages.map((p) => pageToMarkdown(p, S.checks)).join('\n\n'), 'text/markdown'); }

function printAll() {
  const ctx = { state: S.checks, appType: S.appType, fw: S.fw, openAll: true };
  $('#print-root').innerHTML = S.pages.map((p) => `<section class="print-page"><div class="page-icon">${esc(p.icon)}</div><h1 class="page-title">${esc(p.title)}</h1>${renderBlocks(p.blocks, ctx)}</section>`).join('');
  document.body.classList.add('printing-all');
  setTimeout(() => { window.print(); document.body.classList.remove('printing-all'); }, 50);
}

function badgeMarkdown() {
  const s = S.report.summary;
  const color = !s.ready ? 'red' : s.counts.high ? 'orange' : 'brightgreen';
  const store = S.report.platform === 'ios' ? 'App_Store' : 'Google_Play';
  return `[![Delulu ${store.replace('_', ' ')}](https://img.shields.io/badge/%F0%9F%AB%A0_Delulu_${store}-${s.delulu}%25_delulu-${color})](${SITE_URL})`;
}

function issueMarkdown(id) {
  const i = S.report.checks.find((c) => c.id === id);
  return blocksToMarkdown([{ type: 'issue', data: { ...i, title: `${issueKey(S.report, i)} ${i.title}`, fixSteps: fixFor(i.fix, S.fw, S.report) } }]);
}

async function copy(text, msg = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(`📋 ${msg}`); } catch { toast('Copy failed — your browser blocked clipboard access'); }
}

function updateSaveState() {
  const b = $('#btn-download');
  if (!b) return;
  b.hidden = !S.report;
  b.classList.toggle('pending', !!S.report && S.dirty);
  b.title = S.dirty ? 'You have changes that are not downloaded yet' : 'Report downloaded';
}

// ---------------------------------------------------------------- search palette
function openPalette() {
  const pal = $('#palette');
  pal.hidden = false;
  requestAnimationFrame(() => pal.classList.add('show'));
  const input = $('#palette-input');
  input.value = '';
  renderPalette('');
  input.focus();
}
function closePalette() { const pal = $('#palette'); pal.classList.remove('show'); pal.hidden = true; }
function renderPalette(q) {
  q = q.toLowerCase();
  const items = [];
  if (S.report && q.length > 1) {
    for (const i of S.report.issues) if (`${i.title} ${i.itms || ''} ${issueKey(S.report, i)}`.toLowerCase().includes(q)) items.push({ label: `${issueKey(S.report, i)} · ${i.title}`, hint: 'Issue', issue: i.id });
  }
  for (const p of S.pages) {
    if (!q || p.title.toLowerCase().includes(q)) items.push({ label: `${p.icon} ${p.title}`, hint: p.section, href: `#/${p.id}` });
    const walk = (bs) => bs.forEach((b) => {
      const t = b.title || b.text || b.data?.title;
      if (q.length > 1 && typeof t === 'string' && t.toLowerCase().includes(q) && items.length < 40) items.push({ label: t.replace(/\*\*|`|\\/g, '').slice(0, 90), hint: p.title, href: `#/${p.id}` });
      if (b.children) walk(b.children);
    });
    walk(p.blocks);
  }
  $('#palette-list').innerHTML = items.slice(0, 40).map((it, i) => it.issue
    ? `<a class="pal-item ${i ? '' : 'sel'}" href="#/board" data-open-issue="${esc(it.issue)}"><span>${esc(it.label)}</span><span class="muted">${esc(it.hint)}</span></a>`
    : `<a class="pal-item ${i ? '' : 'sel'}" href="${it.href}"><span>${esc(it.label)}</span><span class="muted">${esc(it.hint)}</span></a>`).join('') || '<div class="pal-empty">No results</div>';
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

// ---------------------------------------------------------------- tour
const tour = new Tour({
  navigate: (id) => new Promise((res) => {
    if (currentId() === id) return res();
    location.hash = `#/${id}`;
    setTimeout(res, 120);
  }),
  openNav: () => document.body.classList.add('nav-open'),
  closeNav: () => document.body.classList.remove('nav-open'),
});
tour.onEnd = (name) => { prefs.set(`tour:${name}`, true); };
function startTour(name) {
  if (name === 'report' && !S.report) name = 'home';
  if (name === 'home' && currentId() !== 'home') { location.hash = '#/'; setTimeout(() => tour.start('home'), 150); return; }
  tour.start(name);
}

// ---------------------------------------------------------------- events
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action],[data-copy],[data-tabs],[data-apptype],[data-fw],[data-nav],[data-expand],[data-session],[data-star],[data-issue],[data-toggle-fixed],[data-bfilter],[data-groupby],[data-open-issue],.pal-item');
  if (!t) {
    if (!e.target.closest('.menu')) $$('.menu.open').forEach((m) => m.classList.remove('open'));
    return;
  }
  if (t.dataset.openIssue) { closePalette(); location.hash = '#/board'; setTimeout(() => openDrawer(t.dataset.openIssue), 150); e.preventDefault(); return; }
  if (t.matches('.pal-item')) { closePalette(); return; }
  if (t.dataset.nav) { if (matchMedia('(max-width: 860px)').matches) document.body.classList.remove('nav-open'); return; }
  if (t.dataset.expand) { S.expanded[t.dataset.expand] = !S.expanded[t.dataset.expand]; renderSidebar(); return; }
  if (t.dataset.session) {
    const x = S.session[Number(t.dataset.session)];
    if (x) { S.report = x.report; S.checks = x.progress.checks; S.fixed = x.progress.fixed; rebuild(); location.hash = '#/overview'; route(); }
    return;
  }
  if (t.dataset.star) {
    const id = t.dataset.star;
    S.starred = S.starred.includes(id) ? S.starred.filter((x) => x !== id) : [...S.starred, id];
    prefs.set('starred', S.starred);
    renderPage(pageById(id), { keepScroll: true });
    renderSidebar();
    toast(S.starred.includes(id) ? '⭐ Starred — find it in the sidebar' : 'Removed from Starred');
    return;
  }
  if (t.dataset.issue) { openDrawer(t.dataset.issue); return; }
  if (t.dataset.toggleFixed) { setFixed(t.dataset.toggleFixed, !S.fixed[t.dataset.toggleFixed]); return; }
  if (t.dataset.bfilter) { S.board.cat = t.dataset.bfilter; renderPage(pageById('board'), { keepScroll: true }); return; }
  if (t.dataset.groupby) { S.board.groupBy = t.dataset.groupby; renderPage(pageById('board'), { keepScroll: true }); return; }
  if (t.dataset.copy) { copy($(`#${t.dataset.copy}`).innerText, 'Code copied'); return; }
  if (t.dataset.tabs) {
    const g = t.dataset.tabs;
    $$(`[data-tabs="${g}"]`).forEach((b) => b.classList.toggle('active', b === t));
    $$(`[data-panel="${g}"]`).forEach((p) => p.classList.toggle('hidden', p.dataset.idx !== t.dataset.idx));
    return;
  }
  if (t.dataset.apptype) { S.appType = t.dataset.apptype; prefs.set('appType', S.appType); rebuild(); route(); return; }
  if (t.dataset.fw) { S.fw = t.dataset.fw; prefs.set('fw', S.fw); rebuild(); route(); return; }
  const a = t.dataset.action;
  if (a === 'theme') applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  else if (a === 'new') $('#file').click();
  else if (a === 'open-report') $('#file').click();
  else if (a === 'sample-apk') runAnalysis(sampleFile('apk'));
  else if (a === 'sample-ipa') runAnalysis(sampleFile('ipa'));
  else if (a === 'search') openPalette();
  else if (a === 'collapse') document.body.classList.toggle(matchMedia('(max-width: 860px)').matches ? 'nav-open' : 'nav-collapsed');
  else if (a === 'menu') t.closest('.menu').classList.toggle('open');
  else if (a === 'download-report') downloadReport();
  else if (a === 'hide-banner') { prefs.set('bannerHidden', true); $('.save-banner')?.remove(); }
  else if (a === 'export-zip') exportZip();
  else if (a === 'export-md') exportMd();
  else if (a === 'export-json') downloadReport();
  else if (a === 'print') printAll();
  else if (a === 'tour') { e.preventDefault(); startTour(S.report && currentId() !== 'home' ? 'report' : 'home'); }
  else if (a === 'tour-home') startTour('home');
  else if (a === 'close-drawer') closeDrawer();
  else if (a === 'copy-issue') copy(issueMarkdown(t.dataset.issueId), 'Issue copied as Markdown');
  else if (a === 'toggle-all') { S.openAll = !S.openAll; route(); }
  else if (a === 'copy-md') { const p = pageById(currentId()); if (p) copy(pageToMarkdown(p, S.checks), 'Page copied as Markdown'); }
  else if (a === 'copy-badge') { if (S.report) copy(badgeMarkdown(), 'README badge copied'); else toast('Analyze a build first'); }
  else if (a === 'copy-summary') {
    if (!S.report) { copy(`it's only delulu until it's approved 🫠 Delulu checks your APK/AAB/IPA against Google Play & App Store rules before you submit. Free, open source, runs in your browser: ${SITE_URL}`, 'Link copied'); return; }
    const s = S.report.summary;
    copy(s.ready ? `my ${S.report.platform === 'ios' ? 'iOS' : 'Android'} build is ${s.delulu}% delulu — ${s.vibe}. store-ready fr ✨ check yours: ${SITE_URL}` : `my ${S.report.platform === 'ios' ? 'iOS' : 'Android'} build was ${s.delulu}% delulu 💀 Delulu caught ${s.counts.blocker} store blockers before ${S.report.platform === 'ios' ? 'Apple' : 'Google'} did. check yours (free, in-browser): ${SITE_URL}`, 'Summary copied');
  }
  if (t.closest('.menu-pop')) t.closest('.menu').classList.remove('open');
});

document.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-todo]');
  if (cb) {
    S.checks[cb.dataset.todo] = cb.checked;
    markDirty();
    cb.closest('.b-todo').classList.toggle('done', cb.checked);
    const page = pageById(currentId());
    if (page) {
      const c = countTodos(page.blocks);
      const fill = $('.progress-line .pl-fill');
      if (fill) { fill.style.width = `${Math.round((c.done / c.total) * 100)}%`; fill.parentElement.nextElementSibling.textContent = `${c.done}/${c.total} done`; }
    }
  }
  if (e.target.id === 'file' && e.target.files[0]) { runAnalysis(e.target.files[0]); e.target.value = ''; }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'board-q') {
    S.board.q = e.target.value;
    const pos = e.target.selectionStart;
    renderPage(pageById('board'), { keepScroll: true });
    const inp = $('#board-q');
    inp.focus();
    inp.setSelectionRange(pos, pos);
  }
});

// Drag cards between columns (Done = fixed).
document.addEventListener('dragstart', (e) => {
  const c = e.target.closest?.('.card-issue');
  if (!c) return;
  e.dataTransfer.setData('text/x-issue', c.dataset.issue);
  e.dataTransfer.effectAllowed = 'move';
  c.classList.add('dragging-card');
});
document.addEventListener('dragend', (e) => { e.target.closest?.('.card-issue')?.classList.remove('dragging-card'); $$('.col.drop-ok').forEach((c) => c.classList.remove('drop-ok')); });
document.addEventListener('dragover', (e) => {
  const col = e.target.closest?.('.col');
  if (col && [...e.dataTransfer.types].includes('text/x-issue')) { e.preventDefault(); $$('.col.drop-ok').forEach((c) => c !== col && c.classList.remove('drop-ok')); col.classList.add('drop-ok'); }
});
document.addEventListener('drop', (e) => {
  const col = e.target.closest?.('.col');
  const id = e.dataTransfer?.getData('text/x-issue');
  if (col && id) { e.preventDefault(); e.stopPropagation(); setFixed(id, col.dataset.col === 'done'); }
}, true);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && S.report) { e.preventDefault(); downloadReport(); }
  if (e.key === 'Escape') { closePalette(); closeDrawer(); $$('.menu.open').forEach((m) => m.classList.remove('open')); document.body.classList.remove('nav-open'); }
  if (e.key === '?' && !/input|textarea/i.test(document.activeElement?.tagName || '') && !document.body.classList.contains('touring')) startTour(S.report && currentId() !== 'home' ? 'report' : 'home');
  if (!$('#palette').hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
    const items = $$('.pal-item');
    let i = items.findIndex((x) => x.classList.contains('sel'));
    if (e.key === 'Enter') { items[i]?.click(); if (items[i] && !items[i].dataset.openIssue) location.hash = items[i].getAttribute('href'); closePalette(); e.preventDefault(); return; }
    e.preventDefault();
    i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((x, j) => x.classList.toggle('sel', j === i));
    items[i]?.scrollIntoView({ block: 'nearest' });
  }
});
$('#palette-input').addEventListener('input', (e) => renderPalette(e.target.value));
$('#palette').addEventListener('click', (e) => { if (e.target.id === 'palette') closePalette(); });
$('#drawer-veil').addEventListener('click', () => closeDrawer());

// Drop files anywhere (build or saved report).
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e)) { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const f = e.dataTransfer.files[0];
  if (f) runAnalysis(f);
});

// Warn before closing when the latest changes have not been downloaded.
window.addEventListener('beforeunload', (e) => {
  if (S.report && S.dirty) { e.preventDefault(); e.returnValue = ''; }
});

window.addEventListener('hashchange', route);

// ---------------------------------------------------------------- boot
$('#btn-theme').dataset.action = 'theme';
applyTheme(prefs.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#version').textContent = `v${VERSION}`;
$$('[data-repo]').forEach((a) => { a.href = REPO_URL; });
$$('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
rebuild();
route();
if (!prefs.get('tour:home', false) && currentId() === 'home') setTimeout(() => startTour('home'), 700);

// Debug / e2e hooks.
window.Delulu = { analyzeFile: runAnalysis, sampleFile, startTour, get report() { return S.report; }, FRAMEWORKS };
