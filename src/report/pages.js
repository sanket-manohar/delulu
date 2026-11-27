// SPDX-License-Identifier: MIT
// Builds every document page (Notion-style blocks) from an analysis report + user context.

import { h2, h3, p, callout, todo, toggle, table, code, ul, ol, divider, props, bars, issue, stat, tabs, timeline, link, fmtBytes, quote } from './blocks.js';
import { FRAMEWORKS, ANDROID_BUILD, IOS_BUILD, fixFor } from './frameworks.js';
import { POLICY, POLICY_TIMELINE, LAST_REVIEWED, APP_TYPES } from '../rules/policy.js';
import { SEVERITY_ORDER, SEVERITY_LABEL } from '../analyzers/common.js';

export const SEV_ICON = { blocker: '⛔', high: '🔴', medium: '🟠', low: '🟡', info: '🔵' };
export const STATUS_ICON = { pass: '✅', fail: '❌', warn: '⚠️', info: 'ℹ️', na: '➖' };

/** Neutralise inline-markdown in values that come from the analyzed (untrusted) package. */
export const u = (v) => String(v ?? '').replace(/[\\*`[\]]/g, (c) => `\\${c}`);

const plat = (r) => (r ? (r.platform === 'ios' ? 'App Store' : 'Google Play') : '');

// ---------------------------------------------------------------- overview
function overviewPage(ctx) {
  const r = ctx.report;
  const s = r.summary;
  const blocks = [];
  blocks.push(stat([
    { label: 'Readiness score', value: `${s.score}`, sub: `Grade ${s.grade}`, tone: s.ready ? (s.counts.high ? 'orange' : 'green') : 'red' },
    { label: 'Blockers', value: s.counts.blocker, tone: s.counts.blocker ? 'red' : 'green' },
    { label: 'High risk', value: s.counts.high, tone: s.counts.high ? 'orange' : 'green' },
    { label: 'Checks passed', value: `${s.passed}/${s.applicable}` },
  ]));
  blocks.push(callout(s.ready ? (s.counts.high ? '🟠' : '🚀') : '⛔', s.ready ? (s.counts.high ? 'orange' : 'green') : 'red', `**${s.verdict}.** ${s.ready ? `No upload blockers found for ${plat(r)}.` : `${s.counts.blocker} issue(s) will make ${plat(r)} reject this build.`} Open **Issues** for fixes tailored to ${r.framework.name}.`));
  const a = r.app;
  blocks.push(h2('App identity'));
  blocks.push(props(r.platform === 'android' ? [
    ['Name', u(a.name)], ['Application ID', `\`${u(a.id)}\``], ['Version', u(`${a.versionName} (${a.versionCode})`)],
    ['Min / target SDK', `API ${a.minSdk} / API ${a.targetSdk}`], ['Compile SDK', a.compileSdk ? `API ${a.compileSdk}` : ''],
    ['Format', r.format.toUpperCase()], ['Framework', `${r.framework.name}${r.framework.details.length ? ' — ' + r.framework.details.join(', ') : ''}`],
    ['Languages', r.languages.join(', ')], ['ABIs', r.abis.join(', ') || 'none (pure JVM)'], ['Package size', fmtBytes(r.fileSize)],
    ['Signer', u(r.signing.subjects.join(', ')) || (r.signing.v1 || r.signing.v2 ? 'signed' : 'unsigned')],
  ] : [
    ['Name', u(a.name)], ['Bundle ID', `\`${u(a.id)}\``], ['Version', u(`${a.versionName} (${a.versionCode})`)],
    ['Minimum iOS', u(a.minOS)], ['Built with', u(`${a.sdk || '?'} · Xcode ${a.xcode || '?'}`)], ['Devices', a.deviceFamily.join(', ')],
    ['Framework', `${r.framework.name}${r.framework.details.length ? ' — ' + r.framework.details.join(', ') : ''}`], ['Languages', r.languages.join(', ')],
    ['Provisioning', r.provisioning ? u(`${r.provisioning.type} · ${r.provisioning.team || ''} ${r.provisioning.teamId || ''}`) : 'none'], ['Package size', fmtBytes(r.fileSize)],
  ]));
  const blockersList = r.issues.filter((i) => i.severity === 'blocker');
  if (blockersList.length) {
    blocks.push(h2(`What ${r.platform === 'ios' ? 'App Store Connect' : 'Play Console'} would tell you`));
    blocks.push(p(`If you uploaded this build today, ${plat(r)} would stop it for these reasons:`));
    blocks.push(ul(blockersList.map((i) => `⛔ ${i.itms ? `\`${i.itms}\` ` : ''}**${i.title}** — ${u(i.detail.split('. ')[0])}.`)));
  }
  const top = r.issues.filter((i) => i.severity === 'high').slice(0, 8);
  if (top.length) {
    blocks.push(h2('High-risk items to fix before launch'));
    blocks.push(ul(top.map((i) => `${SEV_ICON[i.severity]} **${i.title}** — ${u(i.detail.split('. ')[0])}.`)));
  }
  blocks.push(h2('Your release workspace'));
  blocks.push(p('Every page in the sidebar was generated from this build. Tick items as you go — progress is saved in this browser only. Export everything as Markdown, JSON or PDF from the top-right menu.'));
  blocks.push(table(['Document', 'What it covers'], [
    ['🚨 Issues', 'Every problem found, highlighted by severity with step-by-step fixes'],
    ['🧪 Store checks', `The automated checks ${plat(r)} runs on upload (${r.platform === 'ios' ? 'ITMS-9xxxx validation' : 'Play Console pre-review'})`],
    ['🔐 Security checklist', 'OWASP MASVS v2 controls, auto-verified where possible'],
    ['🔑 Keys & secrets', 'Where every key belongs — and where it must never be'],
    ['🏗️ Architecture', 'Structure, components, SDKs, size breakdown'],
    ['🧾 Privacy & data', `Draft answers for the ${r.platform === 'ios' ? 'App Privacy labels' : 'Data safety form'}`],
    ['⚖️ Compliance', 'Mandatory items by app category (kids, finance, health…)'],
    [`${r.platform === 'ios' ? '🍎 App Store' : '🤖 Play Store'} guide`, 'Every step from account to live, with your framework\'s commands'],
    ['🗺️ Road to live', 'Timeline with realistic durations'],
  ]));
  blocks.push(p(`_Analyzed ${r.stats.files} files and scanned ${fmtBytes(r.stats.scannedBytes)} in ${(r.stats.durationMs / 1000).toFixed(1)} s, entirely in your browser — the file was never uploaded._`));
  return blocks;
}

// ---------------------------------------------------------------- issues
function issuesPage(ctx) {
  const r = ctx.report;
  const blocks = [];
  if (!r.issues.length) return [callout('🎉', 'green', 'No issues found. Review the manual items in the Security and Compliance checklists before submitting.')];
  blocks.push(stat(SEVERITY_ORDER.filter((s) => s !== 'info').map((s) => ({ label: SEVERITY_LABEL[s], value: r.summary.counts[s], tone: { blocker: 'red', high: 'orange', medium: 'yellow', low: 'gray' }[s] }))));
  blocks.push(callout('💡', 'gray', '**Blocker** = the store rejects the upload or review. **High** = likely rejection or a serious security risk. **Medium/Low** = should fix before launch. Fixes are tailored to ' + r.framework.name + '.'));
  for (const sev of SEVERITY_ORDER) {
    const list = r.issues.filter((i) => i.severity === sev);
    if (!list.length) continue;
    blocks.push(h2(`${SEV_ICON[sev]} ${SEVERITY_LABEL[sev]} · ${list.length}`));
    for (const i of list) blocks.push(issue({ ...i, fixSteps: fixFor(i.fix, ctx.fw, r) }));
  }
  return blocks;
}

// ---------------------------------------------------------------- store checks
function storeChecksPage(ctx) {
  const r = ctx.report;
  const blocks = [callout(r.platform === 'ios' ? '🍎' : '🤖', 'blue', r.platform === 'ios'
    ? 'These mirror App Store Connect\'s automatic upload validation (the ITMS-9xxxx emails) and the parts of App Review that can be verified from the binary.'
    : 'These mirror the checks Play Console runs when you upload a bundle (target API, signing, 64-bit, 16 KB, manifest validity) plus policy declarations triggered by your manifest.')];
  const groups = [...new Set(r.checks.map((c) => c.group))];
  for (const g of groups) {
    const list = r.checks.filter((c) => c.group === g);
    const pass = list.filter((c) => c.status === 'pass').length;
    blocks.push(h2(`${g} · ${pass}/${list.filter((c) => c.status !== 'na' && c.status !== 'info').length} passed`));
    blocks.push(table(['', 'Check', r.platform === 'ios' ? 'Code' : 'Severity', 'Result'], list.map((c) => [
      STATUS_ICON[c.status], c.title, c.itms || (c.severity ? SEVERITY_LABEL[c.severity] : '—'), c.status === 'pass' ? 'Passed' : c.status === 'na' ? 'Not applicable' : u(c.detail.split('. ')[0]),
    ])));
  }
  blocks.push(callout('🧭', 'gray', 'Some checks only happen in the store console and cannot be verified from a binary: listing metadata, screenshots, content rating, pricing, and human App Review. The release guide covers them step by step.'));
  return blocks;
}

// ---------------------------------------------------------------- security
const MASVS = [
  ['MASVS-STORAGE', 'Storage', [
    ['No secrets or credentials hard-coded in the app', ['sec.secrets', 'sec.files']],
    ['Sensitive data excluded from device/cloud backups', ['sec.backup']],
    ['Tokens & keys stored in Android Keystore / iOS Keychain', ['sec.storage']],
    ['No sensitive data in logs, crash reports or analytics events', []],
    ['Keyboard cache, autofill and clipboard disabled for sensitive fields', []],
  ]],
  ['MASVS-CRYPTO', 'Cryptography', [
    ['Only platform crypto APIs (Keystore, CryptoKit, Tink) — no custom algorithms', []],
    ['No hard-coded encryption keys or IVs', ['sec.secrets']],
    ['Strong algorithms only: AES-GCM, ChaCha20, SHA-256+ (no MD5, SHA-1, DES, ECB)', []],
    ['Cryptographically secure randomness (SecureRandom / SecRandomCopyBytes)', []],
  ]],
  ['MASVS-AUTH', 'Authentication', [
    ['Authentication and authorization enforced on the server, never only in the app', []],
    ['Short-lived access tokens, refresh-token rotation, logout revokes server sessions', []],
    ['Biometric unlock bound to a Keystore/Keychain key (not a boolean flag)', []],
    ['Client API keys restricted to package/bundle + certificate', ['sec.clientKeys']],
  ]],
  ['MASVS-NETWORK', 'Network', [
    ['All traffic uses TLS 1.2+', ['sec.cleartext', 'sec.ats', 'sec.httpUrls']],
    ['Certificate & hostname validation never disabled', ['sec.hostname']],
    ['Certificate pinning for high-risk apps (finance, health, enterprise)', ['sec.pinning']],
  ]],
  ['MASVS-PLATFORM', 'Platform interaction', [
    ['Exported components / URL schemes validate all input', ['sec.exported']],
    ['App Links / Universal Links verified (no hijackable deep links)', ['play.appLinks']],
    ['WebViews hardened (no JS bridges to untrusted content, no SSL-error bypass)', ['sec.webview']],
    ['Sensitive screens hidden from screenshots & app switcher (FLAG_SECURE / blur)', []],
    ['Permission requests explained in context', ['asc.purposeStrings']],
  ]],
  ['MASVS-CODE', 'Code quality', [
    ['Targets the current platform level', ['play.targetSdk', 'asc.sdk']],
    ['Release build: debugging disabled', ['play.debuggable', 'asc.getTaskAllow', 'play.frameworkDebug', 'asc.frameworkDebug']],
    ['Dependencies up to date and scanned (Dependabot / OSV-Scanner)', []],
    ['Force-update mechanism to retire vulnerable versions', []],
    ['Binary hardening (PIE / stack protection)', ['sec.pie']],
  ]],
  ['MASVS-RESILIENCE', 'Resilience', [
    ['Signed with a release/distribution certificate', ['play.signed', 'play.debugCert', 'asc.signed', 'asc.profile']],
    ['Code shrinking & obfuscation', ['sec.obfuscation']],
    ['Backend verifies app integrity (Play Integrity / App Attest / App Check)', ['sec.integrity']],
    ['Root/jailbreak, hooking and debugger detection (high-risk apps)', []],
  ]],
  ['MASVS-PRIVACY', 'Privacy', [
    ['Only necessary permissions requested', ['play.restrictedPerms']],
    ['Privacy manifest / Data safety answers match real data flows', ['asc.privacyManifest', 'asc.sdkManifests', 'play.dataSafety']],
    ['Tracking only after consent (ATT, GDPR/DPDP consent)', ['asc.att']],
    ['Users can delete their account and data', ['asc.accountDeletion']],
    ['Privacy policy published and linked inside the app', []],
  ]],
];

function securityPage(ctx) {
  const r = ctx.report;
  const blocks = [callout('🛡️', 'blue', `Based on ${link('OWASP MASVS v2', 'https://mas.owasp.org/MASVS/')}. Items with evidence from your build are verified automatically; the rest need a manual review — tick them when done.`)];
  for (const [id, name, items] of MASVS) {
    blocks.push(h2(`${name} · ${id}`));
    for (const [text, ids] of items) {
      const found = r ? ids.map((i) => r.checks.find((c) => c.id === i)).filter(Boolean) : [];
      const relevant = found.filter((c) => c.status !== 'na');
      let status = 'manual';
      if (relevant.length) {
        if (relevant.some((c) => c.status === 'fail')) status = 'fail';
        else if (relevant.some((c) => c.status === 'warn')) status = 'warn';
        else if (relevant.every((c) => c.status === 'pass')) status = 'pass';
      }
      blocks.push(todo(`masvs:${id}:${text.slice(0, 40)}`, text, { status, note: u(relevant.filter((c) => c.status !== 'pass').map((c) => c.detail.split('. ')[0]).join(' · ')) }));
    }
  }
  return blocks;
}

// ---------------------------------------------------------------- keys & secrets
function keysPage(ctx) {
  const r = ctx.report;
  const fw = ctx.fw || 'flutter';
  const blocks = [];
  blocks.push(callout('🔑', 'red', '**Golden rule:** anything inside an APK, AAB or IPA is public. Decompilers (jadx, apktool, Hopper, strings) read embedded keys in minutes — obfuscation does not hide strings. If a key lets someone spend your money or read other users\' data, it belongs on a server.'));
  if (r) {
    const sec = r.secrets || [];
    const files = (r.sensitiveFiles || []).filter((f) => f.severity !== 'info');
    if (sec.length || files.length) {
      blocks.push(h2('Found in your build'));
      blocks.push(table(['Finding', 'Value / file', 'Risk'], [
        ...sec.map((s) => [s.label, `\`${u(s.masked)}\` in ${u(s.files.slice(0, 2).join(', '))}`, s.severity === 'review' ? 'Restrict it' : SEVERITY_LABEL[s.severity] || s.severity]),
        ...files.map((f) => [f.what, `\`${u(f.path)}\``, SEVERITY_LABEL[f.severity]]),
      ]));
    } else blocks.push(callout('✅', 'green', 'No hard-coded server secrets or sensitive files were found in this build.'));
  }
  blocks.push(h2('Where each key belongs'));
  blocks.push(table(['Secret', '✅ Store it in', '⛔ Never put it in'], [
    ['Android upload keystore (.jks) + passwords', 'Password manager + offline backup; CI secret (base64) for automated builds', 'Git repo, app assets, chat, email'],
    ['Play app signing key', 'Google Play (Play App Signing manages it for you)', 'Anywhere you control — let Google hold it'],
    ['Play Console service-account JSON (CI publishing)', 'CI secret store, least-privilege "Release manager" role', 'Repo, app bundle'],
    ['Apple distribution certificate (.p12) & profiles', 'Build Mac keychain, fastlane match (encrypted repo), Xcode Cloud / EAS', 'Unencrypted repo, app bundle'],
    ['App Store Connect API key (.p8)', 'CI secret (downloadable only once — back it up)', 'Repo, app bundle'],
    ['APNs auth key (.p8) / FCM service account', 'Your backend only (it sends the pushes)', 'Mobile app'],
    ['Server API keys: Stripe secret, Razorpay key_secret, OpenAI/Gemini, Twilio, SendGrid, AWS', 'Backend or serverless function env vars, AWS/GCP Secret Manager, Vault, Doppler', 'App code, bundled .env, --dart-define, react-native-config, BuildConfig, Info.plist'],
    ['Publishable / client keys: Stripe pk_, Razorpay key_id, Firebase/Maps API key, Sentry DSN', 'Can ship in the app — but restrict by package/bundle ID + SHA-256 and by API', '(Unrestricted keys anywhere)'],
    ['User session / refresh tokens', 'Android Keystore-backed storage, iOS Keychain (AfterFirstUnlockThisDeviceOnly)', 'SharedPreferences, UserDefaults, AsyncStorage, plain files, logs'],
    ['Local database encryption key', 'Generated on device, wrapped by Keystore / Keychain', 'Hard-coded constant'],
    ['Non-secret config (API base URL, feature flags)', '--dart-define, .env, BuildConfig, xcconfig — fine', '—'],
  ]));
  blocks.push(h2('Framework-specific traps'));
  blocks.push(tabs([
    { label: 'Flutter', children: [ul([
      '`flutter_dotenv` copies `.env` into **assets** — anyone can unzip it. Use it for non-secrets only.',
      '`--dart-define` / `--dart-define-from-file` values are compiled into `libapp.so` / `App.framework` and readable with `strings`.',
      '`--obfuscate` renames symbols; it does **not** encrypt string constants.',
      'Store tokens with `flutter_secure_storage` (Keystore / Keychain).',
    ])] },
    { label: 'React Native', children: [ul([
      '`react-native-config` writes values into `BuildConfig`, `Info.plist` and the JS bundle — all readable.',
      'Hermes bytecode can be decompiled (hermes-dec); never embed secrets in JS.',
      'Use `react-native-keychain` or `react-native-encrypted-storage` instead of AsyncStorage for tokens.',
    ])] },
    { label: 'Expo', children: [ul([
      '`EXPO_PUBLIC_*` variables are inlined into the JS bundle by design — public.',
      'Use **EAS environment variables / secrets** for build-time values (e.g. Sentry auth token) — they never reach the app.',
      'Use `expo-secure-store` for user tokens.',
    ])] },
    { label: 'Native Android', children: [ul([
      '`buildConfigField` and `resValue` strings end up in DEX/resources in plain text.',
      'Keep `local.properties`, `keystore.properties` and `*.jks` out of git; inject via environment variables in CI.',
      'Jetpack Security `EncryptedSharedPreferences` is deprecated — use the Android Keystore directly (or DataStore + Tink).',
    ])] },
    { label: 'Native iOS', children: [ul([
      'Values in `Info.plist` and `.xcconfig` are shipped inside the bundle.',
      'Use the Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) for tokens; CryptoKit for encryption.',
      'Never add `.p8`, `.p12` or `ExportOptions.plist` with secrets to "Copy Bundle Resources".',
    ])] },
  ]));
  blocks.push(h2('Commit-safe .gitignore'));
  blocks.push(code(`# Signing & credentials — never commit
*.jks
*.keystore
*.p12
*.p8
*.mobileprovision
key.properties
keystore.properties
local.properties
google-play-service-account*.json
service-account*.json
.env
.env.*
!.env.example
fastlane/report.xml
# Firebase configs are client identifiers; commit them only if your Security Rules are locked down
# android/app/google-services.json
# ios/Runner/GoogleService-Info.plist`, '.gitignore'));
  blocks.push(h2('Signing in CI without committing the keystore'));
  blocks.push(code(`# .github/workflows/release.yml (excerpt)
- name: Restore upload keystore
  run: echo "$UPLOAD_KEYSTORE_B64" | base64 --decode > "$RUNNER_TEMP/upload.jks"
  env:
    UPLOAD_KEYSTORE_B64: \${{ secrets.UPLOAD_KEYSTORE_B64 }}
- name: Build release bundle
  run: ${fw === 'flutter' ? 'flutter build appbundle --release' : './gradlew bundleRelease'}
  env:
    UPLOAD_STORE_FILE: \${{ runner.temp }}/upload.jks
    UPLOAD_STORE_PASSWORD: \${{ secrets.UPLOAD_STORE_PASSWORD }}
    UPLOAD_KEY_ALIAS: upload
    UPLOAD_KEY_PASSWORD: \${{ secrets.UPLOAD_KEY_PASSWORD }}`, 'GitHub Actions'));
  blocks.push(h2('If a key has leaked'));
  blocks.push(ol([
    'Revoke or rotate the key at the provider **first** — removing it from the code does not un-leak shipped builds.',
    'Check provider logs/billing for abuse since the leak.',
    'Purge it from git history (git filter-repo / BFG) and enable GitHub secret scanning + push protection.',
    'Lost or leaked Android upload key: request an upload key reset in Play Console (Setup → App signing). Leaked Apple .p12/.p8: revoke it in Certificates, Identifiers & Profiles / Users and Access → Keys.',
  ]));
  return blocks;
}

