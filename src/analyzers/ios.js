// SPDX-License-Identifier: MIT
// iOS (.ipa) analyzer. Mirrors App Store Connect upload validation (ITMS-9xxxx) and App Review
// requirements, plus OWASP MASVS-oriented security checks.

import { parsePlist, parseMobileProvision } from '../core/plist.js';
import { machoSlices, inspectMacho, compareVersions } from '../core/binary.js';
import { ContentScanner } from '../core/scanner.js';
import { POLICY } from '../rules/policy.js';
import { SDKS, IOS_PURPOSE_KEYS, REQUIRED_REASON_APIS, APPLE_PRIVACY_SDKS, IOS_RISK_MARKERS as RM } from '../rules/signatures.js';
import { ReportBuilder, findSensitiveFiles, sizeBreakdown, largestFiles, REF } from './common.js';

const G = {
  upload: 'App Store Connect upload validation',
  review: 'App Review guidelines',
  privacy: 'Privacy requirements',
  security: 'Security (OWASP MASVS)',
  build: 'Build quality',
};

const WINDOW = 64 * 1024;

/** Stream a Mach-O binary once: feed the scanner and capture header windows of every slice. */
async function inspectBinary(zip, entry, scanner, label) {
  const head = await zip.read(entry, { maxBytes: WINDOW });
  const slices = machoSlices(head) || [{ cpu: null, offset: 0, size: entry.size }];
  const windows = slices.map((s) => ({ ...s, buf: new Uint8Array(Math.min(WINDOW, s.size || WINDOW)), got: 0 }));
  const feed = scanner ? scanner.createFeeder(label) : null;
  const needScan = !!feed;
  const maxEnd = Math.max(...windows.map((w) => w.offset + w.buf.length));
  await zip.stream(entry, (chunk, off) => {
    if (feed) feed(chunk);
    for (const w of windows) {
      const s = Math.max(off, w.offset), e = Math.min(off + chunk.length, w.offset + w.buf.length);
      if (e > s) { w.buf.set(chunk.subarray(s - off, e - off), s - w.offset); w.got += e - s; }
    }
    if (!needScan && off + chunk.length >= maxEnd) return false;
    return undefined;
  }, { maxBytes: needScan ? 400 * 1024 * 1024 : Infinity });
  return windows.map((w) => ({ cpu: w.cpu, ...(inspectMacho(w.buf.subarray(0, w.got)) || {}) }));
}

const isPlaceholder = (s) => typeof s !== 'string' || s.trim().length < 12 || /^(todo|tbd|test|description|usage|\$\(|placeholder|lorem|xxx)/i.test(s.trim()) || /(TODO|PRODUCT_NAME\))/.test(s);

