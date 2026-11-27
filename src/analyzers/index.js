// SPDX-License-Identifier: MIT
import { openZip } from '../core/zip.js';
import { analyzeAndroid } from './android.js';
import { analyzeIos } from './ios.js';
import { SEVERITY_ORDER } from './common.js';

export const SUPPORTED = '.apk, .aab, .ipa';

/**
 * Analyze an app package.
 * @param {Blob & {name?: string}} file
 * @param {{onProgress?: (msg: string, frac?: number) => void}} [opts]
 */
export async function analyze(file, opts = {}) {
  const name = file.name || 'app';
  const zip = await openZip(file);
  const isIos = zip.entries.some((e) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(e.name));
  const isAndroid = zip.has('AndroidManifest.xml') || zip.has('base/manifest/AndroidManifest.xml');
  let report;
  if (isIos) report = await analyzeIos(zip, { name, size: file.size }, opts);
  else if (isAndroid) report = await analyzeAndroid(zip, { name, size: file.size }, opts);
  else if (zip.entries.some((e) => /\.xcarchive\//.test(e.name) || /^[^/]+\.app\/Info\.plist$/.test(e.name))) {
    throw new Error('This is a zipped .app/.xcarchive. Export an .ipa from Xcode (Organizer → Distribute App) and upload that.');
  } else throw new Error(`Unrecognised package. Upload one of: ${SUPPORTED}. (Split APKs / .apks / .xapk: extract and upload base.apk.)`);
  report.summary = summarize(report);
  report.analyzedAt = new Date().toISOString();
  report.tool = { name: 'StoreReady', version: '1.0.0' };
  return report;
}

export function summarize(report) {
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0]));
  for (const i of report.issues) counts[i.severity] = (counts[i.severity] || 0) + 1;
  const passed = report.checks.filter((c) => c.status === 'pass').length;
  const applicable = report.checks.filter((c) => c.status !== 'na' && c.status !== 'info').length;
  // Score: start at 100, weighted deductions, floor 0. Any blocker caps at 49.
  let score = 100 - counts.blocker * 18 - counts.high * 8 - counts.medium * 3 - counts.low * 1;
  if (counts.blocker) score = Math.min(score, 49);
  score = Math.max(0, Math.round(score));
  const verdict = counts.blocker ? 'Not ready — fix blockers before submitting' : counts.high ? 'Almost ready — fix high-risk items' : 'Ready for submission';
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  return { counts, passed, applicable, score, grade, verdict, ready: !counts.blocker };
}