// ---------------------------------------------------------------- architecture
const ARCH_PRACTICES = {
  flutter: ['Layered structure: presentation (widgets) → application/state (Riverpod, Bloc) → domain → data (repositories, API clients).', 'Flavors (`--flavor dev|prod`) + `--dart-define-from-file` for environment config (non-secrets).', 'Feature-first folders (`lib/features/<feature>/…`), `go_router` for navigation and deep links.', 'Code generation (freezed, json_serializable) committed or generated in CI consistently.', 'Golden + integration tests (`integration_test`) running in CI on both platforms.'],
  'react-native': ['TypeScript with strict mode; feature folders (`src/features/…`).', 'New Architecture (Fabric/TurboModules) + Hermes enabled.', 'State: React Query/TanStack for server state, Zustand/Redux Toolkit for client state.', 'React Navigation with linking config for deep links.', 'OTA updates (EAS Update / self-hosted) only for JS changes that keep the app\'s purpose — Microsoft App Center/CodePush was retired in March 2025.'],
  expo: ['Expo Router (file-based routes and deep links).', 'Config plugins instead of manual native edits; `npx expo prebuild --clean` reproducible.', 'EAS Build profiles: development, preview, production; EAS Update channels per profile.', 'TypeScript strict; keep `app.config.ts` free of secrets.'],
  'native-android': ['MVVM / MVI with Jetpack ViewModel, Kotlin Coroutines + Flow.', 'Jetpack Compose UI, Navigation Compose with deep links.', 'Hilt for dependency injection; Room + DataStore for local data.', 'Modularization: `:app`, `:core:*`, `:feature:*` with convention plugins and a version catalog.', 'Baseline Profiles for startup performance; R8 full mode.'],
  'native-ios': ['MVVM or The Composable Architecture with SwiftUI; async/await + Swift Concurrency (Swift 6 strict concurrency).', 'Swift Package Manager modules per feature.', 'Keychain for secrets, SwiftData/Core Data for persistence.', 'Universal Links via Associated Domains; App Intents for Siri/Shortcuts.', 'XCTest + XCUITest in Xcode Cloud / GitHub Actions.'],
  other: ['Keep business logic in a shared, testable layer; platform code thin.', 'Use the engine\'s official release/AOT pipeline (Unity IL2CPP, MAUI AOT, Capacitor `npx cap sync`).', 'Verify each native plugin supports the current store SDK requirements.'],
};