export async function analyzeIos(zip, file, opts = {}) {
  const t0 = Date.now();
  const progress = opts.onProgress || (() => {});
  const R = new ReportBuilder('ios');
  const files = zip.files();
  const infoEntry = files.find((e) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(e.name));
  if (!infoEntry) throw new Error('Payload/*.app/Info.plist not found — this does not look like an iOS .ipa. (An .xcarchive or .app folder must be exported as an .ipa first.)');
  const appDir = infoEntry.name.slice(0, -'Info.plist'.length);
  const rel = (e) => e.name.slice(appDir.length);
  const appFiles = files.filter((e) => e.name.startsWith(appDir));
  const relNames = appFiles.map(rel);
  const hasRel = (re) => relNames.some((n) => re.test(n));
  const getRel = (n) => zip.get(appDir + n);

  progress('Reading Info.plist');
  const info = parsePlist(await zip.read(infoEntry)) || {};
  const provEntry = getRel('embedded.mobileprovision');
  const prov = provEntry ? parseMobileProvision(await zip.read(provEntry)) : null;
  const ent = prov?.Entitlements || {};

  const app = {
    id: info.CFBundleIdentifier || '',
    name: info.CFBundleDisplayName || info.CFBundleName || '',
    versionName: info.CFBundleShortVersionString || '',
    versionCode: info.CFBundleVersion || '',
    minOS: info.MinimumOSVersion || info.LSMinimumSystemVersion || '',
    sdk: info.DTSDKName || '',
    xcode: info.DTXcode || '',
    xcodeBuild: info.DTXcodeBuild || '',
    platformName: info.DTPlatformName || '',
    deviceFamily: (info.UIDeviceFamily || []).map((d) => ({ 1: 'iPhone', 2: 'iPad', 3: 'Apple TV', 4: 'Apple Watch', 6: 'Mac', 7: 'Vision' })[d] || String(d)),
    executable: info.CFBundleExecutable || '',
  };

  // ---------- framework detection ----------
  const frameworks = [...new Set(relNames.filter((n) => /^Frameworks\/[^/]+\.framework\//.test(n)).map((n) => n.split('/')[1].replace(/\.framework$/, '')))];
  const dylibsBundled = relNames.filter((n) => /^Frameworks\/[^/]+\.dylib$/.test(n));
  const framework = { id: 'native-ios', name: 'Native iOS', details: [], debugBuild: false };
  if (frameworks.includes('Flutter')) {
    Object.assign(framework, { id: 'flutter', name: 'Flutter' });
    if (hasRel(/^Frameworks\/App\.framework\/flutter_assets\/kernel_blob\.bin$/)) { framework.debugBuild = true; framework.details.push('JIT debug build (kernel_blob.bin present)'); }
  } else if (hasRel(/^main\.jsbundle$/) || frameworks.some((f) => /^(hermes|hermesvm|React|React_Native|ReactNativeDependencies)$/i.test(f))) {
    const expo = hasRel(/^(EXConstants\.bundle|Expo\.plist|EXUpdates\.bundle)/);
    Object.assign(framework, { id: 'react-native', name: expo ? 'React Native (Expo)' : 'React Native', expo });
    framework.details.push(frameworks.some((f) => /^hermes/i.test(f)) ? 'Hermes JS engine' : 'JavaScriptCore engine');
    if (!hasRel(/^main\.jsbundle$/)) { framework.debugBuild = true; framework.details.push('No main.jsbundle — loads from Metro dev server (debug build)'); }
  } else if (frameworks.includes('UnityFramework')) Object.assign(framework, { id: 'unity', name: 'Unity' });
  else if (hasRel(/\.dll$/) || frameworks.some((f) => /^(Xamarin|Microsoft\.)/.test(f))) Object.assign(framework, { id: 'maui', name: '.NET MAUI / Xamarin' });
  else if (hasRel(/^(public\/)?capacitor\.config\.json$/) || frameworks.includes('Capacitor')) Object.assign(framework, { id: 'capacitor', name: 'Capacitor (Ionic)' });
  else if (hasRel(/^www\/cordova\.js$/) || frameworks.includes('Cordova')) Object.assign(framework, { id: 'cordova', name: 'Apache Cordova' });

  // ---------- scanning ----------
  const markers = [
    ...Object.values(RM), 'kfun:',
    ...IOS_PURPOSE_KEYS.flatMap((p) => p.markers),
    ...REQUIRED_REASON_APIS.flatMap((r) => r.markers),
    ...SDKS.flatMap((s) => [...s.i, ...s.f]),
  ];
  const scanner = new ContentScanner({ markers });
  let mainBin = [];
  const exeEntry = app.executable ? getRel(app.executable) : null;
  if (exeEntry) {
    progress(`Scanning main binary (${(exeEntry.size / 1048576).toFixed(1)} MB)`, 0.1);
    try { mainBin = await inspectBinary(zip, exeEntry, scanner, app.executable); } catch { mainBin = []; }
  }
  const extraScan = relNames.filter((n) =>
    n === 'Frameworks/App.framework/App' || n === 'main.jsbundle' ||
    (!n.includes('.framework/') && /\.(json|js|plist|html?|env|txt|xml|strings|cfg|conf|ya?ml)$/i.test(n) && !/\.lproj\//.test(n)) ||
    /flutter_assets\/(.*\.env|.*\.json)$/i.test(n),
  );
  let i = 0;
  for (const n of extraScan) {
    progress(`Scanning ${n}`, 0.4 + 0.3 * (i++ / Math.max(1, extraScan.length)));
    try { await scanner.scanEntry(zip, getRel(n), { file: n }); } catch { /* skip */ }
  }
  // Framework binaries: architectures + markers (bounded).
  const fwInfo = [];
  for (const f of frameworks.slice(0, 150)) {
    const bin = getRel(`Frameworks/${f}.framework/${f}`);
    const privacy = !!getRel(`Frameworks/${f}.framework/PrivacyInfo.xcprivacy`) || relNames.some((n) => n.startsWith(`Frameworks/${f}.framework/`) && n.endsWith('PrivacyInfo.xcprivacy'));
    const signed = relNames.some((n) => n.startsWith(`Frameworks/${f}.framework/_CodeSignature/`));
    let archs = [];
    if (bin) {
      progress(`Inspecting ${f}.framework`, 0.7 + 0.25 * (fwInfo.length / Math.max(1, frameworks.length)));
      try {
        const doScan = bin.size < 60 * 1024 * 1024 && f !== 'Flutter' && f !== 'App';
        const sl = await inspectBinary(zip, bin, doScan ? scanner : null, `Frameworks/${f}.framework`);
        archs = sl.map((s) => s.cpu + (s.platform && /Simulator/.test(s.platform) ? ' (simulator)' : ''));
      } catch { /* skip */ }
    }
    fwInfo.push({ name: f, privacyManifest: privacy, signed, archs, size: appFiles.filter((e) => rel(e).startsWith(`Frameworks/${f}.framework/`)).reduce((s, e) => s + e.size, 0) });
  }

  const flutterPkgs = framework.id === 'flutter';
  const sdks = SDKS.filter((s) => scanner.any(s.i) || frameworks.some((f) => s.i.some((m) => m === f || m === `${f}.framework`)) || (flutterPkgs && scanner.any(s.f)))
    .map((s) => ({ name: s.name, cat: s.cat, data: s.data, ads: !!s.ads, security: s.security || null, login: !!s.login }));
  const mb = mainBin.find((s) => s.cpu === 'arm64') || mainBin[0] || {};
  const languages = [];
  if ((mb.dylibs || []).some((d) => /libswift/.test(d)) || scanner.has(RM.swift) || scanner.has(RM.swiftui)) languages.push('Swift');
  if (scanner.has(RM.swiftui)) framework.details.push('SwiftUI');
  languages.push('Objective-C runtime');
  if (scanner.has('kfun:')) { languages.push('Kotlin/Native (KMP)'); framework.details.push('Kotlin Multiplatform shared code'); }
  if (framework.id === 'flutter') languages.push('Dart');
  if (framework.id === 'react-native') languages.push('JavaScript/TypeScript');

  // =================== CHECKS ===================
  const sdkVer = (app.sdk.match(/(\d+(?:\.\d+)*)$/) || [])[1] || mb.sdk || '';
  const sdkMajor = parseInt(sdkVer, 10);
  R.check({
    id: 'asc.sdk', group: G.upload, title: `Built with iOS ${POLICY.apple.minSdkMajor} SDK / Xcode ${POLICY.apple.minSdkMajor}+`, itms: 'ITMS-90725',
    status: !sdkVer ? 'warn' : sdkMajor >= POLICY.apple.minSdkMajor ? 'pass' : 'fail', severity: 'blocker',
    detail: `SDK: ${app.sdk || mb.sdk || 'unknown'} · Xcode: ${app.xcode || 'unknown'}${app.xcodeBuild ? ` (${app.xcodeBuild})` : ''}. Since 28 Apr 2026 App Store Connect rejects uploads not built with Xcode 26 and the iOS 26 SDK.`,
    fix: { default: ['Install Xcode 26+ (macOS Sequoia 15.6+), rebuild and re-archive. The deployment target can stay lower.'], flutter: ['Upgrade Flutter to a version supporting Xcode 26, run pod repo update && pod install, then flutter build ipa.'], 'react-native': ['Upgrade React Native / Expo SDK (Expo SDK 54+ recommended) and set the EAS build image to an Xcode 26 image.'] },
    refs: [REF.appleSdk],
  });

  R.check({
    id: 'asc.minOS', group: G.upload, title: `Deployment target iOS ${POLICY.apple.minDeploymentTarget}+`,
    status: !app.minOS ? 'warn' : compareVersions(app.minOS, String(POLICY.apple.minDeploymentTarget)) >= 0 ? 'pass' : 'fail', severity: 'blocker',
    detail: `MinimumOSVersion ${app.minOS || 'missing'}. Apps uploaded since 9 Sep 2026 must target iOS 13 or later.`,
    fix: { default: ['Raise IPHONEOS_DEPLOYMENT_TARGET in the project and Podfile (platform :ios, \'15.0\' is a common baseline).'] },
    refs: [REF.appleSdk],
  });

  R.check({
    id: 'asc.platform', group: G.upload, title: 'Built for devices (not the Simulator)', itms: 'ITMS-90087',
    status: /simulator/i.test(app.platformName) || /Simulator/.test(mb.platform || '') ? 'fail' : 'pass', severity: 'blocker',
    detail: `DTPlatformName: ${app.platformName || 'unknown'}${mb.platform ? ` · binary platform ${mb.platform}` : ''}.`,
    fix: { default: ['Archive with "Any iOS Device (arm64)" selected, then export for App Store Connect.'] },
  });

  const mainArchs = mainBin.map((s) => s.cpu);
  R.check({
    id: 'asc.arm64', group: G.upload, title: 'Main binary contains arm64', itms: 'ITMS-90081',
    status: !mainArchs.length ? 'warn' : mainArchs.includes('arm64') ? 'pass' : 'fail', severity: 'blocker',
    detail: `Architectures: ${mainArchs.join(', ') || 'unknown'}.`,
  });

  const badFw = fwInfo.filter((f) => f.archs.some((a) => /x86_64|i386|simulator/.test(a)));
  R.check({
    id: 'asc.fwArchs', group: G.upload, title: 'No simulator architectures in embedded frameworks', itms: 'ITMS-90087',
    status: badFw.length ? 'fail' : 'pass', severity: 'blocker',
    detail: 'Embedded frameworks containing x86_64/i386/simulator slices are rejected on upload ("Unsupported Architectures").',
    evidence: badFw.map((f) => `${f.name}.framework: ${f.archs.join(', ')}`),
    fix: { default: ['Replace fat frameworks with XCFrameworks (Xcode picks the correct slice), or strip simulator slices with lipo in a Run Script phase.'] },
  });

  R.check({
    id: 'asc.signed', group: G.upload, title: 'App bundle is code-signed',
    status: hasRel(/^_CodeSignature\/CodeResources$/) ? 'pass' : 'fail', severity: 'blocker',
    detail: 'No _CodeSignature/CodeResources in the app bundle — the IPA is unsigned or was modified after signing.',
    fix: { default: ['Export from Xcode Organizer (Distribute App → App Store Connect) so the bundle is signed with an Apple Distribution certificate.'] }, masvs: 'MASVS-RESILIENCE-2', category: 'security',
  });

  // provisioning
  const provType = !prov ? 'none' : prov.ProvisionsAllDevices ? 'enterprise' : prov.ProvisionedDevices ? (ent['get-task-allow'] ? 'development' : 'ad-hoc') : 'app-store';
  const provExpired = prov?.ExpirationDate instanceof Date && prov.ExpirationDate < new Date();
  R.check({
    id: 'asc.profile', group: G.upload, title: 'Signed with an App Store distribution profile', itms: 'ITMS-90161',
    status: provType === 'app-store' ? 'pass' : provType === 'none' ? 'warn' : 'fail', severity: provType === 'none' ? 'medium' : 'blocker',
    detail: !prov ? 'No embedded.mobileprovision — re-export the archive for App Store Connect.' : `Profile "${prov.Name || '?'}" (${provType}) for team ${(prov.TeamName || '')} ${(prov.TeamIdentifier || []).join(',')}, expires ${prov.ExpirationDate instanceof Date ? prov.ExpirationDate.toISOString().slice(0, 10) : '?'}. ${provType !== 'app-store' ? 'Development, ad-hoc and enterprise profiles cannot be used for App Store submission.' : ''}`,
    fix: { default: ['In Xcode: Product → Archive → Distribute App → App Store Connect (automatic signing), or create an "App Store Connect" provisioning profile manually.'] },
  });
  if (prov) {
    R.check({ id: 'asc.profileExpiry', group: G.upload, title: 'Provisioning profile not expired', status: provExpired ? 'fail' : 'pass', severity: 'blocker', detail: provExpired ? 'The embedded provisioning profile has expired.' : 'Profile valid.' });
    R.check({
      id: 'asc.getTaskAllow', group: G.upload, title: 'get-task-allow is false (not a debug build)', itms: 'ITMS-90164',
      status: ent['get-task-allow'] ? 'fail' : 'pass', severity: 'blocker',
      detail: 'get-task-allow=true means a debugger can attach — App Store builds must have it false.',
      masvs: 'MASVS-RESILIENCE-4', category: 'security',
    });
    if (ent['aps-environment']) {
      R.check({ id: 'asc.aps', group: G.upload, title: 'Push entitlement uses production environment', status: ent['aps-environment'] === 'production' ? 'pass' : 'fail', severity: 'high', detail: `aps-environment = ${ent['aps-environment']}. App Store builds must use production; development tokens will not receive pushes.` });
    }
    const bid = app.id;
    const appIdEnt = String(ent['application-identifier'] || '');
    if (appIdEnt && !appIdEnt.includes('*')) {
      R.check({ id: 'asc.bundleMatch', group: G.upload, title: 'Bundle ID matches provisioning profile', itms: 'ITMS-90046', status: appIdEnt.endsWith('.' + bid) ? 'pass' : 'fail', severity: 'blocker', detail: `Info.plist ${bid} vs profile ${appIdEnt}.` });
    }
  }

  R.check({
    id: 'asc.frameworkDebug', group: G.upload, title: 'Framework release build (not a dev/debug build)',
    status: framework.debugBuild ? 'fail' : 'pass', severity: 'blocker',
    detail: framework.debugBuild ? `${framework.name} debug build: ${framework.details.join('; ')}` : 'No framework debug artefacts found.',
    fix: { default: ['Archive the Release configuration.'], flutter: ['flutter build ipa --release'], 'react-native': ['Archive with the Release scheme (bundles main.jsbundle). Expo: eas build -p ios --profile production'] },
  });

  R.check({
    id: 'asc.bundleId', group: G.upload, title: 'Bundle identifier is final (not a template)',
    status: !app.id ? 'fail' : /^(com\.example|org\.reactjs\.native\.example|io\.ionic\.starter|com\.yourcompany|com\.apple\.)/i.test(app.id) ? 'fail' : 'pass', severity: 'blocker',
    detail: `CFBundleIdentifier: ${app.id || 'missing'}. It must match the App ID registered in your developer account and cannot change after release.`,
  });

  const vOk = /^\d+(\.\d+){0,2}$/.test(app.versionName);
  const bOk = /^\d+(\.\d+){0,2}$/.test(String(app.versionCode));
  R.check({
    id: 'asc.version', group: G.upload, title: 'Version and build number formats valid', itms: 'ITMS-90060',
    status: vOk && bOk ? 'pass' : 'fail', severity: 'blocker',
    detail: `CFBundleShortVersionString "${app.versionName}" and CFBundleVersion "${app.versionCode}" must be 1–3 period-separated integers; the build number must increase with each upload of the same version.`,
    fix: { flutter: ['pubspec.yaml: version: 1.2.3+45'], 'react-native': ['Xcode target → General → Version / Build, or app.json expo.version / ios.buildNumber'], default: ['Xcode target → General → Identity → Version / Build.'] },
  });

  R.check({
    id: 'asc.launch', group: G.upload, title: 'Launch screen provided', itms: 'ITMS-90477',
    status: info.UILaunchStoryboardName || info.UILaunchScreen ? 'pass' : 'fail', severity: 'blocker',
    detail: 'Apps must provide a launch storyboard (UILaunchStoryboardName) or UILaunchScreen dictionary to support all screen sizes.',
    refs: [REF.launchScreen],
  });

  R.check({
    id: 'asc.icon', group: G.upload, title: 'App icon in an asset catalog', itms: 'ITMS-90713 / ITMS-90022',
    status: hasRel(/^Assets\.car$/) && (info.CFBundleIcons || info.CFBundleIconName) ? 'pass' : 'fail', severity: 'blocker',
    detail: 'App icons (including the 1024×1024 App Store icon without alpha) must be provided in an asset catalog with CFBundleIconName set.',
  });

  const iPad = (info.UIDeviceFamily || []).includes(2);
  const ipadOrients = info['UISupportedInterfaceOrientations~ipad'] || info.UISupportedInterfaceOrientations || [];
  R.check({
    id: 'asc.ipadOrientation', group: G.upload, title: 'iPad multitasking orientations', itms: 'ITMS-90474',
    status: !iPad ? 'na' : info.UIRequiresFullScreen || ipadOrients.length >= 4 ? 'pass' : 'fail', severity: 'blocker',
    detail: 'iPad apps that support multitasking must support all four orientations, or set UIRequiresFullScreen = YES.',
    evidence: iPad ? [`iPad orientations: ${ipadOrients.join(', ') || 'none'}`] : [],
  });

  R.check({
    id: 'asc.armv7', group: G.upload, title: 'No legacy armv7 device capability', itms: 'ITMS-90208',
    status: (info.UIRequiredDeviceCapabilities || []).includes?.('armv7') ? 'fail' : 'pass', severity: 'high',
    detail: 'UIRequiredDeviceCapabilities contains armv7, which conflicts with modern deployment targets. Replace it with arm64 or remove it.',
  });

  const uiweb = scanner.has(RM.uiwebview);
  R.check({
    id: 'asc.uiwebview', group: G.upload, title: 'No deprecated UIWebView usage', itms: 'ITMS-90809',
    status: uiweb ? 'fail' : 'pass', severity: 'blocker',
    detail: 'UIWebView references are rejected by App Store Connect. Migrate to WKWebView (often caused by outdated SDKs or plugins).',
    fix: { default: ['Search with: grep -r UIWebView Pods/ node_modules/ ios/ and update the offending SDK.'] },
  });

  // purpose strings
  const missingPurpose = [];
  const weakPurpose = [];
  for (const p of IOS_PURPOSE_KEYS) {
    const used = p.markers.some((m) => scanner.has(m));
    const keys = [p.key, ...(p.alt || [])];
    const val = keys.map((k) => info[k]).find((v) => v !== undefined);
    if (used && val === undefined) missingPurpose.push(`${p.label} — add ${p.key}`);
    if (val !== undefined && isPlaceholder(val)) weakPurpose.push(`${p.key}: "${String(val).slice(0, 60)}"`);
  }
  if (info.NSLocationAlwaysAndWhenInUseUsageDescription && !info.NSLocationWhenInUseUsageDescription) missingPurpose.push('Location — NSLocationWhenInUseUsageDescription is required alongside Always');
  R.check({
    id: 'asc.purposeStrings', group: G.privacy, title: 'Purpose strings for every protected API', itms: 'ITMS-90683',
    status: missingPurpose.length ? 'fail' : 'pass', severity: 'blocker',
    detail: 'App Store Connect scans the binary for privacy-sensitive APIs. Each one needs an Info.plist purpose string even if the code path comes from an unused SDK/plugin; the app also crashes when the API is called without it.',
    evidence: missingPurpose,
    fix: { default: ['Add the keys to Info.plist with a specific explanation, e.g. "Used to scan the QR code on your ticket."'], flutter: ['ios/Runner/Info.plist; or remove unused plugin permissions via permission_handler Podfile macros (PERMISSION_CAMERA=0).'], 'react-native': ['ios/<App>/Info.plist, or Expo app.json → ios.infoPlist.'] },
    refs: [REF.purposeStrings], masvs: 'MASVS-PRIVACY-2', category: 'privacy',
  });
  R.check({
    id: 'asc.purposeQuality', group: G.review, title: 'Purpose strings are specific (Guideline 5.1.1)',
    status: weakPurpose.length ? 'warn' : 'pass', severity: 'medium',
    detail: 'App Review rejects vague purpose strings ("Needs camera"). Explain what the data is used for and give an example.',
    evidence: weakPurpose, category: 'privacy',
  });

  // privacy manifest
  const pmEntry = getRel('PrivacyInfo.xcprivacy');
  let pm = null;
  if (pmEntry) { try { pm = parsePlist(await zip.read(pmEntry)); } catch { pm = {}; } }
  const usedReasons = REQUIRED_REASON_APIS.filter((r) => r.markers.some((m) => scanner.has(m)));
  const declared = new Set((pm?.NSPrivacyAccessedAPITypes || []).map((x) => x?.NSPrivacyAccessedAPIType));
  const undeclared = usedReasons.filter((r) => !declared.has(r.type));
  R.check({
    id: 'asc.privacyManifest', group: G.privacy, title: 'Privacy manifest (PrivacyInfo.xcprivacy) declares required-reason APIs', itms: 'ITMS-91053',
    status: !pm ? (usedReasons.length ? 'fail' : 'warn') : undeclared.length ? 'fail' : 'pass', severity: 'blocker',
    detail: !pm ? 'No PrivacyInfo.xcprivacy in the app bundle. Apps using required-reason APIs must declare approved reasons.' : undeclared.length ? 'Required-reason APIs are used but not declared in the privacy manifest.' : 'Privacy manifest present and covers detected API categories.',
    evidence: (pm ? undeclared : usedReasons).map((r) => `${r.label} → ${r.type}`),
    fix: { default: ['Xcode → File → New → File → App Privacy, add NSPrivacyAccessedAPITypes with approved reason codes (e.g. CA92.1 for UserDefaults).', 'Declare NSPrivacyTracking, NSPrivacyTrackingDomains and NSPrivacyCollectedDataTypes too.'] },
    refs: [REF.privacyManifest, REF.requiredReason], masvs: 'MASVS-PRIVACY-3', category: 'privacy',
  });
  const sdkNoManifest = fwInfo.filter((f) => APPLE_PRIVACY_SDKS.includes(f.name) && !f.privacyManifest);
  R.check({
    id: 'asc.sdkManifests', group: G.privacy, title: 'Listed third-party SDKs include privacy manifests', itms: 'ITMS-91061',
    status: sdkNoManifest.length ? 'fail' : 'pass', severity: 'blocker',
    detail: 'Apple requires a privacy manifest (and signature for binary SDKs) in commonly used third-party SDKs. Old versions are rejected on upload.',
    evidence: sdkNoManifest.map((f) => `${f.name}.framework`),
    fix: { default: ['Update these SDKs (pod update / flutter pub upgrade / npm update) to versions that ship PrivacyInfo.xcprivacy.'] },
    refs: [REF.thirdPartySdks], category: 'privacy',
  });

  // ATT
  const tracking = scanner.has(RM.idfa) || sdks.some((s) => s.ads);
  const attUsed = scanner.has('ATTrackingManager');
  R.check({
    id: 'asc.att', group: G.privacy, title: 'App Tracking Transparency before tracking (Guideline 5.1.2)',
    status: !tracking ? 'pass' : attUsed && info.NSUserTrackingUsageDescription ? 'pass' : 'fail', severity: 'high',
    detail: tracking ? `Advertising/attribution capability detected (${sdks.filter((s) => s.ads).map((s) => s.name).join(', ') || 'advertisingIdentifier'}). You must show the ATT prompt (with NSUserTrackingUsageDescription) before accessing the IDFA or tracking, and declare tracking in App Privacy.` : 'No IDFA / ad SDK detected.',
    refs: [REF.att], masvs: 'MASVS-PRIVACY-1', category: 'privacy',
  });

  // Sign in with Apple
  const thirdPartyLogin = sdks.filter((s) => s.login);
  R.check({
    id: 'asc.siwa', group: G.review, title: 'Equivalent privacy-focused login option (Guideline 4.8)',
    status: !thirdPartyLogin.length ? 'na' : scanner.has(RM.appleSignIn) ? 'pass' : 'warn', severity: 'high',
    detail: 'Apps that offer third-party/social login (Google, Facebook…) must also offer an equivalent login option that limits data to name/email and allows hiding the email — Sign in with Apple satisfies this.',
    evidence: thirdPartyLogin.map((s) => s.name),
  });

  // ATS
  const ats = info.NSAppTransportSecurity || {};
  const atsExceptions = Object.entries(ats.NSExceptionDomains || {}).filter(([, v]) => v?.NSExceptionAllowsInsecureHTTPLoads || v?.NSTemporaryExceptionAllowsInsecureHTTPLoads).map(([d]) => d);
  R.check({
    id: 'sec.ats', group: G.security, title: 'App Transport Security enforced',
    status: ats.NSAllowsArbitraryLoads ? 'fail' : atsExceptions.length ? 'warn' : 'pass', severity: ats.NSAllowsArbitraryLoads ? 'high' : 'medium',
    detail: ats.NSAllowsArbitraryLoads ? 'NSAllowsArbitraryLoads = YES disables TLS requirements for all connections; App Review asks for justification.' : atsExceptions.length ? 'Insecure HTTP is allowed for specific domains.' : 'ATS is enforced.',
    evidence: atsExceptions,
    fix: { default: ['Remove NSAllowsArbitraryLoads; use HTTPS everywhere and per-domain exceptions only where unavoidable.'] }, refs: [REF.ats], masvs: 'MASVS-NETWORK-1', category: 'security',
  });

  const secrets = scanner.secretList();
  const realSecrets = secrets.filter((s) => s.severity !== 'review');
  R.check({
    id: 'sec.secrets', group: G.security, title: 'No secrets embedded in the app',
    status: realSecrets.length ? 'fail' : 'pass', severity: realSecrets.some((s) => s.severity === 'blocker') ? 'blocker' : 'high',
    detail: realSecrets.length ? 'Server-side secrets were found. IPA contents and binary strings are trivially extractable — rotate these keys and move the calls to your backend.' : 'No server-side secrets detected.',
    evidence: realSecrets.map((s) => `${s.label}: ${s.masked} (${s.files.slice(0, 2).join(', ')})`),
    fix: { default: ['Rotate/revoke each key immediately.', 'Proxy secret-bearing calls through your server; see the Keys & secrets page.'] },
    masvs: 'MASVS-STORAGE-1', category: 'security',
  });
  const reviewKeys = secrets.filter((s) => s.severity === 'review');
  R.check({
    id: 'sec.clientKeys', group: G.security, title: 'Client API keys are restricted',
    status: reviewKeys.length ? 'info' : 'pass', severity: 'info',
    detail: 'Client identifiers (Google/Firebase API keys) are expected, but restrict them to your bundle ID and needed APIs, and protect backends with App Check / App Attest.',
    evidence: reviewKeys.map((s) => `${s.label}: ${s.masked}`), category: 'security', masvs: 'MASVS-AUTH-1',
  });

  const sensitive = findSensitiveFiles(relNames);
  const sensBad = sensitive.filter((s) => s.severity !== 'info');
  R.check({
    id: 'sec.files', group: G.security, title: 'No keys, certificates or config secrets packaged',
    status: sensBad.length ? 'fail' : 'pass', severity: sensBad.some((s) => s.severity === 'blocker') ? 'blocker' : sensBad.some((s) => s.severity === 'high') ? 'high' : 'medium',
    detail: sensBad.length ? 'Files that must stay in your keychain or CI secrets were copied into the bundle.' : 'No sensitive files packaged.',
    evidence: sensBad.map((s) => `${s.path} — ${s.what}`),
    fix: { default: ['Remove them from "Copy Bundle Resources" and add them to .gitignore. Revoke any leaked .p8/.p12.'] }, masvs: 'MASVS-STORAGE-1', category: 'security',
  });

  const http = scanner.httpList();
  R.check({
    id: 'sec.httpUrls', group: G.security, title: 'No hard-coded http:// endpoints',
    status: http.length ? 'warn' : 'pass', severity: 'low',
    detail: http.length ? `${http.length} host(s) referenced over plain HTTP.` : 'No insecure URLs found.',
    evidence: http.slice(0, 15).map((h) => `${h.host} ×${h.count} (${h.files[0]})`), masvs: 'MASVS-NETWORK-1', category: 'security',
  });

  R.check({
    id: 'sec.pie', group: G.security, title: 'Position-independent executable (ASLR)',
    status: mb.pie === undefined ? 'na' : mb.pie ? 'pass' : 'fail', severity: 'medium',
    detail: 'The main executable should be built as PIE so ASLR applies.', masvs: 'MASVS-CODE-4', category: 'security',
  });
  const integrity = sdks.some((s) => s.security === 'integrity');
  R.check({ id: 'sec.integrity', group: G.security, title: 'App Attest / DeviceCheck integrity', status: integrity ? 'pass' : 'info', severity: 'info', detail: integrity ? 'App Attest / App Check detected.' : 'Consider App Attest (DCAppAttestService) or Firebase App Check so your backend can reject tampered clients.', masvs: 'MASVS-RESILIENCE-1', category: 'security' });
  const pinning = sdks.some((s) => s.security === 'pinning') || !!info.NSAppTransportSecurity?.NSPinnedDomains;
  R.check({ id: 'sec.pinning', group: G.security, title: 'Certificate pinning (high-risk apps)', status: pinning ? 'pass' : 'info', severity: 'info', detail: pinning ? 'Pinning detected (NSPinnedDomains or a pinning library).' : 'No pinning detected. Use NSPinnedDomains in Info.plist or TrustKit for banking, payments and health apps.', masvs: 'MASVS-NETWORK-2', category: 'security' });
  const keychain = sdks.some((s) => s.security === 'storage');
  R.check({ id: 'sec.storage', group: G.security, title: 'Secrets stored in the Keychain', status: keychain ? 'pass' : 'info', severity: 'info', detail: keychain ? 'Keychain APIs referenced.' : 'No Keychain usage detected — store tokens in the Keychain (kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly), never in UserDefaults/AsyncStorage/SharedPreferences.', masvs: 'MASVS-STORAGE-1', category: 'security' });

  // review / metadata-ish
  R.check({
    id: 'asc.encryption', group: G.review, title: 'Export compliance key set (ITSAppUsesNonExemptEncryption)',
    status: info.ITSAppUsesNonExemptEncryption === undefined ? 'warn' : 'pass', severity: 'low',
    detail: info.ITSAppUsesNonExemptEncryption === undefined ? 'Without this key App Store Connect asks the export-compliance question for every build. Set it to NO if you only use HTTPS/standard OS encryption.' : `ITSAppUsesNonExemptEncryption = ${info.ITSAppUsesNonExemptEncryption}`,
    refs: [REF.exportCompliance],
  });

  const bg = info.UIBackgroundModes || [];
  R.check({
    id: 'asc.background', group: G.review, title: 'Background modes are justified (Guideline 2.5.4)',
    status: bg.length ? 'info' : 'pass', severity: 'info',
    detail: bg.length ? 'Reviewers verify each background mode is used for its intended purpose (audio, location, VoIP…). Explain them in App Review notes.' : 'No background modes.',
    evidence: bg,
  });

  if (['cordova', 'capacitor'].includes(framework.id)) {
    R.check({ id: 'asc.webWrapper', group: G.review, title: 'Not just a website in a WebView (Guideline 4.2)', status: 'warn', severity: 'high', detail: 'Hybrid apps that mostly display a website are rejected for minimum functionality. Add native capabilities and offline behaviour.' });
  }

  R.check({
    id: 'asc.accountDeletion', group: G.review, title: 'In-app account deletion (Guideline 5.1.1(v))',
    status: 'info', severity: 'info',
    detail: 'If users can create an account, they must be able to start account deletion inside the app (not just via email). Cannot be detected automatically — verify manually.',
  });

  const plugins = relNames.filter((n) => /^PlugIns\/[^/]+\.appex\/Info\.plist$/.test(n));
  const extensions = [];
  for (const p of plugins) {
    try {
      const pi = parsePlist(await zip.read(getRel(p)));
      extensions.push({ name: p.split('/')[1], id: pi.CFBundleIdentifier, type: pi.NSExtension?.NSExtensionPointIdentifier || '' });
    } catch { /* skip */ }
  }
  const badExt = extensions.filter((e) => e.id && !e.id.startsWith(app.id + '.'));
  R.check({ id: 'asc.extensions', group: G.upload, title: 'App extension bundle IDs prefixed by app ID', itms: 'ITMS-90345', status: !extensions.length ? 'na' : badExt.length ? 'fail' : 'pass', severity: 'blocker', detail: 'Each extension bundle ID must start with the parent app bundle ID.', evidence: badExt.map((e) => `${e.name}: ${e.id}`) });

  const total = files.reduce((s, e) => s + e.size, 0);
  R.check({ id: 'asc.size', group: G.build, title: 'Cellular download size', status: total > 200 * 1024 * 1024 ? 'info' : 'pass', severity: 'info', detail: `Uncompressed app size ${(total / 1048576).toFixed(1)} MB. Apps over 200 MB prompt users before cellular download (configurable on device). The App Store limit for the uncompressed binary is 4 GB.` });

  const urlSchemes = (info.CFBundleURLTypes || []).flatMap((t) => t.CFBundleURLSchemes || []);
  progress('Done', 1);
  return {
    platform: 'ios', format: 'ipa', fileName: file.name, fileSize: file.size,
    app, framework, languages, info, provisioning: prov ? { name: prov.Name, type: provType, team: prov.TeamName, teamId: (prov.TeamIdentifier || [])[0], expires: prov.ExpirationDate, entitlements: ent } : null,
    mainBinary: mainBin, frameworks: fwInfo, dylibs: dylibsBundled, extensions, urlSchemes,
    associatedDomains: ent['com.apple.developer.associated-domains'] || [],
    backgroundModes: bg, privacyManifest: pm, requiredReasonApis: usedReasons.map((r) => r.type),
    permissions: IOS_PURPOSE_KEYS.filter((p) => info[p.key] !== undefined || (p.alt || []).some((k) => info[k] !== undefined)).map((p) => ({ name: p.key, label: p.label, text: info[p.key] ?? (p.alt || []).map((k) => info[k]).find(Boolean) })),
    sdks, secrets, http, sensitiveFiles: sensitive,
    sizeBreakdown: sizeBreakdown(appFiles, 'ios', rel), largest: largestFiles(appFiles).map((f) => ({ ...f, name: f.name.slice(appDir.length) })),
    checks: R.checks, issues: R.issues(),
    stats: { files: files.length, scannedBytes: scanner.bytesScanned, durationMs: Date.now() - t0 },
  };
}
