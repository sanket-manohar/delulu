// SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyzers/index.js';
import { buildZip } from '../src/core/zipwriter.js';
import { encodeAxml } from '../src/core/axml.js';
import { sampleApk, sampleIpa, buildElf, buildMacho, plistXml } from '../src/core/samples.js';
import { buildPages } from '../src/report/pages.js';
import { pageToMarkdown } from '../src/report/markdown.js';
import { frameworkKey } from '../src/report/frameworks.js';

const file = (bytes, name) => new File([bytes], name);
const ids = (r, sev) => r.issues.filter((i) => !sev || i.severity === sev).map((i) => i.id);

/** Fake APK Signature Scheme v2 block (structure only). */
function v2Block() {
  const value = new Uint8Array(16);
  const pair = new Uint8Array(8 + 4 + value.length);
  const pv = new DataView(pair.buffer);
  pv.setBigUint64(0, BigInt(4 + value.length), true); pv.setUint32(8, 0x7109871a, true); pair.set(value, 12);
  const size = pair.length + 8 + 16;
  const out = new Uint8Array(8 + size);
  const ov = new DataView(out.buffer);
  ov.setBigUint64(0, BigInt(size), true); out.set(pair, 8);
  ov.setBigUint64(8 + pair.length, BigInt(size), true);
  out.set(new TextEncoder().encode('APK Sig Block 42'), 16 + pair.length);
  return out;
}

function cleanApk() {
  const manifest = encodeAxml({
    tag: 'manifest', attrs: { package: 'in.good.app', versionCode: 3, versionName: '1.0.2' },
    children: [
      { tag: 'uses-sdk', attrs: { minSdkVersion: 26, targetSdkVersion: 36 }, children: [] },
      { tag: 'uses-permission', attrs: { name: 'android.permission.INTERNET' }, children: [] },
      { tag: 'application', attrs: { label: 'Good', allowBackup: false }, children: [
        { tag: 'activity', attrs: { name: 'in.good.app.Main', exported: true }, children: [
          { tag: 'intent-filter', attrs: {}, children: [
            { tag: 'action', attrs: { name: 'android.intent.action.MAIN' }, children: [] },
            { tag: 'category', attrs: { name: 'android.intent.category.LAUNCHER' }, children: [] },
          ] },
        ] },
      ] },
    ],
  });
  return buildZip([
    { name: 'AndroidManifest.xml', data: manifest },
    { name: 'classes.dex', data: 'dex\n035\0~~R8{"compilation-mode":"release"}\0okhttp3/CertificatePinner\0com/google/android/play/core/integrity\0androidx/security/crypto' },
    { name: 'lib/arm64-v8a/libnative.so', data: buildElf({ align: 16384 }), align: 16384 },
    { name: 'META-INF/CERT.RSA', data: new Uint8Array([0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, 4, 71, 111, 111, 100]) },
  ], { prefix: v2Block() });
}

test('android sample: detects Flutter and the expected Play blockers', async () => {
  const r = await analyze(file(sampleApk(), 'sample.apk'));
  assert.equal(r.platform, 'android');
  assert.equal(r.framework.id, 'flutter');
  assert.equal(r.app.targetSdk, 34);
  for (const id of ['play.targetSdk', 'play.debugCert', 'play.exportedExplicit', 'sec.secrets']) assert.ok(ids(r, 'blocker').includes(id), id);
  for (const id of ['play.16kb', 'play.restrictedPerms', 'sec.cleartext', 'sec.files']) assert.ok(ids(r).includes(id), id);
  assert.ok(r.sdks.some((s) => s.name === 'Razorpay'));
  assert.equal(r.summary.ready, false);
});

test('android: clean build has no blockers and passes key checks', async () => {
  const r = await analyze(file(cleanApk(), 'good.apk'));
  assert.deepEqual(ids(r, 'blocker'), []);
  const st = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
  assert.equal(st['play.targetSdk'], 'pass');
  assert.equal(st['play.16kb'], 'pass');
  assert.equal(st['play.signed'], 'pass');
  assert.equal(st['play.sigScheme'], 'pass');
  assert.equal(st['sec.obfuscation'], 'pass');
  assert.equal(st['sec.pinning'], 'pass');
  assert.equal(r.framework.id, 'native-android');
  assert.equal(r.summary.ready, true);
});