function architecturePage(ctx) {
  const r = ctx.report;
  const blocks = [];
  blocks.push(h2('Technology stack'));
  blocks.push(props([
    ['Framework', r.framework.name], ['Details', r.framework.details.join(', ')], ['Languages', r.languages.join(', ')],
    ['Platform', r.platform === 'ios' ? `iOS ${r.app.minOS}+ (${r.app.deviceFamily.join(', ')})` : `Android API ${r.app.minSdk}–${r.app.targetSdk}`],
    ['Third-party SDKs', String(r.sdks.length)],
  ]));
  blocks.push(h2('Build composition'));
  const max = Math.max(...r.sizeBreakdown.map((b) => b.bytes), 1);
  blocks.push(bars(r.sizeBreakdown.map((b) => ({ label: b.category, value: b.bytes, max, sub: `${fmtBytes(b.bytes)} · ${b.files} file${b.files === 1 ? '' : 's'}` }))));
  blocks.push(toggle('Largest files', [table(['File', 'Size'], r.largest.map((f) => [`\`${u(f.name)}\``, fmtBytes(f.size)]))]));

  if (r.platform === 'android') {
    blocks.push(h2('Components'));
    const rows = [];
    for (const [k, list] of Object.entries(r.components)) for (const c of list) rows.push([k, `\`${u(c.name)}\``, c.launcher ? 'launcher' : c.exported ? (c.permission ? 'exported (protected)' : '**exported**') : 'internal', u(c.foregroundServiceType || c.permission || '')]);
    blocks.push(rows.length ? table(['Type', 'Name', 'Exposure', 'Notes'], rows) : p('No components declared.'));
    if (r.deepLinks.length) {
      blocks.push(h3('Deep links'));
      blocks.push(table(['Link', 'Verified', 'Handler'], r.deepLinks.map((d) => [u(`${d.scheme}://${d.hosts.join(', ') || '*'}`), d.autoVerify ? '✅ autoVerify' : '—', `\`${u(d.component)}\``])));
    }
    if (r.nativeLibs.length) {
      blocks.push(h3('Native libraries'));
      blocks.push(table(['Library', 'ABI', 'Size', '16 KB'], r.nativeLibs.map((l) => [`\`${u(l.path.split('/').pop())}\``, l.abi, fmtBytes(l.size), l.ok16k === null ? '—' : l.ok16k && l.zipAligned16k !== false ? '✅' : '❌'])));
    }
  } else {
    blocks.push(h2('Bundle structure'));
    if (r.frameworks.length) blocks.push(table(['Embedded framework', 'Archs', 'Privacy manifest', 'Size'], r.frameworks.map((f) => [u(f.name), f.archs.join(', ') || '—', f.privacyManifest ? '✅' : '—', fmtBytes(f.size)])));
    if (r.extensions.length) blocks.push(table(['App extension', 'Bundle ID', 'Type'], r.extensions.map((e) => [u(e.name), `\`${u(e.id)}\``, u(e.type)])));
    blocks.push(props([
      ['URL schemes', u(r.urlSchemes.join(', '))], ['Associated domains', u((r.associatedDomains || []).join(', '))],
      ['Background modes', u(r.backgroundModes.join(', '))], ['Required-reason APIs', r.requiredReasonApis.map((x) => x.replace('NSPrivacyAccessedAPICategory', '')).join(', ')],
    ]));
  }
  blocks.push(h2('Third-party SDKs'));
  blocks.push(r.sdks.length ? table(['SDK', 'Category', 'Typical data collected'], r.sdks.map((s) => [s.name, s.cat, s.data.join(', ') || '—'])) : p('No well-known SDKs detected.'));
  blocks.push(h2('Permissions & capabilities'));
  if (r.platform === 'android') {
    blocks.push(r.permissions.length ? table(['Permission', 'Policy level', 'Note'], r.permissions.map((x) => [`\`${u(x.name.replace('android.permission.', ''))}\``, x.level === 'restricted' ? '**restricted**' : x.level, x.note])) : p('No permissions requested.'));
  } else {
    blocks.push(r.permissions.length ? table(['Purpose key', 'Resource', 'Text shown to users'], r.permissions.map((x) => [`\`${u(x.name)}\``, x.label, `“${u(x.text)}”`])) : p('No protected resources declared.'));
  }
  const fwKey = ctx.fw || 'other';
  blocks.push(h2(`Recommended architecture — ${FRAMEWORKS[fwKey]?.label || r.framework.name}`));
  blocks.push(ul(ARCH_PRACTICES[fwKey] || ARCH_PRACTICES.other));
  return blocks;
}

