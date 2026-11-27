// SPDX-License-Identifier: MIT
// Android (.apk / .aab) analyzer. Mirrors the automated checks Play Console runs on upload,
// plus OWASP MASVS-oriented security checks and framework-specific diagnostics.

import { parseAxml, isAxml } from '../core/axml.js';
import { parseProtoXml } from '../core/protoxml.js';
import { inspectElf } from '../core/binary.js';
import { ContentScanner } from '../core/scanner.js';
import { POLICY } from '../rules/policy.js';
import { SDKS, SENSITIVE_PERMISSIONS, ANDROID_RISK_MARKERS as RM } from '../rules/signatures.js';
import { ReportBuilder, findSensitiveFiles, extractCNs, bytesHas, sizeBreakdown, largestFiles, REF } from './common.js';

const G = {
  upload: 'Play Console upload checks',
  policy: 'Play policy & declarations',
  security: 'Security (OWASP MASVS)',
  build: 'Build quality',
};

function logicalName(name, isAab) {
  if (!isAab) return name;
  const i = name.indexOf('/');
  if (i < 0) return name;
  const rest = name.slice(i + 1);
  if (rest.startsWith('dex/')) return rest.slice(4);
  if (rest === 'manifest/AndroidManifest.xml') return 'AndroidManifest.xml';
  if (rest.startsWith('root/')) return rest.slice(5);
  return rest;
}

function walk(node, fn) { fn(node); (node.children || []).forEach((c) => walk(c, fn)); }

function intentInfo(comp) {
  const filters = comp.children.filter((c) => c.tag === 'intent-filter');
  let launcher = false;
  const deepLinks = [];
  for (const f of filters) {
    const actions = f.children.filter((c) => c.tag === 'action').map((c) => c.attrs.name);
    const cats = f.children.filter((c) => c.tag === 'category').map((c) => c.attrs.name);
    if (actions.includes('android.intent.action.MAIN') && cats.includes('android.intent.category.LAUNCHER')) launcher = true;
    if (actions.includes('android.intent.action.VIEW') && cats.includes('android.intent.category.BROWSABLE')) {
      const datas = f.children.filter((c) => c.tag === 'data');
      const schemes = datas.map((d) => d.attrs.scheme).filter(Boolean);
      const hosts = datas.map((d) => d.attrs.host).filter(Boolean);
      for (const s of schemes.length ? schemes : ['?']) deepLinks.push({ scheme: s, hosts, autoVerify: f.attrs.autoVerify === true || f.attrs.autoVerify === 'true' });
    }
  }
  return { hasFilters: filters.length > 0, launcher, deepLinks };
}

async function readSigningBlock(zip) {
  const cd = zip.meta.cdOffset;
  if (cd < 32) return null;
  const tail = await zip.readRaw(cd - 24, cd);
  const magic = new TextDecoder('latin1').decode(tail.subarray(8));
  if (magic !== 'APK Sig Block 42') return null;
  const size = Number(new DataView(tail.buffer, tail.byteOffset).getBigUint64(0, true));
  if (size > 50 * 1024 * 1024 || size > cd) return null;
  const block = await zip.readRaw(cd - size - 8, cd);
  const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const ids = new Set();
  let p = 8;
  while (p + 12 <= block.length - 24) {
    const len = Number(dv.getBigUint64(p, true));
    if (len < 4 || p + 8 + len > block.length) break;
    ids.add(dv.getUint32(p + 8, true));
    p += 8 + len;
  }
  return { block, ids };
}

