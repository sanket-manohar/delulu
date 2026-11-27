// SPDX-License-Identifier: MIT
// Framework-specific release commands and conventions.

export const FRAMEWORKS = {
  flutter: { label: 'Flutter', icon: '💙' },
  'react-native': { label: 'React Native (CLI)', icon: '⚛️' },
  expo: { label: 'Expo (EAS)', icon: '▲' },
  'native-android': { label: 'Native Android (Kotlin/Java)', icon: '🤖' },
  'native-ios': { label: 'Native iOS (Swift/Obj-C)', icon: '🍎' },
  other: { label: 'Other (Unity, MAUI, Capacitor, KMP…)', icon: '🧩' },
};

export function frameworkKey(report) {
  if (!report) return null;
  const id = report.framework.id;
  if (id === 'react-native') return report.framework.expo ? 'expo' : 'react-native';
  if (id === 'flutter') return 'flutter';
  if (id === 'native-android' || id === 'native-ios') return id;
  return 'other';
}

/** Pick framework-specific fix steps from a check's fix object. */
export function fixFor(fix, fw, report) {
  if (!fix) return [];
  if (Array.isArray(fix)) return fix;
  const id = report?.framework?.id;
  return fix[fw] || fix[id] || (fw === 'expo' && fix['react-native']) || (fw === 'native-ios' || fw === 'native-android' ? fix[fw] : null) || fix.default || [];
}

export const ANDROID_BUILD = {
  flutter: {
    version: 'pubspec.yaml → version: 1.4.0+12   # name+code',
    keystore: `# android/key.properties  (git-ignored!)
storePassword=<from your password manager>
keyPassword=<from your password manager>
keyAlias=upload
storeFile=/secure/path/upload-keystore.jks`,
    signing: `// android/app/build.gradle.kts
val keystoreProperties = java.util.Properties().apply {
    val f = rootProject.file("key.properties"); if (f.exists()) load(f.inputStream())
}
android {
    signingConfigs { create("release") {
        keyAlias = keystoreProperties["keyAlias"] as String?
        keyPassword = keystoreProperties["keyPassword"] as String?
        storeFile = (keystoreProperties["storeFile"] as String?)?.let { file(it) }
        storePassword = keystoreProperties["storePassword"] as String?
    } }
    buildTypes { release {
        signingConfig = signingConfigs.getByName("release")
        isMinifyEnabled = true; isShrinkResources = true
    } }
}`,
    build: `flutter clean && flutter pub get
flutter build appbundle --release \\
  --obfuscate --split-debug-info=build/symbols
# → build/app/outputs/bundle/release/app-release.aab`,
    test: 'flutter build apk --release --split-per-abi   # for device QA only',
  },
  'react-native': {
    version: 'android/app/build.gradle → versionCode 12 / versionName "1.4.0"',
    keystore: `# ~/.gradle/gradle.properties  (outside the repo)
MYAPP_UPLOAD_STORE_FILE=/secure/path/upload-keystore.jks
MYAPP_UPLOAD_KEY_ALIAS=upload
MYAPP_UPLOAD_STORE_PASSWORD=<secret>
MYAPP_UPLOAD_KEY_PASSWORD=<secret>`,
    signing: `// android/app/build.gradle
signingConfigs {
    release {
        storeFile file(MYAPP_UPLOAD_STORE_FILE)
        storePassword MYAPP_UPLOAD_STORE_PASSWORD
        keyAlias MYAPP_UPLOAD_KEY_ALIAS
        keyPassword MYAPP_UPLOAD_KEY_PASSWORD
    }
}
buildTypes { release {
    signingConfig signingConfigs.release
    minifyEnabled true   // def enableProguardInReleaseBuilds = true
    shrinkResources true
} }`,
    build: `cd android
./gradlew clean
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab`,
    test: 'npx react-native run-android --mode=release',
  },
  expo: {
    version: 'app.json → expo.version "1.4.0", android.versionCode 12 (or "autoIncrement": true in eas.json)',
    keystore: '# EAS manages the upload keystore for you:\neas credentials -p android   # view / download a backup',
    signing: `// eas.json
{
  "build": {
    "production": { "autoIncrement": true, "android": { "buildType": "app-bundle" } }
  },
  "submit": { "production": { "android": { "serviceAccountKeyPath": "./play-sa.json", "track": "internal" } } }
}`,
    build: `npm i -g eas-cli && eas login
eas build -p android --profile production
eas submit -p android --profile production   # uploads to Play`,
    test: 'eas build -p android --profile preview   # installable APK for QA',
  },
  'native-android': {
    version: 'app/build.gradle.kts → defaultConfig { versionCode = 12; versionName = "1.4.0" }',
    keystore: `# Environment variables injected by CI (never commit)
export UPLOAD_STORE_FILE=/secure/upload-keystore.jks
export UPLOAD_STORE_PASSWORD=***
export UPLOAD_KEY_ALIAS=upload
export UPLOAD_KEY_PASSWORD=***`,
    signing: `// app/build.gradle.kts
android {
    compileSdk = 36
    defaultConfig { targetSdk = 36 }
    signingConfigs { create("release") {
        storeFile = file(System.getenv("UPLOAD_STORE_FILE"))
        storePassword = System.getenv("UPLOAD_STORE_PASSWORD")
        keyAlias = System.getenv("UPLOAD_KEY_ALIAS")
        keyPassword = System.getenv("UPLOAD_KEY_PASSWORD")
    } }
    buildTypes { release {
        signingConfig = signingConfigs.getByName("release")
        isMinifyEnabled = true; isShrinkResources = true
        proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    } }
}`,
    build: `./gradlew clean :app:bundleRelease
# → app/build/outputs/bundle/release/app-release.aab`,
    test: `bundletool build-apks --bundle=app-release.aab --output=app.apks --mode=universal
bundletool install-apks --apks=app.apks`,
  },
};
ANDROID_BUILD.other = ANDROID_BUILD['native-android'];
ANDROID_BUILD['native-ios'] = ANDROID_BUILD['native-android'];