// ---------------------------------------------------------------- privacy & data
const PERM_DATA = {
  'android.permission.ACCESS_FINE_LOCATION': ['Precise location', 'Location'],
  'android.permission.ACCESS_COARSE_LOCATION': ['Approximate location', 'Location'],
  'android.permission.ACCESS_BACKGROUND_LOCATION': ['Precise location', 'Location'],
  'android.permission.READ_CONTACTS': ['Contacts', 'Contacts'],
  'android.permission.CAMERA': ['Photos / videos', 'Photos or Videos'],
  'android.permission.RECORD_AUDIO': ['Voice or sound recordings', 'Audio Data'],
  'android.permission.READ_SMS': ['SMS or MMS', 'Other User Content'],
  'android.permission.READ_CALL_LOG': ['Call logs', 'Other User Content'],
  'android.permission.READ_MEDIA_IMAGES': ['Photos', 'Photos or Videos'],
  'android.permission.BODY_SENSORS': ['Health info', 'Health'],
  'android.permission.READ_CALENDAR': ['Calendar events', 'Other User Content'],
};
const IOS_DATA = { Camera: 'Photos or Videos', Microphone: 'Audio Data', 'Photo library': 'Photos or Videos', Location: 'Precise Location', Contacts: 'Contacts', HealthKit: 'Health', 'Motion & fitness': 'Fitness' };

