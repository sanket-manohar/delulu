// SPDX-License-Identifier: MIT
// Generates small synthetic APK / IPA files with realistic problems so anyone can try the analyzer
// without uploading a real app. Fake credential strings are assembled at runtime so this source file
// never contains anything that looks like a real secret.

import { buildZip } from './zipwriter.js';
import { encodeAxml } from './axml.js';

const enc = new TextEncoder();
const concat = (...parts) => {
  const bs = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p));
  const out = new Uint8Array(bs.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of bs) { out.set(b, o); o += b.length; }
  return out;
};
const rnd = (n, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') => Array.from({ length: n }, (_, i) => chars[(i * 7 + 3) % chars.length]).join('');

export function buildElf({ machine = 183, align = 4096, payload = '' } = {}) {
  const b = new Uint8Array(64 + 56 * 2);
  const v = new DataView(b.buffer);
  b.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  v.setUint16(16, 3, true); v.setUint16(18, machine, true); v.setUint32(20, 1, true);
  v.setBigUint64(32, 64n, true); v.setUint16(52, 64, true); v.setUint16(54, 56, true); v.setUint16(56, 2, true);
  for (let i = 0; i < 2; i++) {
    const o = 64 + i * 56;
    v.setUint32(o, 1, true); v.setUint32(o + 4, i ? 6 : 5, true);
    v.setBigUint64(o + 48, BigInt(align), true);
  }
  return concat(b, payload);
}

const vEnc = (s) => { const [a, b = 0, c = 0] = s.split('.').map(Number); return (a << 16) | (b << 8) | c; };

export function buildMacho({ cpu = 0x0100000c, platform = 2, minos = '15.0', sdk = '26.0', payload = '' } = {}) {
  const h = new Uint8Array(32 + 24);
  const v = new DataView(h.buffer);
  v.setUint32(0, 0xfeedfacf, true); v.setUint32(4, cpu, true); v.setUint32(12, 2, true);
  v.setUint32(16, 1, true); v.setUint32(20, 24, true); v.setUint32(24, 0x00200085, true);
  v.setUint32(32, 0x32, true); v.setUint32(36, 24, true); v.setUint32(40, platform, true);
  v.setUint32(44, vEnc(minos), true); v.setUint32(48, vEnc(sdk), true);
  return concat(h, payload);
}

export function buildFat(slices) {
  const align = 4096;
  const header = new Uint8Array(8 + slices.length * 20);
  const v = new DataView(header.buffer);
  v.setUint32(0, 0xcafebabe); v.setUint32(4, slices.length);
  let off = align;
  const parts = [];
  slices.forEach((s, i) => {
    v.setUint32(8 + i * 20, s.cpu); v.setUint32(16 + i * 20, off); v.setUint32(20 + i * 20, s.bytes.length); v.setUint32(24 + i * 20, 12);
    parts.push({ off, bytes: s.bytes });
    off += Math.ceil(s.bytes.length / align) * align;
  });
  const out = new Uint8Array(off);
  out.set(header);
  parts.forEach((p) => out.set(p.bytes, p.off));
  return out;
}

const plistXml = (obj) => {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const val = (x) => {
    if (x === true) return '<true/>';
    if (x === false) return '<false/>';
    if (typeof x === 'number') return `<integer>${x}</integer>`;
    if (x instanceof Date) return `<date>${x.toISOString().replace(/\.\d+Z$/, 'Z')}</date>`;
    if (Array.isArray(x)) return `<array>${x.map(val).join('')}</array>`;
    if (x && typeof x === 'object') return `<dict>${Object.entries(x).map(([k, y]) => `<key>${esc(k)}</key>${val(y)}`).join('')}</dict>`;
    return `<string>${esc(x)}</string>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${val(obj)}</plist>`;
};
export { plistXml };

export function sampleApk() {
  const manifest = encodeAxml({
    tag: 'manifest', attrs: { package: 'com.acme.wallet', versionCode: 12, versionName: '1.4.0', compileSdkVersion: 34 },
    children: [
      { tag: 'uses-sdk', attrs: { minSdkVersion: 21, targetSdkVersion: 34 }, children: [] },
      ...['android.permission.INTERNET', 'android.permission.CAMERA', 'android.permission.READ_SMS', 'android.permission.READ_CONTACTS', 'com.google.android.gms.permission.AD_ID']
        .map((name) => ({ tag: 'uses-permission', attrs: { name }, children: [] })),
      {
        tag: 'application', attrs: { label: 'Acme Wallet', usesCleartextTraffic: true },
        children: [
          { tag: 'activity', attrs: { name: 'com.acme.wallet.MainActivity', exported: true }, children: [
            { tag: 'intent-filter', attrs: {}, children: [
              { tag: 'action', attrs: { name: 'android.intent.action.MAIN' }, children: [] },
              { tag: 'category', attrs: { name: 'android.intent.category.LAUNCHER' }, children: [] },
            ] },
          ] },
          { tag: 'activity', attrs: { name: 'com.acme.wallet.PayLinkActivity' }, children: [
            { tag: 'intent-filter', attrs: {}, children: [
              { tag: 'action', attrs: { name: 'android.intent.action.VIEW' }, children: [] },
              { tag: 'category', attrs: { name: 'android.intent.category.DEFAULT' }, children: [] },
              { tag: 'category', attrs: { name: 'android.intent.category.BROWSABLE' }, children: [] },
              { tag: 'data', attrs: { scheme: 'https', host: 'pay.acme.example' }, children: [] },
            ] },
          ] },
          { tag: 'provider', attrs: { name: 'com.acme.wallet.ReceiptsProvider', exported: true, authorities: 'com.acme.wallet.receipts' }, children: [] },
        ],
      },
    ],
  });
  const fakeStripe = ['sk', 'live', rnd(24)].join('_');
  const fakeGoogle = 'AI' + 'za' + rnd(35, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-');
  const dex = concat('dex\n035\0', 'Lcom/google/firebase/crashlytics/FirebaseCrashlytics;', '\0', '~~D8{"compilation-mode":"release","min-api":21}', '\0',
    'Lcom/razorpay/Checkout;', '\0', fakeStripe, '\0', 'http://api.acme-wallet.example/v1/login', '\0', 'Landroid/webkit/WebView;setWebContentsDebuggingEnabled', '\0', 'kotlin/Metadata');
  const cert = concat(new Uint8Array([0x30, 0x82, 0x01, 0x00, 0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, 13]), 'Android Debug', new Uint8Array(32));
  return buildZip([
    { name: 'AndroidManifest.xml', data: manifest },
    { name: 'classes.dex', data: dex },
    { name: 'resources.arsc', data: new Uint8Array(64) },
    { name: 'lib/arm64-v8a/libflutter.so', data: buildElf({ align: 4096 }), align: 4096 },
    { name: 'lib/arm64-v8a/libapp.so', data: buildElf({ align: 16384, payload: concat('package:firebase_analytics/firebase_analytics.dart\0', fakeGoogle, '\0') }), align: 16384 },
    { name: 'lib/armeabi-v7a/libflutter.so', data: buildElf({ machine: 40, align: 4096 }) },
    { name: 'assets/flutter_assets/AssetManifest.json', data: '{"assets/logo.png":["assets/logo.png"]}' },
    { name: 'assets/flutter_assets/.env', data: `API_BASE=https://api.acme.example\nPAYMENT_SECRET=${fakeStripe}\n` },
    { name: 'META-INF/CERT.RSA', data: cert },
    { name: 'META-INF/CERT.SF', data: 'Signature-Version: 1.0\n' },
    { name: 'META-INF/MANIFEST.MF', data: 'Manifest-Version: 1.0\n' },
    { name: 'res/drawable/ic_launcher.png', data: new Uint8Array(2048) },
  ]);
}

export function sampleIpa() {
  const app = 'Payload/AcmeShop.app/';
  const info = {
    CFBundleIdentifier: 'com.acme.shop', CFBundleDisplayName: 'Acme Shop', CFBundleExecutable: 'AcmeShop',
    CFBundleShortVersionString: '2.1.0', CFBundleVersion: '42', MinimumOSVersion: '15.1',
    DTSDKName: 'iphoneos18.2', DTPlatformName: 'iphoneos', DTXcode: '1620', DTXcodeBuild: '16C5032a',
    UIDeviceFamily: [1, 2], 'UISupportedInterfaceOrientations~ipad': ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown'],
    UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'], UILaunchStoryboardName: 'LaunchScreen', CFBundleIconName: 'AppIcon',
    CFBundleIcons: { CFBundlePrimaryIcon: { CFBundleIconName: 'AppIcon' } },
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
    NSCameraUsageDescription: 'camera', UIBackgroundModes: ['remote-notification', 'location'],
    CFBundleURLTypes: [{ CFBundleURLSchemes: ['acmeshop', 'com.googleusercontent.apps.123'] }],
  };
  const prov = concat(new Uint8Array([0x30, 0x80, 0x06, 0x09]), plistXml({
    Name: 'iOS Team Provisioning Profile: com.acme.shop', TeamName: 'Acme Inc', TeamIdentifier: ['A1B2C3D4E5'],
    ExpirationDate: new Date(Date.now() + 200 * 864e5), ProvisionedDevices: ['00008110-000A1B2C3D4E5F60'],
    Entitlements: { 'application-identifier': 'A1B2C3D4E5.com.acme.shop', 'get-task-allow': true, 'aps-environment': 'development' },
  }), new Uint8Array(16));
  const bin = buildMacho({ minos: '15.1', sdk: '18.2', payload: concat('\0CLLocationManager\0AVCaptureDevice\0NSUserDefaults\0UIWebView\0GIDSignIn\0GADMobileAds\0advertisingIdentifier\0RCTBridge\0/usr/lib/swift/libswiftCore.dylib\0') });
  const pk = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
  return buildZip([
    { name: app + 'Info.plist', data: plistXml(info) },
    { name: app + 'AcmeShop', data: bin },
    { name: app + 'main.jsbundle', data: `var API="http://shop-api.acme.example/graphql";var k="${pk}\\nMIIE";` },
    { name: app + 'embedded.mobileprovision', data: prov },
    { name: app + '_CodeSignature/CodeResources', data: plistXml({ files: {} }) },
    { name: app + 'Assets.car', data: new Uint8Array(4096) },
    { name: app + 'LaunchScreen.storyboardc/Info.plist', data: plistXml({}) },
    { name: app + 'Frameworks/hermes.framework/hermes', data: buildFat([{ cpu: 0x0100000c, bytes: buildMacho({ payload: '' }) }, { cpu: 0x01000007, bytes: buildMacho({ cpu: 0x01000007, platform: 7 }) }]) },
    { name: app + 'Frameworks/hermes.framework/Info.plist', data: plistXml({ CFBundleIdentifier: 'dev.hermesengine.iphoneos' }) },
    { name: app + 'Frameworks/SDWebImage.framework/SDWebImage', data: buildMacho({}) },
    { name: app + 'Frameworks/SDWebImage.framework/Info.plist', data: plistXml({}) },
    { name: app + 'GoogleService-Info.plist', data: plistXml({ API_KEY: 'AI' + 'za' + rnd(35), BUNDLE_ID: 'com.acme.shop' }) },
  ]);
}
