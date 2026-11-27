#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Delulu CLI — run the same checks as the website in CI.
//   node cli/delulu.mjs app-release.aab [--out report-dir] [--json] [--fail-on blocker|high|medium|none]

import { openAsBlob, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyze } from '../src/analyzers/index.js';
import { buildPages } from '../src/report/pages.js';
import { pageToMarkdown } from '../src/report/markdown.js';
import { frameworkKey } from '../src/report/frameworks.js';
import { SEVERITY_ORDER } from '../src/analyzers/common.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const file = args.find((a, i) => !a.startsWith('--') && !['--out', '--fail-on', '--app-type'].includes(args[i - 1]));

if (!file || flag('help')) {
  console.log(`Delulu 🫠 — it's only delulu until it's approved
Google Play & App Store pre-submission checks

Usage: delulu <app.apk|app.aab|app.ipa> [options]

Options:
  --out <dir>          Write Markdown docs pack + report.json to <dir>
  --json               Print the JSON report to stdout
  --fail-on <level>    Exit 1 if an issue at or above this severity exists (default: blocker; "none" to never fail)
  --app-type <type>    general | kids | health | finance | games | social | dating | vpn | crypto | news | education | webview | enterprise
`);
  process.exit(file ? 0 : 2);
}

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const SEV = { blocker: (s) => c('41;97', ` ${s} `), high: (s) => c('31', s), medium: (s) => c('33', s), low: (s) => c('90', s), info: (s) => c('36', s) };

if (!existsSync(file)) {
  console.error(c('31', `✖ File not found: "${file}". Check the path to your .apk, .aab or .ipa and make sure it is built before this step.`));
  process.exit(2);
}
let blob;
try {
  blob = await openAsBlob(file);
} catch (e) {
  console.error(c('31', `✖ Cannot read "${file}": ${e.message}`));
  process.exit(2);
}
const named = Object.assign(blob, { name: basename(file) });
let report;
try {
  report = await analyze(named, { onProgress: (m) => { if (process.stderr.isTTY) process.stderr.write(`\r\x1b[K${m.slice(0, 80)}`); } });
  if (process.stderr.isTTY) process.stderr.write('\r\x1b[K');
} catch (e) {
  console.error(c('31', `✖ ${e.message}`));
  process.exit(2);
}

if (flag('json')) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  const s = report.summary;
  console.log(`\n${c('1', 'Delulu')} · ${report.app.name || ''} ${c('2', report.app.id)} ${report.app.versionName} (${report.app.versionCode})`);
  console.log(`${report.platform === 'ios' ? 'iOS' : 'Android'} ${report.format.toUpperCase()} · ${report.framework.name} · ${c('1', `${s.delulu}% delulu`)} (${s.vibe}) — ${s.ready ? c('32', s.verdict) : c('31', s.verdict)}\n`);
  for (const sev of SEVERITY_ORDER) {
    for (const i of report.issues.filter((x) => x.severity === sev)) {
      console.log(`${SEV[sev](sev.toUpperCase().padEnd(7))} ${i.title}${i.itms ? c('2', ` [${i.itms}]`) : ''}`);
      for (const e of i.evidence.slice(0, 5)) console.log(c('2', `         · ${e}`));
    }
  }
  console.log(`\n${s.passed}/${s.applicable} checks passed · ${s.counts.blocker} blocker · ${s.counts.high} high · ${s.counts.medium} medium · ${s.counts.low} low`);
}

const out = opt('out');
if (out) {
  await mkdir(out, { recursive: true });
  const pages = buildPages({ report, fw: frameworkKey(report), appType: opt('app-type', 'general') });
  await Promise.all(pages.map((p, i) => writeFile(join(out, `${String(i + 1).padStart(2, '0')}-${p.id}.md`), pageToMarkdown(p, {}))));
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.error(c('2', `Docs written to ${out}/`));
}

const failOn = opt('fail-on', 'blocker');
if (failOn !== 'none') {
  const idx = SEVERITY_ORDER.indexOf(failOn);
  if (idx < 0) { console.error(`Unknown --fail-on ${failOn}`); process.exit(2); }
  if (report.issues.some((i) => SEVERITY_ORDER.indexOf(i.severity) <= idx)) process.exit(1);
}