function privacyPage(ctx) {
  const r = ctx.report;
  const rows = [];
  if (r.platform === 'android') {
    for (const pm of r.permissions) if (PERM_DATA[pm.name]) rows.push([PERM_DATA[pm.name][0], `Permission ${u(pm.name.replace('android.permission.', ''))}`, 'Collected if it leaves the device', 'App functionality']);
  } else {
    for (const pm of r.permissions) if (IOS_DATA[pm.label]) rows.push([IOS_DATA[pm.label], `${pm.name}`, 'Collected if sent off-device', 'App Functionality']);
  }
  for (const s of r.sdks) for (const d of s.data) rows.push([d, `SDK: ${s.name}`, s.ads ? 'Collected & shared' : 'Collected', s.ads ? (r.platform === 'ios' ? 'Third-Party Advertising / Tracking' : 'Advertising or marketing') : s.cat === 'Crash reporting' || s.cat === 'Monitoring' ? 'Analytics / diagnostics' : s.cat]);
  const blocks = [callout('🧾', 'yellow', `**Draft — verify before submitting.** Inferred from permissions and SDK signatures. You are legally responsible for the ${r.platform === 'ios' ? 'App Privacy "nutrition labels"' : 'Data safety form'}; include data your backend collects too.`)];
  blocks.push(h2(r.platform === 'ios' ? 'App Privacy (App Store Connect)' : 'Data safety (Play Console)'));
  blocks.push(rows.length ? table(['Data type', 'Why we think so', 'Declaration', 'Purpose'], rows) : p('No data-collecting permissions or SDKs detected. If you send any user data to a server, declare it.'));
  blocks.push(h2('Questions you must answer'));
  const qs = r.platform === 'ios'
    ? ['Do you or third-party partners collect data from this app? (SDK data counts)', 'Is each data type linked to the user\'s identity?', 'Is any data used to track users across apps/websites owned by other companies? (requires ATT)', 'Privacy policy URL (mandatory) and optional privacy choices URL.']
    : ['Does the app collect or share any required user data types?', 'Is all user data encrypted in transit?', 'Do you provide a way for users to request deletion? (web link required if accounts exist)', 'Is data collection optional or required for each type?', 'Has the app been independently security-reviewed (MASA)? — optional badge.'];
  blocks.push(...qs.map((q, i) => todo(`privacy:${i}`, q)));
  blocks.push(h2('Privacy policy must include'));
  blocks.push(ul(['Who you are and how to contact you (DPO email for GDPR / Grievance Officer for India DPDP).', 'Every data type collected, why, and which SDKs/partners receive it.', 'Retention period and deletion process (in-app and web link).', 'Children\'s data handling if minors may use the app.', 'User rights (access, correction, deletion, withdrawal of consent) by region: GDPR, CCPA/CPRA, India DPDP Act 2023.', 'Hosted on a public, non-PDF, non-geo-blocked URL, linked in the store listing and inside the app.']));
  return blocks;
}

// ---------------------------------------------------------------- compliance
const BASELINE = [
  ['both', 'Privacy policy URL live and linked in the listing and inside the app'],
  ['both', 'In-app account deletion (and a web deletion link for Play) if users can create accounts'],
  ['both', 'Working demo/review account credentials and review notes for any login or paywall'],
  ['both', 'Content rating questionnaire completed honestly (IARC / Apple age rating 4+/9+/13+/16+/18+)'],
  ['both', 'Digital goods & subscriptions use Google Play Billing / Apple In-App Purchase (except permitted external-link programs, e.g. US/EU/India user-choice billing)'],
  ['both', 'Subscriptions: clear price, period, trial terms and cancel instructions before purchase'],
  ['both', 'No misleading metadata: name, icon and screenshots reflect the real app; no "best/#1" claims or competitor names'],
  ['both', 'User-generated content: reporting, blocking and moderation'],
  ['both', 'Intellectual property: you own or licence all names, logos, music, fonts and media'],
  ['play', 'Target audience and content declared; Families policy if children are a target'],
  ['play', 'Data safety form, Ads declaration, Advertising ID declaration, Government/Financial/Health declarations as applicable'],
  ['play', 'Prominent disclosure + consent screen before collecting personal/sensitive data not obviously needed'],
  ['apple', 'Sign in with Apple or an equivalent privacy-focused login when offering third-party login (4.8)'],
  ['apple', 'App Tracking Transparency prompt before any tracking (5.1.2)'],
  ['apple', 'EU Digital Services Act trader status declared to distribute in the EU'],
  ['apple', 'Export compliance answered (ITSAppUsesNonExemptEncryption)'],
];

function compliancePage(ctx) {
  const store = ctx.report ? (ctx.report.platform === 'ios' ? 'apple' : 'play') : null;
  const keep = (s) => !store || s === 'both' || s === store;
  const t = APP_TYPES[ctx.appType] || APP_TYPES.general;
  const blocks = [{ type: 'apptype' }];
  blocks.push(h2('Mandatory for every app'));
  BASELINE.filter(([s]) => keep(s)).forEach(([s, text], i) => blocks.push(todo(`base:${i}`, `${text}${!store ? ` _(${s === 'both' ? 'both stores' : s === 'play' ? 'Google Play' : 'App Store'})_` : ''}`)));
  if (t.items.length) {
    blocks.push(h2(`${t.icon} ${t.label} — extra requirements`));
    t.items.filter((x) => keep(x.store)).forEach((x, i) => blocks.push(todo(`type:${ctx.appType}:${i}`, `${x.must ? '**Mandatory** · ' : ''}${x.text}`)));
  }
  blocks.push(h2('Regional laws to check'));
  blocks.push(table(['Region', 'Law', 'What it means for apps'], [
    ['🇮🇳 India', 'DPDP Act 2023 + DPDP Rules 2025', 'Notice & consent, verifiable parental consent for under-18s, grievance officer, breach reporting'],
    ['🇮🇳 India', 'RBI Digital Lending Directions', 'Loan apps: lender disclosure, KFS, no contact/media access'],
    ['🇪🇺 EU', 'GDPR, DSA, DMA', 'Lawful basis, consent manager (CMP) for ads, trader status, alternative billing options'],
    ['🇺🇸 US', 'COPPA, CCPA/CPRA, state privacy laws', 'Children\'s data, "Do not sell/share" choices'],
    ['🇬🇧 UK', 'UK GDPR, Age Appropriate Design Code', 'High-privacy defaults for children'],
    ['🇧🇷 Brazil', 'LGPD', 'Similar to GDPR; developer verification applies from Sep 2026'],
  ]));
  return blocks;
}

// ---------------------------------------------------------------- release guides
function blockersCallout(r, platform) {
  if (!r || r.platform !== platform) return [];
  const b = r.issues.filter((i) => i.severity === 'blocker');
  if (!b.length) return [callout('✅', 'green', 'Your uploaded build has no upload blockers for this store.')];
  return [callout('⛔', 'red', `**Your build has ${b.length} blocker(s) — fix them before step "Upload":** ${b.map((i) => i.title).join(' · ')}. See the Issues page.`)];
}