test('ios sample: detects React Native and ITMS blockers', async () => {
  const r = await analyze(file(sampleIpa(), 'sample.ipa'));
  assert.equal(r.platform, 'ios');
  assert.equal(r.framework.id, 'react-native');
  for (const id of ['asc.sdk', 'asc.purposeStrings', 'asc.privacyManifest', 'asc.uiwebview', 'asc.getTaskAllow', 'asc.fwArchs', 'asc.ipadOrientation', 'sec.secrets']) {
    assert.ok(ids(r, 'blocker').includes(id), id);
  }
  assert.ok(ids(r).includes('asc.att'));
  assert.ok(ids(r).includes('asc.siwa'));
  assert.equal(r.checks.find((c) => c.id === 'asc.purposeStrings').itms, 'ITMS-90683');
});

test('ios: clean native Swift build passes upload validation', async () => {
  const app = 'Payload/Good.app/';
  const ipa = buildZip([
    { name: app + 'Info.plist', data: plistXml({ CFBundleIdentifier: 'in.good.ios', CFBundleExecutable: 'Good', CFBundleShortVersionString: '1.0', CFBundleVersion: '5', MinimumOSVersion: '16.0', DTSDKName: 'iphoneos26.1', DTXcode: '2610', DTPlatformName: 'iphoneos', UIDeviceFamily: [1], UILaunchStoryboardName: 'Launch', CFBundleIconName: 'AppIcon', CFBundleIcons: {}, ITSAppUsesNonExemptEncryption: false, NSCameraUsageDescription: 'Used to scan the QR code printed on your event ticket.' }) },
    { name: app + 'Good', data: buildMacho({ minos: '16.0', sdk: '26.1', payload: '\0AVCaptureDevice\0NSUserDefaults\0SwiftUI\0/usr/lib/swift/libswiftCore.dylib\0' }) },
    { name: app + 'PrivacyInfo.xcprivacy', data: plistXml({ NSPrivacyTracking: false, NSPrivacyAccessedAPITypes: [{ NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] }] }) },
    { name: app + '_CodeSignature/CodeResources', data: plistXml({}) },
    { name: app + 'Assets.car', data: new Uint8Array(32) },
    { name: app + 'embedded.mobileprovision', data: plistXml({ Name: 'App Store', ExpirationDate: new Date(Date.now() + 1e10), Entitlements: { 'application-identifier': 'T1.in.good.ios', 'get-task-allow': false } }) },
  ]);
  const r = await analyze(file(ipa, 'good.ipa'));
  assert.deepEqual(ids(r, 'blocker'), []);
  assert.equal(r.framework.id, 'native-ios');
  assert.ok(r.languages.includes('Swift'));
  assert.equal(r.checks.find((c) => c.id === 'asc.profile').status, 'pass');
});

test('rejects unknown archives with guidance', async () => {
  await assert.rejects(analyze(file(buildZip([{ name: 'readme.txt', data: 'hi' }]), 'x.zip')), /Unrecognised package/);
});

test('docs: every page renders to Markdown for both platforms', async () => {
  for (const [bytes, name] of [[sampleApk(), 'a.apk'], [sampleIpa(), 'b.ipa']]) {
    const report = await analyze(file(bytes, name));
    const pages = buildPages({ report, fw: frameworkKey(report), appType: 'finance' });
    assert.ok(pages.length >= 10);
    for (const p of pages) {
      const md = pageToMarkdown(p, {});
      assert.ok(md.startsWith(`# ${p.icon} ${p.title}`));
      assert.ok(!md.includes('undefined'), `${p.id} contains "undefined"`);
    }
  }
  const generic = buildPages({ report: null, fw: 'expo', appType: 'kids' });
  assert.deepEqual(generic.map((p) => p.id), ['keys', 'compliance', 'play', 'appstore', 'roadmap', 'policies']);
});
