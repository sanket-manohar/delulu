// SPDX-License-Identifier: MIT
// Guided walkthrough: numbered spotlight steps with Back / Next / Skip, keyboard support,
// automatic scrolling, and steps that can navigate to another view first.

import { esc } from './render.js';

export const TOURS = {
  home: [
    { sel: '#global-search', title: 'Search anything', text: 'Find any page, store check or release step. Shortcut: Ctrl K (⌘K on Mac).' },
    { sel: '#btn-new', title: 'Start a new analysis', text: 'Pick an APK, AAB or IPA from your computer. Analysis runs in your browser — the file is never uploaded.' },
    { sel: '#drop', title: '…or drop the file here', text: 'Drag your build onto this box (or anywhere on the page).' },
    { sel: '#sample-row', title: 'No build yet? Try a sample', text: 'Load a sample Android or iOS app to explore a complete report with real-looking issues.' },
    { sel: '#nav-playbooks', title: 'Playbooks — no upload needed', text: 'Step-by-step store guides, where to keep your keys, and compliance by app type.', mobileNav: true },
    { sel: '#btn-help', title: 'Replay this tour any time', text: 'Click Help → Take the tour. That\'s it — let\'s ship your app!' },
  ],
  report: [
    { route: 'overview', sel: '#page-head', title: 'Your build report', text: 'App name, platform and the breadcrumb back to Home. Star (☆) a page to pin it in the sidebar.' },
    { route: 'overview', sel: '#tabs', title: 'Switch views with tabs', text: 'Summary, Board, Issues, Store checks, Security, Architecture and Privacy — all generated from your build.' },
    { route: 'overview', sel: '#next-step', title: 'Always know what to do next', text: 'This card tells you the single next action — and links straight to it.' },
    { route: 'board', sel: '#board', title: 'The Board', text: 'Every problem is a card. Left column = blockers the store will reject. Work left to right.' },
    { route: 'board', sel: '.card-issue', title: 'Open a card', text: 'See the evidence found in your build and the exact fix for your framework. Mark it fixed, or drag it to Done.' },
    { route: 'board', sel: '#board-toolbar', title: 'Filter & group', text: 'Search, show only Store, Security or Privacy issues, or group the columns by category.' },
    { sel: '#nav-build', title: 'Everything about this build', text: 'The same views live here in the sidebar, plus your Recent builds and Starred pages.', mobileNav: true },
    { sel: '#nav-guide', title: 'Then follow the release guide', text: 'When the board is clear, the store guide walks you from account setup to staged rollout.', mobileNav: true },
    { sel: '#btn-export', title: 'Share with your team', text: 'Export a docs pack (Markdown), a PDF, the raw JSON — or copy a README badge with your score.' },
  ],
};

export class Tour {
  constructor({ navigate, openNav, closeNav }) {
    this.navigate = navigate;
    this.openNav = openNav;
    this.closeNav = closeNav;
    this.steps = [];
    this.i = 0;
    this.root = null;
    this.onKey = this.onKey.bind(this);
    this.place = this.place.bind(this);
  }

  start(name) {
    const isMobile = matchMedia('(max-width: 860px)').matches;
    this.steps = (TOURS[name] || []).filter((s) => !(s.mobileNav && isMobile && !this.openNav));
    if (!this.steps.length) return;
    this.name = name;
    this.i = 0;
    this.build();
    this.show();
  }

  build() {
    this.end(true);
    this.root = document.createElement('div');
    this.root.className = 'tour';
    this.root.innerHTML = `<div class="tour-spot" aria-hidden="true"></div>
      <div class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text" tabindex="-1">
        <div class="tour-num" aria-hidden="true"></div>
        <div class="tour-title" id="tour-title"></div>
        <div class="tour-text" id="tour-text"></div>
        <div class="tour-foot">
          <div class="tour-dots" aria-hidden="true"></div>
          <button type="button" class="btn-ghost sm" data-tour="skip">Skip tour</button>
          <button type="button" class="btn" data-tour="back">Back</button>
          <button type="button" class="btn primary" data-tour="next">Next</button>
        </div>
      </div>`;
    document.body.append(this.root);
    this.root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-tour]')?.dataset.tour;
      if (a === 'next') this.go(1);
      else if (a === 'back') this.go(-1);
      else if (a === 'skip') this.end();
      else if (e.target === this.root) this.end();
    });
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.place);
    document.body.classList.add('touring');
  }

  onKey(e) {
    if (!this.root) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); this.go(-1); }
  }

  go(d) {
    const n = this.i + d;
    if (n < 0) return;
    if (n >= this.steps.length) { this.end(); return; }
    this.i = n;
    this.show();
  }

  async show() {
    const s = this.steps[this.i];
    if (s.route && this.navigate) await this.navigate(s.route);
    const mobile = matchMedia('(max-width: 860px)').matches;
    if (mobile && s.mobileNav) this.openNav?.(); else if (mobile) this.closeNav?.();
    await new Promise((r) => setTimeout(r, 60));
    this.target = document.querySelector(s.sel);
    if (!this.target || !this.target.getClientRects().length) {
      // Skip steps whose element is not on screen (e.g. empty board).
      if (this.i < this.steps.length - 1) { this.i++; return this.show(); }
      this.end();
      return;
    }
    this.target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const pop = this.root.querySelector('.tour-pop');
    pop.querySelector('.tour-num').textContent = this.i + 1;
    pop.querySelector('.tour-title').textContent = s.title;
    pop.querySelector('.tour-text').textContent = s.text;
    pop.querySelector('.tour-dots').innerHTML = this.steps.map((_, k) => `<span class="${k === this.i ? 'on' : k < this.i ? 'past' : ''}"></span>`).join('');
    pop.querySelector('[data-tour="back"]').disabled = this.i === 0;
    pop.querySelector('[data-tour="next"]').textContent = this.i === this.steps.length - 1 ? 'Finish' : `Next (${this.i + 1}/${this.steps.length})`;
    pop.classList.remove('in');
    setTimeout(() => { this.place(); pop.classList.add('in'); pop.focus({ preventScroll: true }); }, 280);
  }

  place() {
    if (!this.root || !this.target) return;
    const r = this.target.getBoundingClientRect();
    const pad = 6;
    const spot = this.root.querySelector('.tour-spot');
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const pop = this.root.querySelector('.tour-pop');
    const pw = Math.min(340, window.innerWidth - 24);
    pop.style.width = `${pw}px`;
    const ph = pop.offsetHeight || 180;
    let top = r.bottom + 14;
    let placement = 'below';
    if (top + ph > window.innerHeight - 12) { top = r.top - ph - 14; placement = 'above'; }
    if (top < 12) { top = Math.min(window.innerHeight - ph - 12, Math.max(12, r.top + 12)); placement = 'inside'; }
    let left = r.left + Math.min(r.width / 2, 120) - 24;
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
    Object.assign(pop.style, { top: `${top}px`, left: `${left}px` });
    pop.dataset.placement = placement;
  }

  end(silent) {
    if (!this.root) return;
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.place);
    this.root.remove();
    this.root = null;
    document.body.classList.remove('touring');
    if (!silent) { this.closeNav?.(); this.onEnd?.(this.name); }
  }
}

export const tourIntro = (name) => esc(name);