function playGuidePage(ctx) {
  const fw = ctx.fw && ANDROID_BUILD[ctx.fw] ? ctx.fw : 'flutter';
  const B = ANDROID_BUILD[fw];
  const r = ctx.report?.platform === 'android' ? ctx.report : null;
  const appId = r?.app.id || 'com.yourcompany.app';
  const step = (id, title, children, opts = {}) => toggle(title, children, { id: `play:${id}`, step: true, ...opts });
  const blocks = [{ type: 'fwpicker', platform: 'android' }, ...blockersCallout(ctx.report, 'android')];
  blocks.push(callout('🗓️', 'blue', `Typical time to live: **1–3 days** for organization accounts, **3–4 weeks** for new personal accounts (identity verification + ${POLICY.play.closedTestTesters} testers × ${POLICY.play.closedTestDays} days closed test + review).`));

  blocks.push(h2('Phase 1 · Account'));
  blocks.push(step('account', '1. Create your Google Play developer account', [
    ol([`Go to ${link('play.google.com/console/signup', 'https://play.google.com/console/signup')} and pay the one-time **US$${POLICY.play.registrationFeeUsd}** fee.`,
      'Choose **Organization** (needs a D-U-N-S number; exempt from the 14-day closed-test rule) or **Personal**.',
      'Complete identity verification (government ID; address proof for organizations) and verify a contact phone and email.',
      'Verify access to a real Android device via the Play Console mobile app (required for new accounts).']),
    todo('play:t:account', 'Developer account verified'),
  ]));
  blocks.push(step('payments', '2. Payments profile (paid apps / in-app purchases only)', [
    ul(['Setup → Payments profile: link a merchant account, bank account and tax details (GST/PAN in India, W-8BEN for US tax treaty).', 'Configure in-app products and subscriptions under Monetize after the first upload.']),
  ]));
  blocks.push(step('verify', '3. Android developer verification', [
    p('From 30 Sep 2026 apps on certified Android devices in Brazil, Indonesia, Singapore and Thailand must be registered by a verified developer (global in 2027). Play Console accounts complete this on the Home page; apps distributed only outside Play use the Android Developer Console.'),
    todo('play:t:verify', `Package \`${u(appId)}\` registered to your verified identity`),
  ]));

  blocks.push(h2('Phase 2 · Prepare the release build'));
  blocks.push(step('config', '4. App ID, version and target API', [
    ul([`Application ID \`${u(appId)}\` is permanent after the first publish — no \`com.example\`.`, `targetSdk **${POLICY.play.minTargetSdk}** and compileSdk ${POLICY.play.minTargetSdk} (required since 31 Aug 2026).`, 'Increase versionCode for every upload.']),
    code(B.version, 'Version'),
  ]));
  blocks.push(step('keystore', '5. Create an upload key (once) and keep it safe', [
    code('keytool -genkeypair -v -keystore upload-keystore.jks \\\n  -keyalg RSA -keysize 2048 -validity 10000 -alias upload', 'Terminal'),
    code(B.keystore, 'Credentials (outside git)'),
    callout('⚠️', 'orange', 'Back up the keystore and passwords in a password manager. With Play App Signing a lost upload key can be reset, but it takes days.'),
  ]));
  blocks.push(step('signing', '6. Configure release signing, R8 and shrinking', [code(B.signing, 'Signing config')]));
  blocks.push(step('build', '7. Build the Android App Bundle', [code(B.build, 'Build'), p('Test the exact release artefact on a device before uploading:'), code(B.test, 'QA build')]));
  blocks.push(step('selfcheck', '8. Run the StoreReady check on the AAB', [
    ul(['Upload the .aab here — zero blockers is the goal.', 'Test on Android 16 and on the 16 KB page-size emulator image.', 'Check edge-to-edge layouts (enforced at API 36), predictive back, and large-screen layouts.']),
    todo('play:t:selfcheck', 'StoreReady shows no blockers'),
  ]));

  blocks.push(h2('Phase 3 · Play Console setup'));
  blocks.push(step('create', '9. Create the app', [ul(['All apps → **Create app**: name (≤ 30 chars), default language, App or Game, Free or Paid (free → paid is not possible later).', 'Accept the Developer Program Policies and US export law declarations.'])]));
  blocks.push(step('content', '10. Complete "App content" declarations', [
    ...['Privacy policy URL', 'App access — demo credentials / instructions for reviewers', 'Ads — does the app contain ads?', 'Content rating — IARC questionnaire', 'Target audience and content (Families policy if under 13)', 'Data safety form (see Privacy & data page)', 'Advertising ID declaration', 'Government apps / Financial features / Health apps declarations', 'News app declaration (if applicable)', 'Sensitive permissions & foreground service declarations (with demo videos)']
      .map((x, i) => todo(`play:content:${i}`, x)),
  ]));
  blocks.push(step('listing', '11. Main store listing', [
    table(['Asset', 'Requirement'], [
      ['App name', '≤ 30 characters'], ['Short description', '≤ 80 characters'], ['Full description', '≤ 4,000 characters'],
      ['App icon', '512 × 512 PNG (32-bit, ≤ 1 MB)'], ['Feature graphic', '1024 × 500 JPG/PNG'],
      ['Phone screenshots', '2–8, 320–3840 px per side, aspect ratio up to 2:1 (at least 4 at 1080 px+ recommended for promotion)'],
      ['Tablet / Chromebook screenshots', 'Required to be featured on large screens'], ['Video', 'Optional YouTube URL, no ads, not age-restricted'],
      ['Category, tags, contact email, website', 'Required (email) / recommended'],
    ]),
    callout('🚫', 'gray', 'Avoid "best", "#1", "free" in the title, emoji spam, competitor names, or screenshots that do not show the real app — metadata policy rejections are common.'),
  ]));
  blocks.push(step('appsigning', '12. Play App Signing', [p('Enrolled by default for new apps: Google holds the app signing key, you sign uploads with your upload key. Copy the **app signing** SHA-256 into Firebase, Google Sign-In, Maps API restrictions and `assetlinks.json` — the upload key fingerprint alone breaks these in production.')]));

  blocks.push(h2('Phase 4 · Testing tracks'));
  blocks.push(step('internal', '13. Internal testing (minutes, up to 100 testers)', [ul(['Testing → Internal testing → Create release → upload the AAB.', 'Add testers by email list and share the opt-in link.', 'Use it for fast QA; it does not count toward the closed-test requirement.'])]));
  blocks.push(step('closed', `14. Closed testing — ${POLICY.play.closedTestTesters} testers × ${POLICY.play.closedTestDays} days (new personal accounts)`, [
    ul([`Personal accounts created after 13 Nov 2023 need **at least ${POLICY.play.closedTestTesters} testers opted in continuously for ${POLICY.play.closedTestDays} days** before applying for production.`, 'Recruit 15–20 to absorb drop-outs; ask for real usage and feedback (Google asks about it).', 'Then Dashboard → Apply for production access and answer the questionnaire about testing and readiness.']),
    todo('play:t:closed', 'Closed test completed and production access granted'),
  ]));
  blocks.push(step('prelaunch', '15. Review the pre-launch report', [p('Play automatically runs your build on real devices: fix crashes, ANRs, accessibility and security warnings before production.')]));

  blocks.push(h2('Phase 5 · Production & review'));
  blocks.push(step('release', '16. Create the production release', [ol(['Production → Create new release (or promote the tested release).', 'Release name and release notes per language (≤ 500 chars).', 'Choose countries/regions.', 'Optionally turn on **Managed publishing** to control the exact go-live moment.'])]));
  blocks.push(step('review', '17. Send for review', [ul(['Publishing overview → **Send changes for review**.', 'Typical review: a few hours to 3 days; new apps and new accounts can take 7 days or more.', 'Rejections arrive by email and in the Policy status page with the policy cited — fix, bump versionCode, resubmit, or appeal.'])]));
  blocks.push(step('rollout', '18. Staged rollout & monitoring', [ul(['Start at 5–20 %, watch Android vitals, then increase to 100 %.', `Stay below the bad-behaviour thresholds: user-perceived crash rate **${POLICY.play.vitals.crashRate} %**, ANR rate **${POLICY.play.vitals.anrRate} %**.`, 'Halt the rollout if crash rate spikes.'])]));
  blocks.push(step('post', '19. After launch', [ul(['Reply to reviews; keep the Data safety form current when SDKs change.', `Plan the yearly target-API bump (deadline every 31 August).`, 'Use the in-app updates API to push critical fixes.'])]));
  blocks.push(h2('Most common Play rejections'));
  blocks.push(table(['Reason', 'How to avoid'], [
    ['Data safety mismatch', 'Declare SDK data (ads, analytics, crash) and match your privacy policy'],
    ['Broken functionality / reviewers can\'t log in', 'Provide working demo credentials in App access'],
    ['Restricted permissions', 'Remove SMS/Call log/All files/Background location unless core; complete declarations'],
    ['Metadata policy', 'Accurate title, icon and screenshots; no keyword stuffing'],
    ['Deceptive behaviour / impersonation', 'Do not imply affiliation with brands or government without proof'],
    ['Missing account deletion', 'In-app option + web URL in the Data safety form'],
  ]));
  return blocks;
}

