// SPDX-License-Identifier: MIT
// Shared helpers for analyzers: the report builder, sensitive-file rules, certificate parsing.

export const SEVERITY_ORDER = ['blocker', 'high', 'medium', 'low', 'info'];
export const SEVERITY_LABEL = { blocker: 'Blocker', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };

export class ReportBuilder {
  constructor(platform) {
    this.platform = platform;
    this.checks = [];
  }

  /**
   * Record a check. status: pass | fail | warn | info | na
   * A failing/warning check becomes an issue with its severity.
   */
  check(c) {
    const rec = {
      id: c.id,
      group: c.group || 'General',
      title: c.title,
      status: c.status,
      severity: c.status === 'pass' || c.status === 'na' ? null : c.severity || (c.status === 'info' ? 'info' : 'medium'),
      detail: c.detail || '',
      evidence: c.evidence || [],
      fix: c.fix || null,
      refs: c.refs || [],
      masvs: c.masvs || null,
      itms: c.itms || null,
      category: c.category || 'store',
    };
    this.checks.push(rec);
    return rec;
  }

  status(id) { return this.checks.find((c) => c.id === id)?.status || 'na'; }

  issues() {
    return this.checks
      .filter((c) => c.status === 'fail' || c.status === 'warn')
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  }
}

/** Files that should never ship inside an app package. */
export const SENSITIVE_FILE_RULES = [
  { re: /\.(jks|keystore|bks)$/i, sev: 'blocker', what: 'Java keystore (signing/upload key)' },
  { re: /\.(p12|pfx|mobileprovision\.bak|cer\.key)$/i, sev: 'blocker', what: 'Certificate / private key bundle' },
  { re: /(^|\/)[^/]*\.(pem|key|p8)$/i, sev: 'high', what: 'PEM / private key file (App Store Connect .p8 keys must never ship)' },
  { re: /(^|\/)\.env(\.[a-z]+)?$/i, sev: 'high', what: '.env file with environment secrets' },
  { re: /(^|\/)(service[-_]?account|credentials|client_secret)[^/]*\.json$/i, sev: 'blocker', what: 'Service-account / OAuth client secret JSON' },
  { re: /(^|\/)(key\.properties|keystore\.properties|local\.properties|gradle\.properties)$/i, sev: 'high', what: 'Gradle signing/config properties file' },
  { re: /(^|\/)\.git\//, sev: 'high', what: 'Git metadata (source history)' },
  { re: /(^|\/)\.(npmrc|netrc|pypirc)$/i, sev: 'high', what: 'Package registry credentials file' },
  { re: /\.(map)$/i, sev: 'medium', what: 'Source map (exposes original JS/TS source)' },
  { re: /(^|\/)(ExportOptions|exportOptions)\.plist$/, sev: 'low', what: 'Xcode export options file' },
  { re: /\.(sqlite|db|realm)$/i, sev: 'low', what: 'Pre-bundled database (check it holds no personal or test data)' },
  { re: /(^|\/)(GoogleService-Info\.plist|google-services\.json)$/, sev: 'info', what: 'Firebase config (client identifiers — fine to ship, but lock down Security Rules and API key restrictions)' },
];

export function findSensitiveFiles(names) {
  const out = [];
  for (const n of names) {
    for (const r of SENSITIVE_FILE_RULES) {
      if (r.re.test(n)) { out.push({ path: n, severity: r.sev, what: r.what }); break; }
    }
  }
  return out;
}

const latin1 = new TextDecoder('latin1');

/** Extract certificate CNs (OID 2.5.4.3) from DER bytes. */
export function extractCNs(bytes) {
  const out = [];
  for (let i = 0; i + 7 < bytes.length; i++) {
    if (bytes[i] === 0x06 && bytes[i + 1] === 0x03 && bytes[i + 2] === 0x55 && bytes[i + 3] === 0x04 && bytes[i + 4] === 0x03) {
      const tag = bytes[i + 5], len = bytes[i + 6];
      if ([0x0c, 0x13, 0x14, 0x16, 0x1e].includes(tag) && len < 128) out.push(latin1.decode(bytes.subarray(i + 7, i + 7 + len)));
    }
  }
  return [...new Set(out)];
}

export function bytesHas(bytes, str) { return latin1.decode(bytes).includes(str); }

export function categorize(name, platform) {
  const n = name.toLowerCase();
  if (platform === 'android') {
    if (/(^|\/)classes\d*\.dex$/.test(n) || /\/dex\//.test(n)) return 'Code (DEX)';
    if (/(^|\/)lib\/[^/]+\/[^/]+\.so$/.test(n)) return 'Native libraries';
    if (/flutter_assets\//.test(n)) return 'Flutter assets';
    if (/index\.android\.bundle/.test(n)) return 'JS bundle';
    if (/(^|\/)assets\//.test(n)) return 'Assets';
    if (/(^|\/)res\//.test(n) || /resources\.(arsc|pb)$/.test(n)) return 'Resources';
    if (/meta-inf\//.test(n)) return 'Signing & metadata';
    return 'Other';
  }
  if (/\.framework\//.test(n) || /\.dylib$/.test(n)) return 'Frameworks';
  if (/\.appex\//.test(n)) return 'App extensions';
  if (/flutter_assets\//.test(n)) return 'Flutter assets';
  if (/main\.jsbundle/.test(n)) return 'JS bundle';
  if (/assets\.car$/.test(n) || /\.(png|jpg|jpeg|gif|webp|pdf|svg)$/.test(n)) return 'Images & asset catalog';
  if (/\.(storyboardc|nib)\//.test(n) || /\.(storyboardc|nib)$/.test(n)) return 'Interface (storyboards/nibs)';
  if (/\.lproj\//.test(n)) return 'Localizations';
  if (/_codesignature\/|embedded\.mobileprovision/.test(n)) return 'Signing & metadata';
  return 'Other';
}

export function sizeBreakdown(entries, platform, nameOf = (e) => e.name) {
  const map = new Map();
  for (const e of entries) {
    if (e.isDirectory) continue;
    const c = categorize(nameOf(e), platform);
    const r = map.get(c) || { category: c, bytes: 0, compressed: 0, files: 0 };
    r.bytes += e.size; r.compressed += e.compressedSize; r.files++;
    map.set(c, r);
  }
  return [...map.values()].sort((a, b) => b.bytes - a.bytes);
}

export function largestFiles(entries, n = 12) {
  return entries.filter((e) => !e.isDirectory).sort((a, b) => b.size - a.size).slice(0, n).map((e) => ({ name: e.name, size: e.size }));
}

export const REF = {
  playTarget: { label: 'Play target API requirement', url: 'https://support.google.com/googleplay/android-developer/answer/11926878' },
  page16k: { label: 'Support 16 KB page sizes', url: 'https://developer.android.com/guide/practices/page-sizes' },
  aab: { label: 'Android App Bundle', url: 'https://developer.android.com/guide/app-bundle' },
  appSigning: { label: 'Play App Signing', url: 'https://support.google.com/googleplay/android-developer/answer/9842756' },
  dataSafety: { label: 'Data safety section', url: 'https://support.google.com/googleplay/android-developer/answer/10787469' },
  permissions: { label: 'Play permissions & APIs policy', url: 'https://support.google.com/googleplay/android-developer/answer/9888170' },
  exported: { label: 'android:exported (Android 12+)', url: 'https://developer.android.com/about/versions/12/behavior-changes-12#exported' },
  cleartext: { label: 'Network security configuration', url: 'https://developer.android.com/privacy-and-security/security-config' },
  backup: { label: 'Back up user data', url: 'https://developer.android.com/identity/data/autobackup' },
  r8: { label: 'Shrink, obfuscate, optimize (R8)', url: 'https://developer.android.com/build/shrink-code' },
  sixtyFour: { label: '64-bit requirement', url: 'https://developer.android.com/google/play/requirements/64-bit' },
  devVerify: { label: 'Android developer verification', url: 'https://developer.android.com/developer-verification' },
  masvs: { label: 'OWASP MASVS', url: 'https://mas.owasp.org/MASVS/' },
  appleSdk: { label: 'Apple upcoming requirements', url: 'https://developer.apple.com/news/upcoming-requirements/' },
  privacyManifest: { label: 'Privacy manifest files', url: 'https://developer.apple.com/documentation/bundleresources/privacy-manifest-files' },
  requiredReason: { label: 'Required-reason APIs', url: 'https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api' },
  thirdPartySdks: { label: 'Third-party SDK requirements', url: 'https://developer.apple.com/support/third-party-SDK-requirements/' },
  ats: { label: 'App Transport Security', url: 'https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity' },
  purposeStrings: { label: 'Requesting access to protected resources', url: 'https://developer.apple.com/documentation/uikit/requesting-access-to-protected-resources' },
  reviewGuidelines: { label: 'App Review Guidelines', url: 'https://developer.apple.com/app-store/review/guidelines/' },
  att: { label: 'App Tracking Transparency', url: 'https://developer.apple.com/documentation/apptrackingtransparency' },
  exportCompliance: { label: 'Export compliance', url: 'https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations' },
  launchScreen: { label: 'Launch screen', url: 'https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen' },
};