export async function analyzeAndroid(zip, file, opts = {}) {
  const t0 = Date.now();
  const progress = opts.onProgress || (() => {});
  const isAab = zip.has('base/manifest/AndroidManifest.xml');
  const format = isAab ? 'aab' : 'apk';
  const R = new ReportBuilder('android');
  const files = zip.files();
  const L = new Map(files.map((e) => [logicalName(e.name, isAab), e]));
  const names = [...L.keys()];
  const has = (re) => names.some((n) => re.test(n));

  // ---------- manifest ----------
  progress('Reading AndroidManifest.xml');
  const mEntry = isAab ? zip.get('base/manifest/AndroidManifest.xml') : zip.get('AndroidManifest.xml');
  if (!mEntry) throw new Error('AndroidManifest.xml not found — this does not look like an Android app package.');
  const mBytes = await zip.read(mEntry);
  let manifest;
  try { manifest = isAab ? parseProtoXml(mBytes) : isAxml(mBytes) ? parseAxml(mBytes) : null; } catch (e) { manifest = null; }
  if (!manifest) throw new Error('Could not decode AndroidManifest.xml (unknown or protected format).');

  const usesSdk = manifest.children.find((c) => c.tag === 'uses-sdk')?.attrs || {};
  const appNode = manifest.children.find((c) => c.tag === 'application') || { attrs: {}, children: [] };
  const A = appNode.attrs;
  const minSdk = Number(usesSdk.minSdkVersion ?? 1);
  const targetSdk = Number(usesSdk.targetSdkVersion ?? usesSdk.minSdkVersion ?? 1);
  const app = {
    id: manifest.attrs.package || '',
    name: typeof A.label === 'string' && !A.label.startsWith('@') ? A.label : '',
    versionName: manifest.attrs.versionName != null ? String(manifest.attrs.versionName) : '',
    versionCode: manifest.attrs.versionCode != null ? Number(manifest.attrs.versionCode) : null,
    minSdk, targetSdk,
    compileSdk: manifest.attrs.compileSdkVersion ?? manifest.attrs.platformBuildVersionCode ?? null,
  };

  const permissions = [];
  const features = [];
  const metaData = {};
  walk(manifest, (n) => {
    if ((n.tag === 'uses-permission' || n.tag === 'uses-permission-sdk-23') && n.attrs.name) {
      const info = SENSITIVE_PERMISSIONS[n.attrs.name];
      permissions.push({ name: n.attrs.name, maxSdk: n.attrs.maxSdkVersion ?? null, level: info?.level || 'normal', note: info?.note || '' });
    }
    if (n.tag === 'uses-feature' && n.attrs.name) features.push({ name: n.attrs.name, required: n.attrs.required !== false });
    if (n.tag === 'meta-data' && n.attrs.name) metaData[n.attrs.name] = n.attrs.value ?? n.attrs.resource ?? '';
  });

  const components = { activity: [], service: [], receiver: [], provider: [] };
  const deepLinks = [];
  for (const c of appNode.children) {
    const kind = c.tag === 'activity-alias' ? 'activity' : c.tag;
    if (!components[kind]) continue;
    const ii = intentInfo(c);
    const explicit = c.attrs.exported;
    const exported = explicit === undefined ? (kind === 'provider' ? targetSdk < 17 : ii.hasFilters) : explicit === true || explicit === 'true';
    const rec = { name: c.attrs.name || '?', exported, explicitExported: explicit !== undefined, permission: c.attrs.permission || null, launcher: ii.launcher, hasFilters: ii.hasFilters, foregroundServiceType: c.attrs.foregroundServiceType ?? null };
    components[kind].push(rec);
    ii.deepLinks.forEach((d) => deepLinks.push({ ...d, component: rec.name }));
  }

  // ---------- framework ----------
  const libs = names.filter((n) => /^lib\/[^/]+\/[^/]+\.so$/.test(n));
  const abis = [...new Set(libs.map((n) => n.split('/')[1]))];
  const libNamed = (re) => libs.some((n) => re.test(n.split('/').pop()));
  const framework = { id: 'native-android', name: 'Native Android', details: [], debugBuild: false };
  if (libNamed(/^libflutter\.so$/) || has(/^assets\/flutter_assets\//)) {
    Object.assign(framework, { id: 'flutter', name: 'Flutter' });
    if (has(/^assets\/flutter_assets\/kernel_blob\.bin$/)) { framework.debugBuild = true; framework.details.push('JIT debug build (kernel_blob.bin present)'); }
    else if (libNamed(/^libapp\.so$/)) framework.details.push('AOT release/profile build (libapp.so)');
  } else if (libNamed(/^lib(reactnativejni|reactnative)\.so$/) || has(/^assets\/index\.android\.bundle$/)) {
    const expo = libNamed(/^libexpo-modules-core\.so$/) || has(/^assets\/app\.config$/) || Object.keys(metaData).some((k) => k.startsWith('expo.modules'));
    Object.assign(framework, { id: 'react-native', name: expo ? 'React Native (Expo)' : 'React Native', expo });
    framework.details.push(libNamed(/^libhermes(vm)?\.so$/) ? 'Hermes JS engine' : 'JavaScriptCore engine');
    if (!has(/^assets\/index\.android\.bundle$/)) { framework.debugBuild = true; framework.details.push('No embedded JS bundle — loads from Metro dev server (debug build)'); }
  } else if (libNamed(/^libunity\.so$/)) Object.assign(framework, { id: 'unity', name: 'Unity' });
  else if (libNamed(/^lib(UE4|Unreal)\.so$/)) Object.assign(framework, { id: 'unreal', name: 'Unreal Engine' });
  else if (libNamed(/^lib(monodroid|monosgen-2\.0|xamarin-app)\.so$/) || has(/^assemblies\//)) Object.assign(framework, { id: 'maui', name: '.NET MAUI / Xamarin' });
  else if (has(/^assets\/capacitor\.config\.json$/)) Object.assign(framework, { id: 'capacitor', name: 'Capacitor (Ionic)' });
  else if (has(/^assets\/www\/cordova\.js$/)) Object.assign(framework, { id: 'cordova', name: 'Apache Cordova' });

  // ---------- content scan ----------
  const markers = [...Object.values(RM), ...SDKS.flatMap((s) => [...s.a, ...s.f])];
  const scanner = new ContentScanner({ markers });
  const scanTargets = names.filter((n) =>
    /^classes\d*\.dex$/.test(n) ||
    n === 'assets/index.android.bundle' ||
    /^lib\/(arm64-v8a|armeabi-v7a)\/libapp\.so$/.test(n) ||
    /^(assets|res\/raw)\/.*\.(json|js|html?|xml|properties|txt|env|cfg|conf|config|ya?ml|plist|ini)$/i.test(n) ||
    /^assets\/flutter_assets\/(AssetManifest|NOTICES|.*\.env|.*\.json)/i.test(n) ||
    /resources\.(arsc|pb)$/.test(n),
  );
  // Only one copy of libapp.so needed.
  const seenLibapp = { v: false };
  const totalScan = scanTargets.reduce((s, n) => s + L.get(n).size, 0);
  let scanned = 0;
  for (const n of scanTargets) {
    if (/libapp\.so$/.test(n)) { if (seenLibapp.v) continue; seenLibapp.v = true; }
    progress(`Scanning ${n}`, totalScan ? scanned / totalScan : 0);
    try {
      await scanner.scanEntry(zip, L.get(n), { file: n });
    } catch { /* unreadable entry, skip */ }
    scanned += L.get(n).size;
  }
  const flutterPkgs = framework.id === 'flutter';
  const sdks = SDKS.filter((s) => scanner.any(s.a) || (flutterPkgs && scanner.any(s.f)))
    .map((s) => ({ name: s.name, cat: s.cat, data: s.data, ads: !!s.ads, security: s.security || null, login: !!s.login }));
  const languages = [];
  if (scanner.has(RM.kotlin) || has(/^META-INF\/.*\.kotlin_module$/)) languages.push('Kotlin');
  if (names.some((n) => /^classes\d*\.dex$/.test(n))) languages.push('Java/JVM bytecode');
  if (scanner.has(RM.compose) || has(/^META-INF\/androidx\.compose\.ui_ui\.version$/)) framework.details.push('Jetpack Compose UI');
  if (framework.id === 'flutter') languages.push('Dart');
  if (framework.id === 'react-native') languages.push('JavaScript/TypeScript');
  if (libs.length) languages.push('C/C++ (native libs)');

  // ---------- native libraries / 16 KB ----------
  progress('Checking native libraries (64-bit, 16 KB alignment)');
  const nativeLibs = [];
  for (const n of libs.slice(0, 400)) {
    const abi = n.split('/')[1];
    const e = L.get(n);
    const rec = { path: n, abi, size: e.size, align: null, ok16k: null, zipAligned16k: null, stored: e.method === 0 };
    if (abi === 'arm64-v8a' || abi === 'x86_64') {
      try {
        let head = await zip.read(e, { maxBytes: 8192 });
        let info = inspectElf(head);
        if (info?.needBytes) { head = await zip.read(e, { maxBytes: info.needBytes + 64 }); info = inspectElf(head); }
        if (info?.minLoadAlign) { rec.align = info.minLoadAlign; rec.ok16k = info.minLoadAlign >= 16384; }
        if (!isAab && e.method === 0) rec.zipAligned16k = (await zip.dataOffset(e)) % 16384 === 0;
      } catch { /* ignore */ }
    }
    nativeLibs.push(rec);
  }

  // ---------- signing ----------
  progress('Verifying signature');
  const sigFiles = names.filter((n) => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(n));
  const signing = { v1: sigFiles.length > 0, v2: false, v3: false, v31: false, debugCert: false, subjects: [] };
  for (const s of sigFiles) {
    const b = await zip.read(L.get(s));
    if (bytesHas(b, 'Android Debug')) signing.debugCert = true;
    signing.subjects.push(...extractCNs(b));
  }
  if (!isAab) {
    const sb = await readSigningBlock(zip);
    if (sb) {
      signing.v2 = sb.ids.has(0x7109871a);
      signing.v3 = sb.ids.has(0xf05368c0);
      signing.v31 = sb.ids.has(0x1b93ad61);
      if (bytesHas(sb.block, 'Android Debug')) signing.debugCert = true;
      signing.subjects.push(...extractCNs(sb.block));
    }
  }
  signing.subjects = [...new Set(signing.subjects)];
  const signed = signing.v1 || signing.v2 || signing.v3;

  // =================== CHECKS ===================
  const fw = framework.id;
  const isWear = features.some((f) => f.name === 'android.hardware.type.watch');
  const isTv = features.some((f) => f.name === 'android.software.leanback' && f.required);
  const reqTarget = isWear ? POLICY.play.minTargetSdkWear : isTv ? POLICY.play.minTargetSdkTv : POLICY.play.minTargetSdk;

  R.check({
    id: 'play.format', group: G.upload, title: 'Upload format accepted by Play (AAB for new apps)',
    status: isAab ? 'pass' : 'warn', severity: 'medium',
    detail: isAab ? 'Android App Bundle — the format Google Play requires for new apps.' : 'This is an APK. Google Play requires an Android App Bundle (.aab) for new apps; APKs are fine for testing, enterprise/MDM and other stores.',
    fix: { default: ['Build an AAB for Play and keep the APK for QA/sideload.'], flutter: ['flutter build appbundle --release'], 'react-native': ['cd android && ./gradlew bundleRelease', 'Expo: eas build -p android --profile production'], 'native-android': ['./gradlew :app:bundleRelease'] },
    refs: [REF.aab],
  });

  R.check({
    id: 'play.targetSdk', group: G.upload, title: `Target API level ≥ ${reqTarget}${isWear ? ' (Wear OS)' : isTv ? ' (TV)' : ''}`,
    status: targetSdk >= reqTarget ? 'pass' : 'fail', severity: 'blocker',
    detail: `targetSdkVersion is ${targetSdk}. Since 31 Aug 2026 Google Play rejects new apps and updates that target below API ${reqTarget}.${targetSdk < POLICY.play.minTargetSdkExisting ? ` Below API ${POLICY.play.minTargetSdkExisting}, your existing listing is also hidden from new users on newer Android versions.` : ''}`,
    fix: {
      default: [`Set targetSdk = ${reqTarget} and compileSdk = ${reqTarget}, then test the Android 16 behaviour changes (edge-to-edge enforced, predictive back, adaptive layouts on large screens).`],
      flutter: [`android/app/build.gradle(.kts): targetSdk = ${reqTarget}; compileSdk = ${reqTarget}`, 'Upgrade Flutter (flutter upgrade) and plugins (flutter pub upgrade --major-versions); the flutter.targetSdkVersion default follows the SDK.'],
      'react-native': [`android/build.gradle: targetSdkVersion = ${reqTarget}, compileSdkVersion = ${reqTarget}`, 'Upgrade React Native (use the React Native Upgrade Helper) / Expo SDK to a release that supports API 36.'],
      'native-android': [`app/build.gradle(.kts): defaultConfig { targetSdk = ${reqTarget} }, compileSdk = ${reqTarget}`, 'Update Android Gradle Plugin and AndroidX libraries.'],
    },
    refs: [REF.playTarget], masvs: 'MASVS-CODE-1',
  });

  R.check({
    id: 'play.debuggable', group: G.upload, title: 'App is not debuggable',
    status: A.debuggable === true || A.debuggable === 'true' ? 'fail' : 'pass', severity: 'blocker',
    detail: 'android:debuggable="true" lets anyone attach a debugger and read app memory. Play Console rejects debuggable builds.',
    fix: { default: ['Build the release variant; never set android:debuggable in the manifest.'], flutter: ['flutter build appbundle --release'], 'react-native': ['./gradlew bundleRelease (not assembleDebug)'] },
    masvs: 'MASVS-RESILIENCE-4', category: 'security',
  });

  R.check({
    id: 'play.testOnly', group: G.upload, title: 'Not marked testOnly',
    status: A.testOnly === true || A.testOnly === 'true' ? 'fail' : 'pass', severity: 'blocker',
    detail: 'android:testOnly="true" builds (produced by Android Studio "Run") cannot be uploaded to Play.',
    fix: { default: ['Use Build → Generate Signed Bundle/APK or Gradle bundleRelease instead of the Run button output.'] },
  });

  R.check({
    id: 'play.frameworkDebug', group: G.upload, title: 'Framework release build (not a dev/debug build)',
    status: framework.debugBuild ? 'fail' : 'pass', severity: 'blocker',
    detail: framework.debugBuild ? `${framework.name} debug build detected: ${framework.details.join('; ')}. Debug builds are slow, expose source and often will not start without the dev server.` : 'No framework debug artefacts found.',
    fix: { default: ['Produce a release build.'], flutter: ['flutter build appbundle --release (never ship flutter build apk --debug)'], 'react-native': ['./gradlew bundleRelease — the release variant embeds index.android.bundle', 'Expo: eas build --profile production'] },
  });

  R.check({
    id: 'play.packageName', group: G.upload, title: 'Application ID is valid and not a template placeholder',
    status: !app.id ? 'fail' : /^(com\.example|com\.android\.example|org\.reactjs\.native\.example|io\.ionic\.starter|com\.yourcompany)/i.test(app.id) ? 'fail' : 'pass', severity: 'blocker',
    detail: `Package: ${app.id || '(missing)'}. Google Play rejects com.example.* packages and the ID can never change after publishing.`,
    fix: { default: ['Choose a permanent reverse-domain ID you own (e.g. com.yourcompany.app).'], flutter: ['Change applicationId in android/app/build.gradle and namespace; or use the change_app_package_name package.'], 'react-native': ['Change applicationId + namespace in android/app/build.gradle and move MainActivity/MainApplication packages.'] },
  });

  R.check({
    id: 'play.versionCode', group: G.upload, title: 'versionCode is set',
    status: app.versionCode && app.versionCode > 0 ? 'pass' : 'fail', severity: 'high',
    detail: `versionCode ${app.versionCode ?? '(missing)'}, versionName ${app.versionName || '(missing)'}. Each upload needs a higher versionCode than any previous upload (max 2100000000).`,
    fix: { default: ['Increment versionCode for every upload.'], flutter: ['pubspec.yaml: version: 1.2.3+45 (45 = versionCode)'], 'react-native': ['android/app/build.gradle: versionCode / versionName'] },
  });

  R.check({
    id: 'play.signed', group: G.upload, title: 'Package is signed',
    status: signed ? 'pass' : 'fail', severity: 'blocker',
    detail: signed ? `Signature schemes: ${['v1', 'v2', 'v3', 'v3.1'].filter((_, i) => [signing.v1, signing.v2, signing.v3, signing.v31][i]).join(', ')}${signing.subjects.length ? ` · signer: ${signing.subjects.join(', ')}` : ''}` : 'No signature found. Play only accepts bundles signed with your upload key.',
    fix: { default: ['Create an upload keystore (keytool) and configure signingConfigs.release; never commit the keystore.'] },
    refs: [REF.appSigning], masvs: 'MASVS-RESILIENCE-2', category: 'security',
  });

  R.check({
    id: 'play.debugCert', group: G.upload, title: 'Not signed with the Android debug certificate',
    status: signing.debugCert ? 'fail' : signed ? 'pass' : 'na', severity: 'blocker',
    detail: 'The package is signed with "CN=Android Debug". Play rejects it, and the debug key is public on every developer machine.',
    fix: { default: ['Generate an upload key: keytool -genkeypair -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload', 'Reference it from signingConfigs.release using environment variables or a git-ignored key.properties.'], flutter: ['Follow docs.flutter.dev/deployment/android#sign-the-app (key.properties + signingConfigs).'], 'react-native': ['Follow reactnative.dev/docs/signed-apk-android (gradle.properties in ~/.gradle, not the repo).'] },
    refs: [REF.appSigning], masvs: 'MASVS-RESILIENCE-2', category: 'security',
  });

  if (!isAab) {
    R.check({
      id: 'play.sigScheme', group: G.build, title: 'Modern signature scheme (v2+)',
      status: !signed ? 'na' : signing.v2 || signing.v3 ? 'pass' : 'warn', severity: 'medium',
      detail: 'v1 (JAR) signing alone does not protect the whole file and is not enough for Android 11+ when targeting API 30+.',
      fix: { default: ['Use apksigner (AGP does this by default) — enable v2/v3 signing.'] }, masvs: 'MASVS-RESILIENCE-2', category: 'security',
    });
  }

  const has64 = abis.includes('arm64-v8a') || abis.includes('x86_64');
  const has32arm = abis.includes('armeabi-v7a') || abis.includes('armeabi');
  R.check({
    id: 'play.64bit', group: G.upload, title: '64-bit native code provided',
    status: !libs.length ? 'na' : abis.includes('arm64-v8a') || (!has32arm && has64) ? 'pass' : 'fail', severity: 'blocker',
    detail: libs.length ? `ABIs: ${abis.join(', ')}` : 'No native libraries.',
    fix: { default: ['Include arm64-v8a for every native library (abiFilters / ndk { abiFilters "arm64-v8a", "armeabi-v7a" }).'], flutter: ['flutter build appbundle builds arm64 by default; do not pass --target-platform android-arm only.'] },
    refs: [REF.sixtyFour],
  });

  const bad16 = nativeLibs.filter((l) => l.ok16k === false);
  const badZip16 = nativeLibs.filter((l) => l.zipAligned16k === false);
  R.check({
    id: 'play.16kb', group: G.upload, title: '16 KB memory page size support',
    status: !nativeLibs.some((l) => l.ok16k !== null) ? 'na' : bad16.length || badZip16.length ? 'fail' : 'pass', severity: targetSdk >= 35 ? 'blocker' : 'high',
    detail: bad16.length || badZip16.length
      ? `${bad16.length} 64-bit librar${bad16.length === 1 ? 'y has' : 'ies have'} LOAD segments aligned below 16 KB${badZip16.length ? ` and ${badZip16.length} uncompressed librar${badZip16.length === 1 ? 'y is' : 'ies are'} not 16 KB zip-aligned` : ''}. Google Play requires 16 KB support for apps targeting Android 15+ and blocks such updates.`
      : 'All 64-bit native libraries are 16 KB aligned.',
    evidence: [...bad16.map((l) => `${l.path} (align ${l.align})`), ...badZip16.map((l) => `${l.path} (zip offset not 16 KB aligned)`)],
    fix: {
      default: ['Upgrade to AGP 8.5.1+ and NDK r28+ (16 KB by default); for older NDKs link with -Wl,-z,max-page-size=16384.', 'Update every SDK that ships .so files to its 16 KB-compatible version; test on the 16 KB Android emulator image.'],
      flutter: ['Upgrade Flutter to a release with 16 KB support (3.32+) and update plugins that bundle native code.'],
      'react-native': ['Upgrade to React Native 0.77+ (Expo SDK 53+), then update native dependencies.'],
      unity: ['Use a Unity version with 16 KB support (2021.3.48f1+/2022.3.56f1+/Unity 6000.0.38f1+).'],
    },
    refs: [REF.page16k],
  });

  // Exported components without explicit attribute (target 31+ install failure)
  const missingExported = Object.values(components).flat().filter((c) => c.hasFilters && !c.explicitExported);
  R.check({
    id: 'play.exportedExplicit', group: G.upload, title: 'android:exported declared on components with intent filters',
    status: targetSdk < 31 ? 'na' : missingExported.length ? 'fail' : 'pass', severity: 'blocker',
    detail: 'Apps targeting Android 12+ must declare android:exported on every activity, service or receiver with an intent filter, or the install fails and Play rejects the upload.',
    evidence: missingExported.map((c) => c.name),
    fix: { default: ['Add android:exported="true|false" to each listed component (check merged manifest — often from old libraries).'] }, refs: [REF.exported],
  });

  // ---------- policy ----------
  const restricted = permissions.filter((p) => p.level === 'restricted');
  R.check({
    id: 'play.restrictedPerms', group: G.policy, title: 'Restricted permissions need a Play Console declaration',
    status: restricted.length ? 'warn' : 'pass', severity: 'high',
    detail: restricted.length ? 'These permissions trigger policy review. Without an approved declaration (and a core-functionality justification) the release is rejected.' : 'No restricted permissions requested.',
    evidence: restricted.map((p) => `${p.name.replace('android.permission.', '')} — ${p.note}`),
    fix: { default: ['Remove permissions you do not strictly need (check merged manifest; use tools:node="remove" for library permissions).', 'For the rest, complete App content → Sensitive permissions declarations in Play Console with a demo video.'] },
    refs: [REF.permissions], category: 'privacy', masvs: 'MASVS-PRIVACY-1',
  });

  const adId = permissions.some((p) => p.name === 'com.google.android.gms.permission.AD_ID') || sdks.some((s) => s.ads);
  R.check({
    id: 'play.adId', group: G.policy, title: 'Advertising ID declaration',
    status: adId ? 'info' : 'pass', severity: 'info',
    detail: adId ? 'The app uses the Advertising ID (AD_ID permission or an ads/attribution SDK). You must complete App content → Advertising ID and the Ads declaration.' : 'No Advertising ID usage detected.',
    evidence: sdks.filter((s) => s.ads).map((s) => s.name),
    fix: { default: ['Play Console → Policy → App content → Advertising ID: declare usage and purpose.', 'If you do not use it, remove it: <uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove"/>'] },
    category: 'privacy',
  });

  const fgs = components.service.filter((s) => s.foregroundServiceType);
  R.check({
    id: 'play.fgs', group: G.policy, title: 'Foreground service types declared',
    status: fgs.length && targetSdk >= 34 ? 'info' : 'pass', severity: 'info',
    detail: fgs.length ? 'Android 14+ requires each foreground service type to be declared in Play Console (App content → Foreground service permissions) with a description and video.' : 'No typed foreground services.',
    evidence: fgs.map((s) => `${s.name} (${s.foregroundServiceType})`),
  });

  R.check({
    id: 'play.dataSafety', group: G.policy, title: 'Data safety form matches SDKs & permissions',
    status: 'info', severity: 'info',
    detail: `Detected ${sdks.filter((s) => s.data.length).length} data-collecting SDK(s) and ${permissions.filter((p) => p.level !== 'normal').length} sensitive permission(s). Your Data safety answers must include what these SDKs collect — see the Privacy & data page for a draft.`,
    refs: [REF.dataSafety], category: 'privacy',
  });

  // ---------- security ----------
  const allowBackup = A.allowBackup;
  R.check({
    id: 'sec.backup', group: G.security, title: 'Sensitive data excluded from backups',
    status: allowBackup === false || allowBackup === 'false' ? 'pass' : A.dataExtractionRules || A.fullBackupContent ? 'pass' : 'warn', severity: 'medium',
    detail: allowBackup === undefined ? 'android:allowBackup is not set (defaults to true) and no backup rules exist — app data, tokens and databases can be extracted via adb backup / cloud backup.' : allowBackup === true || allowBackup === 'true' ? 'allowBackup="true" without dataExtractionRules — sensitive files are included in backups.' : 'Backups disabled or scoped with rules.',
    fix: { default: ['Set android:allowBackup="false", or add android:dataExtractionRules (API 31+) and android:fullBackupContent that exclude tokens, databases and keys.'] },
    refs: [REF.backup], masvs: 'MASVS-STORAGE-2', category: 'security',
  });

  const cleartext = A.usesCleartextTraffic;
  R.check({
    id: 'sec.cleartext', group: G.security, title: 'Cleartext (HTTP) traffic disabled',
    status: cleartext === true || cleartext === 'true' ? 'fail' : 'pass', severity: 'high',
    detail: cleartext === true || cleartext === 'true' ? 'usesCleartextTraffic="true" allows unencrypted HTTP to any host — credentials and tokens can be intercepted.' : A.networkSecurityConfig ? 'A network security config is present — review it for cleartextTrafficPermitted and user-added CA trust.' : 'Cleartext disabled by default (targetSdk 28+).',
    fix: { default: ['Remove usesCleartextTraffic; if a legacy host needs HTTP, allow only that domain in res/xml/network_security_config.xml.'], 'react-native': ['RN templates enable cleartext only in debug — make sure it is not in src/main/AndroidManifest.xml.'] },
    refs: [REF.cleartext], masvs: 'MASVS-NETWORK-1', category: 'security',
  });

  const http = scanner.httpList();
  R.check({
    id: 'sec.httpUrls', group: G.security, title: 'No hard-coded http:// endpoints',
    status: http.length ? 'warn' : 'pass', severity: 'low',
    detail: http.length ? `${http.length} host(s) referenced over plain HTTP. Some may be harmless (licences, docs) — make sure no API, auth or media endpoint uses HTTP.` : 'No insecure URLs found.',
    evidence: http.slice(0, 15).map((h) => `${h.host} ×${h.count} (${h.files[0]})`), masvs: 'MASVS-NETWORK-1', category: 'security',
  });

  const exportedUnprotected = [...components.activity, ...components.service, ...components.receiver, ...components.provider].filter((c) => c.exported && !c.permission && !c.launcher);
  R.check({
    id: 'sec.exported', group: G.security, title: 'Exported components are protected',
    status: exportedUnprotected.length ? 'warn' : 'pass', severity: exportedUnprotected.some((c) => components.provider.includes(c)) ? 'high' : 'medium',
    detail: exportedUnprotected.length ? 'Other apps can start these components or read these providers. Validate every incoming Intent/URI, or protect them with a signature permission.' : 'Only the launcher entry point is exported.',
    evidence: exportedUnprotected.map((c) => c.name),
    fix: { default: ['Set android:exported="false" unless another app must call it; otherwise add android:permission with protectionLevel="signature" and validate extras.'] },
    masvs: 'MASVS-PLATFORM-1', category: 'security',
  });

  const secrets = scanner.secretList();
  const realSecrets = secrets.filter((s) => s.severity !== 'review');
  R.check({
    id: 'sec.secrets', group: G.security, title: 'No secrets embedded in the app',
    status: realSecrets.length ? 'fail' : 'pass', severity: realSecrets.some((s) => s.severity === 'blocker') ? 'blocker' : 'high',
    detail: realSecrets.length ? 'Server-side secrets were found in the package. Anything inside an APK/AAB can be extracted in minutes with apktool/jadx — rotate these keys now and move the calls behind your backend.' : 'No server-side secrets detected.',
    evidence: realSecrets.map((s) => `${s.label}: ${s.masked} (${s.files.slice(0, 2).join(', ')})`),
    fix: { default: ['Rotate/revoke each key immediately.', 'Move secret-bearing calls to your server or a serverless function; the app authenticates users, the server holds the key.', 'See the Keys & secrets page for what can and cannot ship.'] },
    masvs: 'MASVS-STORAGE-1', category: 'security',
  });
  const reviewKeys = secrets.filter((s) => s.severity === 'review');
  R.check({
    id: 'sec.clientKeys', group: G.security, title: 'Client API keys are restricted',
    status: reviewKeys.length ? 'info' : 'pass', severity: 'info',
    detail: reviewKeys.length ? 'Client-side identifiers (e.g. Google/Firebase API keys) are expected in apps, but must be restricted to your package name + SHA-256 certificate and to the APIs you use. Protect backends with Firebase App Check / Play Integrity.' : 'No client API keys found.',
    evidence: reviewKeys.map((s) => `${s.label}: ${s.masked}`), category: 'security', masvs: 'MASVS-AUTH-1',
  });

  const sensitive = findSensitiveFiles(names);
  const sensBad = sensitive.filter((s) => s.severity !== 'info');
  R.check({
    id: 'sec.files', group: G.security, title: 'No keystores, keys or config secrets packaged',
    status: sensBad.length ? 'fail' : 'pass', severity: sensBad.some((s) => s.severity === 'blocker') ? 'blocker' : sensBad.some((s) => s.severity === 'high') ? 'high' : 'medium',
    detail: sensBad.length ? 'Files that must stay on your machine/CI were bundled into the package.' : 'No sensitive files packaged.',
    evidence: sensBad.map((s) => `${s.path} — ${s.what}`),
    fix: { default: ['Remove them from assets/res, add them to .gitignore and to packaging excludes (packaging { resources { excludes += ... } }).', 'If a keystore leaked, contact Play support to reset the upload key.'] },
    masvs: 'MASVS-STORAGE-1', category: 'security',
  });

  const r8 = scanner.has(RM.r8);
  const debugMode = scanner.has(RM.debugMode) && !scanner.has(RM.releaseMode);
  const dexPresent = names.some((n) => /^classes\d*\.dex$/.test(n));
  R.check({
    id: 'sec.obfuscation', group: G.security, title: 'Code shrinking & obfuscation (R8) enabled',
    status: !dexPresent ? 'na' : debugMode ? 'fail' : r8 ? 'pass' : 'warn', severity: debugMode ? 'high' : 'medium',
    detail: debugMode ? 'DEX was compiled in debug mode.' : r8 ? 'R8 marker found (minified release).' : 'No R8 marker — code is likely not shrunk or obfuscated, which makes reverse engineering trivial and increases size.',
    fix: { default: ['buildTypes.release { isMinifyEnabled = true; isShrinkResources = true; proguardFiles(...) }'], flutter: ['flutter build appbundle --obfuscate --split-debug-info=build/symbols (keep symbols to de-obfuscate crashes)'], 'react-native': ['android/app/build.gradle: def enableProguardInReleaseBuilds = true'] },
    refs: [REF.r8], masvs: 'MASVS-RESILIENCE-3', category: 'security',
  });

  const webRisk = [];
  if (scanner.has(RM.webviewDebug)) webRisk.push('setWebContentsDebuggingEnabled (ensure it is only called in debug)');
  if (scanner.has(RM.jsInterface)) webRisk.push('addJavascriptInterface (only expose to trusted, HTTPS origins)');
  if (scanner.has(RM.fileAccessUrls)) webRisk.push('setAllowUniversalAccessFromFileURLs');
  if (scanner.has(RM.sslErrorProceed)) webRisk.push('onReceivedSslError override (never call handler.proceed())');
  R.check({
    id: 'sec.webview', group: G.security, title: 'WebView hardening',
    status: webRisk.length ? 'warn' : 'pass', severity: 'low',
    detail: webRisk.length ? 'Risky WebView APIs are referenced (possibly by SDKs). Review that they are not reachable with untrusted content. Google Play also flags apps that call handler.proceed() on SSL errors.' : 'No risky WebView APIs referenced.',
    evidence: webRisk, masvs: 'MASVS-PLATFORM-2', category: 'security',
  });

  R.check({
    id: 'sec.hostname', group: G.security, title: 'TLS hostname verification not disabled',
    status: scanner.has(RM.allowAllHostnames) || scanner.has(RM.allowAllHostnames2) ? 'fail' : 'pass', severity: 'high',
    detail: 'AllowAllHostnameVerifier accepts any certificate hostname — trivial man-in-the-middle. Google Play blocks apps with unsafe hostname verifiers.',
    masvs: 'MASVS-NETWORK-1', category: 'security',
  });

  const pinning = sdks.some((s) => s.security === 'pinning') || !!A.networkSecurityConfig;
  R.check({
    id: 'sec.pinning', group: G.security, title: 'Certificate pinning (high-risk apps)',
    status: pinning ? 'pass' : 'info', severity: 'info',
    detail: pinning ? 'Pinning library or network security config detected.' : 'No pinning detected. Recommended for banking, payments, health and enterprise apps (network_security_config <pin-set> or OkHttp CertificatePinner).',
    masvs: 'MASVS-NETWORK-2', category: 'security',
  });
  const integrity = sdks.some((s) => s.security === 'integrity');
  R.check({
    id: 'sec.integrity', group: G.security, title: 'App/device integrity attestation',
    status: integrity ? 'pass' : 'info', severity: 'info',
    detail: integrity ? 'Play Integrity / App Check detected.' : 'No Play Integrity API or Firebase App Check detected. Use them so your backend can reject modified apps and emulators.',
    masvs: 'MASVS-RESILIENCE-1', category: 'security',
  });
  const secureStore = sdks.some((s) => s.security === 'storage');
  R.check({
    id: 'sec.storage', group: G.security, title: 'Tokens stored with Android Keystore',
    status: secureStore ? 'pass' : 'info', severity: 'info',
    detail: secureStore ? 'Encrypted storage library detected.' : 'No Keystore-backed storage library detected. Store tokens with Android Keystore (or flutter_secure_storage / react-native-keychain), never in SharedPreferences/AsyncStorage in plain text.',
    masvs: 'MASVS-STORAGE-1', category: 'security',
  });

  R.check({
    id: 'sec.minSdk', group: G.build, title: 'Minimum SDK is reasonably recent',
    status: minSdk >= 24 ? 'pass' : 'warn', severity: 'low',
    detail: `minSdkVersion ${minSdk}. Android < 7.0 lacks network security config and v2 signature checks; many current libraries require 23–24+.`,
    masvs: 'MASVS-CODE-1', category: 'security',
  });

  if (scanner.has(RM.dynamicCode)) {
    R.check({
      id: 'sec.dynamicCode', group: G.policy, title: 'Dynamic code loading',
      status: 'warn', severity: 'medium',
      detail: 'DexClassLoader is referenced. Downloading executable code from outside Google Play violates the Device and Network Abuse policy (JS/OTA updates such as CodePush/EAS Update are allowed if they do not change the app\'s primary purpose).',
      category: 'store',
    });
  }

  const autoVerify = deepLinks.filter((d) => (d.scheme === 'https' || d.scheme === 'http'));
  R.check({
    id: 'play.appLinks', group: G.build, title: 'App Links verified (autoVerify)',
    status: !autoVerify.length ? 'na' : autoVerify.every((d) => d.autoVerify) ? 'pass' : 'warn', severity: 'low',
    detail: 'http(s) deep links without android:autoVerify="true" show a disambiguation dialog and can be hijacked by other apps. Host /.well-known/assetlinks.json with your Play App Signing SHA-256.',
    evidence: autoVerify.filter((d) => !d.autoVerify).map((d) => `${d.scheme}://${d.hosts.join(',')} → ${d.component}`), masvs: 'MASVS-PLATFORM-1', category: 'security',
  });

  R.check({
    id: 'play.devVerification', group: G.policy, title: 'Android developer verification (sideloading & all stores)',
    status: 'info', severity: 'info',
    detail: 'From 30 Sep 2026, apps installed on certified Android devices in Brazil, Indonesia, Singapore and Thailand must be registered by a verified developer, expanding globally in 2027. Register this package name in Play Console or the Android Developer Console — including APKs you distribute outside Play.',
    refs: [REF.devVerify],
  });

  if (['cordova', 'capacitor'].includes(fw)) {
    R.check({ id: 'play.webWrapper', group: G.policy, title: 'WebView-wrapper minimum functionality', status: 'warn', severity: 'medium', detail: 'Hybrid web apps are frequently rejected for minimum functionality / spam if they only wrap a website. Make sure the app offers native value and owns the content it loads.' });
  }

  const bd = sizeBreakdown(files, 'android', (e) => logicalName(e.name, isAab));
  const total = files.reduce((s, e) => s + e.compressedSize, 0);
  R.check({
    id: 'play.size', group: G.build, title: 'Download size within Play limits',
    status: total > 200 * 1024 * 1024 ? 'warn' : 'pass', severity: 'medium',
    detail: `Compressed package size ${(total / 1048576).toFixed(1)} MB. Play's compressed download limit for the base module is 200 MB; use Play Asset Delivery or Play Feature Delivery for larger content.`,
  });

  progress('Done', 1);
  return {
    platform: 'android', format, fileName: file.name, fileSize: file.size,
    app, framework, languages, permissions, features, components, deepLinks, metaData,
    abis, nativeLibs, signing, sdks, secrets, http, sensitiveFiles: sensitive,
    sizeBreakdown: bd, largest: largestFiles(files),
    checks: R.checks, issues: R.issues(),
    stats: { files: files.length, scannedBytes: scanner.bytesScanned, durationMs: Date.now() - t0 },
  };
}