function appStoreGuidePage(ctx) {
  const fw = ctx.fw && IOS_BUILD[ctx.fw] ? ctx.fw : 'flutter';
  const B = IOS_BUILD[fw];
  const r = ctx.report?.platform === 'ios' ? ctx.report : null;
  const appId = r?.app.id || 'com.yourcompany.app';
  const step = (id, title, children, opts = {}) => toggle(title, children, { id: `ios:${id}`, step: true, ...opts });
  const blocks = [{ type: 'fwpicker', platform: 'ios' }, ...blockersCallout(ctx.report, 'ios')];
  blocks.push(callout('🗓️', 'blue', 'Typical time to live: **2–5 days** — enrollment (1–2 days, longer for organizations), TestFlight processing, and App Review (most apps reviewed within 24–48 hours).'));

  blocks.push(h2('Phase 1 · Account & agreements'));
  blocks.push(step('enroll', '1. Enroll in the Apple Developer Program', [
    ol([`Apple Account with two-factor authentication → ${link('developer.apple.com/programs/enroll', 'https://developer.apple.com/programs/enroll/')}.`, `Individual or Organization (needs a D-U-N-S number and legal authority). Fee **US$${POLICY.apple.programFeeUsd}/year** (local pricing applies; fee waivers for nonprofits, education, government).`, 'Invite your team in App Store Connect → Users and Access with least-privilege roles.']),
    todo('ios:t:enroll', 'Membership active'),
  ]));
  blocks.push(step('agreements', '2. Agreements, tax and banking', [ul(['App Store Connect → Business: accept the Free Apps agreement; the **Paid Apps** agreement + bank + tax forms are required for paid apps and IAP.', 'Declare your **EU trader status** (Digital Services Act) or the app will not be available in the EU.'])]));

  blocks.push(h2('Phase 2 · Identifiers, signing & project setup'));
  blocks.push(step('bundle', '3. Register the Bundle ID and capabilities', [ul([`Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → \`${u(appId)}\` (explicit, permanent).`, 'Enable only the capabilities you use: Push Notifications, Sign in with Apple, Associated Domains, App Groups, In-App Purchase, iCloud…'])]));
  blocks.push(step('signing', '4. Signing', [ul(['Recommended: Xcode → Signing & Capabilities → **Automatically manage signing**, select your Team.', 'CI: App Store Connect API key + fastlane match, Xcode Cloud, or EAS credentials.', 'Distribution needs an **Apple Distribution** certificate and an **App Store Connect** provisioning profile (development/ad-hoc/enterprise profiles are rejected).']), code(B.prep, 'Project prep')]));
  blocks.push(step('config', '5. Versions, SDK and deployment target', [
    ul([`Built with **Xcode ${POLICY.apple.minSdkMajor}+ / iOS ${POLICY.apple.minSdkMajor} SDK** (required since 28 Apr 2026).`, `Deployment target iOS ${POLICY.apple.minDeploymentTarget} or later (check your framework minimum, e.g. React Native 0.76+ needs 15.1).`, 'Bump the build number for every upload; the marketing version for every App Store release.']),
    code(B.version, 'Version'),
  ]));
  blocks.push(step('privacy', '6. Privacy manifest, purpose strings, icon & launch screen', [
    ...['PrivacyInfo.xcprivacy in the app target with required-reason API codes, tracking domains and collected data', 'Updated SDKs that include their own privacy manifests', 'Specific Info.plist purpose string for every permission', '1024 × 1024 App Store icon without transparency in the asset catalog', 'Launch storyboard', 'ITSAppUsesNonExemptEncryption = NO (if you only use standard HTTPS)']
      .map((x, i) => todo(`ios:prep:${i}`, x)),
  ]));

  blocks.push(h2('Phase 3 · Build, check & upload'));
  blocks.push(step('build', '7. Archive the release build', [code(B.build, 'Build')]));
  blocks.push(step('selfcheck', '8. Run the StoreReady check on the .ipa', [todo('ios:t:selfcheck', 'StoreReady shows no blockers')]));
  blocks.push(step('upload', '9. Upload to App Store Connect', [code(B.upload, 'Upload'), p('Processing takes 5–30 minutes. Validation failures arrive by email with ITMS-9xxxx codes — each StoreReady check shows the matching code.')]));

  blocks.push(h2('Phase 4 · App Store Connect record'));
  blocks.push(step('record', '10. Create the app record', [ul(['Apps → **+** → New App: platform, name (≤ 30 chars, unique on the store), primary language, Bundle ID, SKU, user access.'])]));
  blocks.push(step('info', '11. App information & age rating', [ul(['Subtitle (≤ 30), category, content rights (third-party content?).', 'Age rating questionnaire — updated system with 4+, 9+, 13+, 16+ and 18+.', 'Privacy policy URL (required for all apps).'])]));
  blocks.push(step('apppriv', '12. App Privacy', [p('Answer the data collection questions for your code and every SDK, marking data linked to the user and data used for tracking. Draft answers are on the Privacy & data page.')]));
  blocks.push(step('metadata', '13. Version page: screenshots & metadata', [
    table(['Item', 'Requirement'], [
      ['iPhone screenshots', '6.9" (1320 × 2868 or 1290 × 2796) — 1 to 10; smaller sizes scale automatically'],
      ['iPad screenshots', '13" (2064 × 2752 or 2048 × 2732) if the app runs on iPad'],
      ['App previews', 'Optional videos, 15–30 s'],
      ['Promotional text', '≤ 170 characters (editable without review)'], ['Description', '≤ 4,000 characters'],
      ['Keywords', '≤ 100 characters, comma-separated'], ['Support URL', 'Required'], ['Marketing URL', 'Optional'], ['Copyright', 'Required, e.g. "2026 Acme Inc."'],
    ]),
  ]));
  blocks.push(step('review-info', '14. App Review information', [ul(['Contact details, **demo account** with sample data (required if there is a login), notes explaining non-obvious features, background modes, hardware or regional behaviour.', 'Attach a demo video for features reviewers cannot trigger.'])]));
  blocks.push(step('pricing', '15. Pricing, availability, IAP', [ul(['Price tier, countries/regions, pre-orders optional.', 'Create in-app purchases/subscriptions and submit them with the version.'])]));

  blocks.push(h2('Phase 5 · TestFlight'));
  blocks.push(step('testflight', '16. Beta test with TestFlight', [ul(['Internal testers: up to 100 team members, no review.', 'External testers: up to 10,000 via email or public link; the first build needs Beta App Review (~24 h).', 'Builds expire after 90 days.'])]));

  blocks.push(h2('Phase 6 · Submit, review & release'));
  blocks.push(step('submit', '17. Submit for review', [ul(['Select the build, answer export compliance, choose release: manual, automatic, or scheduled.', 'Click **Add for Review → Submit**. Statuses: Waiting for Review → In Review → Pending Developer Release / Ready for Distribution.'])]));
  blocks.push(step('rejected', '18. If rejected', [ul(['Read the guideline cited in App Review messages, reply with clarification or fix and resubmit.', 'Disagree? Appeal to the App Review Board.', 'Bug-fix updates are not held for guideline issues unrelated to legal matters — you can ship the fix and address the rest in the next version.'])]));
  blocks.push(step('release', '19. Release & phased rollout', [ul(['Phased release for automatic updates rolls out over 7 days (1 %, 2 %, 5 %, 10 %, 20 %, 50 %, 100 %) and can be paused.', 'The app appears on the store usually within 24 hours after release.'])]));
  blocks.push(step('post', '20. After launch', [ul(['Monitor crashes in Xcode Organizer / your crash SDK; reply to reviews.', 'Keep App Privacy labels in sync with SDK changes.', 'Every spring Apple raises the minimum Xcode/SDK — plan an update.'])]));
  blocks.push(h2('Most common App Store rejections'));
  blocks.push(table(['Guideline', 'Why', 'How to avoid'], [
    ['2.1 App Completeness', 'Crashes, placeholder content, broken links', 'Test the exact build on devices; provide demo account'],
    ['2.3 Accurate Metadata', 'Screenshots/description don\'t match the app', 'Real screenshots; describe features honestly'],
    ['4.2 Minimum Functionality', 'Website wrapped in a WebView', 'Add native value (push, offline, device features)'],
    ['5.1.1 Data Collection', 'Vague purpose strings, forced sign-up, no account deletion', 'Specific purpose strings, allow guest use, add deletion'],
    ['5.1.2 Data Use', 'Tracking without ATT', 'Show ATT prompt before IDFA/tracking SDKs'],
    ['3.1.1 In-App Purchase', 'Digital goods sold via external payment', 'Use IAP (or permitted external-purchase entitlements)'],
    ['4.8 Login Services', 'Social login without an equivalent private option', 'Add Sign in with Apple'],
    ['4.3 Spam', 'Clone/template apps', 'Unique functionality and design'],
  ]));
  return blocks;
}