export const IOS_BUILD = {
  flutter: {
    version: 'pubspec.yaml → version: 2.1.0+42   # CFBundleShortVersionString + CFBundleVersion',
    prep: `cd ios && pod repo update && pod install && cd ..
open ios/Runner.xcworkspace   # set Team, Bundle ID, signing → Automatic`,
    build: `flutter build ipa --release \\
  --obfuscate --split-debug-info=build/symbols \\
  --export-method app-store
# → build/ios/ipa/*.ipa`,
    upload: `# Drag the .ipa into Transporter, or:
xcrun altool --upload-app -f build/ios/ipa/*.ipa -t ios \\
  --apiKey $ASC_KEY_ID --apiIssuer $ASC_ISSUER_ID`,
  },
  'react-native': {
    version: 'Xcode → Target → General → Version / Build',
    prep: `cd ios && bundle exec pod install && cd ..
open ios/<App>.xcworkspace   # Scheme: Release, destination: Any iOS Device (arm64)`,
    build: `xcodebuild -workspace ios/<App>.xcworkspace -scheme <App> \\
  -configuration Release -archivePath build/<App>.xcarchive \\
  -destination 'generic/platform=iOS' archive
xcodebuild -exportArchive -archivePath build/<App>.xcarchive \\
  -exportOptionsPlist ios/ExportOptions.plist -exportPath build/ipa`,
    upload: 'Xcode Organizer → Distribute App → App Store Connect → Upload\n# CI: fastlane pilot upload --ipa build/ipa/<App>.ipa',
  },
  expo: {
    version: 'app.json → expo.version "2.1.0", ios.buildNumber "42" (or autoIncrement)',
    prep: 'eas credentials -p ios   # EAS creates the distribution certificate + profile',
    build: 'eas build -p ios --profile production',
    upload: 'eas submit -p ios --profile production   # uploads to App Store Connect / TestFlight',
  },
  'native-ios': {
    version: 'Xcode → Target → General → Identity → Version (marketing) / Build',
    prep: 'Signing & Capabilities → Automatically manage signing → select your Team',
    build: `xcodebuild -scheme <App> -configuration Release \\
  -archivePath build/<App>.xcarchive -destination 'generic/platform=iOS' archive
xcodebuild -exportArchive -archivePath build/<App>.xcarchive \\
  -exportOptionsPlist ExportOptions.plist -exportPath build/ipa`,
    upload: 'Xcode → Product → Archive → Organizer → Distribute App → App Store Connect\n# or Transporter.app / fastlane deliver',
  },
};
IOS_BUILD.other = IOS_BUILD['native-ios'];
IOS_BUILD['native-android'] = IOS_BUILD['native-ios'];