// ---------------------------------------------------------------- roadmap
function roadmapPage(ctx) {
  const r = ctx.report;
  const blockers = r ? r.issues.filter((i) => i.severity === 'blocker').length : null;
  const blocks = [];
  if (r) blocks.push(callout(blockers ? '⛔' : '🚀', blockers ? 'red' : 'green', blockers ? `You are at step **2 · Fix blockers** (${blockers} remaining).` : 'Build checks passed — you are at step **3 · Store setup**.'));
  const st = (i) => (!r ? 'todo' : i < (blockers ? 1 : 2) ? 'done' : i === (blockers ? 1 : 2) ? 'current' : 'todo');
  blocks.push(timeline([
    { title: '1 · Accounts', when: 'Day 0–2', text: 'Google Play (US$25 once) and Apple Developer Program (US$99/yr). Organization accounts need a D-U-N-S number (can take 1–2 weeks to obtain).', state: st(0) },
    { title: '2 · Fix blockers & harden', when: 'Day 1–5', text: 'Resolve StoreReady blockers, secrets, privacy manifest/purpose strings, target API, signing.', state: st(1) },
    { title: '3 · Store setup', when: 'Day 2–6', text: 'Listings, screenshots, privacy policy, Data safety / App Privacy, content rating, declarations.', state: st(2) },
    { title: '4 · Beta testing', when: 'Day 3–20', text: `Play internal → closed test (${POLICY.play.closedTestTesters} testers × ${POLICY.play.closedTestDays} days for new personal accounts). TestFlight internal/external.`, state: st(3) },
    { title: '5 · Review', when: '+1–7 days', text: 'Apple: usually 24–48 h. Google: hours to several days; longer for new accounts.', state: st(4) },
    { title: '6 · Staged rollout', when: '+7 days', text: 'Play staged rollout 5→100 %, Apple phased release over 7 days. Watch crash/ANR rates.', state: st(5) },
    { title: '7 · Live & maintain', when: 'Ongoing', text: 'Yearly: Play target API (Aug 31), Apple SDK minimum (spring). Keep privacy declarations current.', state: st(6) },
  ]));
  return blocks;
}

// ---------------------------------------------------------------- policies
function policiesPage() {
  return [
    callout('📅', 'blue', `Rules last reviewed **${LAST_REVIEWED}**. Store policies change every year — the source file \`src/rules/policy.js\` is the single place to update, and pull requests are welcome.`),
    table(['Store', 'Requirement', 'Effective', 'Status', 'Source'], POLICY_TIMELINE.map((x) => [x.platform, x.rule, x.date, x.status, link('Official', x.url)])),
    h2('What StoreReady cannot check'),
    ul(['Human App Review judgement (design quality, spam, business model).', 'Server-side security: APIs, Firebase/Supabase rules, authorization logic.', 'Store-console-only data: listing text, screenshots, pricing, content rating answers.', 'Runtime behaviour: crashes, ANRs, network traffic — use the Play pre-launch report, TestFlight and a proxy such as mitmproxy.']),
    quote('StoreReady is an independent open-source tool and is not affiliated with Google or Apple. Always confirm against the official policy pages.'),
  ];
}

// ---------------------------------------------------------------- page index
export function buildPages(ctx) {
  const r = ctx.report;
  const pages = [];
  if (r) {
    pages.push({ id: 'overview', section: 'This build', icon: '📊', title: `${r.app.name || r.app.id || r.fileName}`, subtitle: `${r.platform === 'ios' ? 'iOS' : 'Android'} release readiness report`, blocks: overviewPage(ctx) });
    pages.push({ id: 'issues', section: 'This build', icon: '🚨', title: 'Issues', badge: r.issues.filter((i) => i.severity !== 'info').length, subtitle: 'Everything that can block your release, with fixes', blocks: issuesPage(ctx) });
    pages.push({ id: 'checks', section: 'This build', icon: '🧪', title: 'Store checks', subtitle: r.platform === 'ios' ? 'App Store Connect validation & review' : 'Play Console upload checks & policy', blocks: storeChecksPage(ctx) });
    pages.push({ id: 'security', section: 'This build', icon: '🔐', title: 'Security checklist', subtitle: 'OWASP MASVS v2', blocks: securityPage(ctx) });
    pages.push({ id: 'architecture', section: 'This build', icon: '🏗️', title: 'Architecture & structure', subtitle: 'What is inside your package', blocks: architecturePage(ctx) });
    pages.push({ id: 'privacy', section: 'This build', icon: '🧾', title: 'Privacy & data', subtitle: r.platform === 'ios' ? 'App Privacy draft' : 'Data safety draft', blocks: privacyPage(ctx) });
  }
  pages.push({ id: 'keys', section: 'Playbooks', icon: '🔑', title: 'Keys & secrets', subtitle: 'Where to store keys — and where never to', blocks: keysPage(ctx) });
  pages.push({ id: 'compliance', section: 'Playbooks', icon: '⚖️', title: 'Compliance by app type', subtitle: 'Mandatory items for your category', blocks: compliancePage(ctx) });
  if (!r || r.platform === 'android') pages.push({ id: 'play', section: 'Playbooks', icon: '🤖', title: 'Google Play release guide', subtitle: 'Every step from account to live', blocks: playGuidePage(ctx) });
  if (!r || r.platform === 'ios') pages.push({ id: 'appstore', section: 'Playbooks', icon: '🍎', title: 'App Store release guide', subtitle: 'Every step from enrollment to live', blocks: appStoreGuidePage(ctx) });
  if (r) {
    if (r.platform === 'android') pages.push({ id: 'appstore', section: 'Playbooks', icon: '🍎', title: 'App Store release guide', subtitle: 'For your iOS build', blocks: appStoreGuidePage(ctx) });
    else pages.push({ id: 'play', section: 'Playbooks', icon: '🤖', title: 'Google Play release guide', subtitle: 'For your Android build', blocks: playGuidePage(ctx) });
  }
  pages.push({ id: 'roadmap', section: 'Playbooks', icon: '🗺️', title: 'Road to live', subtitle: 'Timeline from build to store', blocks: roadmapPage(ctx) });
  pages.push({ id: 'policies', section: 'Reference', icon: '📜', title: 'Store policy tracker', subtitle: `Current rules · reviewed ${LAST_REVIEWED}`, blocks: policiesPage(ctx) });
  return pages;
}
