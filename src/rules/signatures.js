// SPDX-License-Identifier: MIT
// Fingerprints for frameworks, third-party SDKs, sensitive permissions and iOS APIs.

/** Third-party SDKs. `a` = Android dex/so markers, `i` = iOS binary/framework markers, `f` = Flutter package, `data` = what it typically collects */
export const SDKS = [
  { name: 'Firebase Analytics', cat: 'Analytics', a: ['com/google/firebase/analytics'], i: ['FirebaseAnalytics'], f: ['package:firebase_analytics'], data: ['App interactions', 'Device or other IDs'] },
  { name: 'Firebase Crashlytics', cat: 'Crash reporting', a: ['com/google/firebase/crashlytics'], i: ['FirebaseCrashlytics'], f: ['package:firebase_crashlytics'], data: ['Crash logs', 'Diagnostics', 'Device or other IDs'] },
  { name: 'Firebase Cloud Messaging', cat: 'Push', a: ['com/google/firebase/messaging'], i: ['FirebaseMessaging'], f: ['package:firebase_messaging'], data: ['Device or other IDs'] },
  { name: 'Firebase Auth', cat: 'Auth', a: ['com/google/firebase/auth'], i: ['FirebaseAuth'], f: ['package:firebase_auth'], data: ['Email address', 'User IDs'] },
  { name: 'Cloud Firestore', cat: 'Backend', a: ['com/google/firebase/firestore'], i: ['FirebaseFirestore'], f: ['package:cloud_firestore'], data: [] },
  { name: 'Google Mobile Ads (AdMob)', cat: 'Advertising', a: ['com/google/android/gms/ads'], i: ['GoogleMobileAds', 'GADMobileAds'], f: ['package:google_mobile_ads'], data: ['Device or other IDs', 'Approximate location', 'App interactions'], ads: true },
  { name: 'Meta / Facebook SDK', cat: 'Social / Ads', a: ['com/facebook/FacebookSdk', 'com/facebook/appevents'], i: ['FBSDKCoreKit'], f: ['package:flutter_facebook_auth', 'package:facebook_app_events'], data: ['Device or other IDs', 'App interactions'], ads: true, login: true },
  { name: 'Google Sign-In', cat: 'Auth', a: ['com/google/android/gms/auth/api/signin', 'androidx/credentials'], i: ['GIDSignIn', 'GoogleSignIn'], f: ['package:google_sign_in'], data: ['Email address', 'Name'], login: true },
  { name: 'AppsFlyer', cat: 'Attribution', a: ['com/appsflyer'], i: ['AppsFlyerLib'], f: ['package:appsflyer_sdk'], data: ['Device or other IDs', 'App interactions'], ads: true },
  { name: 'Adjust', cat: 'Attribution', a: ['com/adjust/sdk'], i: ['AdjustSdk', 'Adjust.framework'], f: ['package:adjust_sdk'], data: ['Device or other IDs'], ads: true },
  { name: 'Branch', cat: 'Deep links', a: ['io/branch/referral'], i: ['BranchSDK', 'Branch.framework'], f: ['package:flutter_branch_sdk'], data: ['Device or other IDs'] },
  { name: 'Sentry', cat: 'Crash reporting', a: ['io/sentry'], i: ['Sentry.framework', 'SentryCrash'], f: ['package:sentry'], data: ['Crash logs', 'Diagnostics'] },
  { name: 'Bugsnag', cat: 'Crash reporting', a: ['com/bugsnag'], i: ['Bugsnag'], f: ['package:bugsnag'], data: ['Crash logs'] },
  { name: 'Datadog', cat: 'Monitoring', a: ['com/datadog/android'], i: ['DatadogCore'], f: ['package:datadog_flutter_plugin'], data: ['Diagnostics', 'App interactions'] },
  { name: 'OneSignal', cat: 'Push', a: ['com/onesignal'], i: ['OneSignal'], f: ['package:onesignal_flutter'], data: ['Device or other IDs'] },
  { name: 'CleverTap', cat: 'Engagement', a: ['com/clevertap'], i: ['CleverTapSDK'], f: ['package:clevertap_plugin'], data: ['Device or other IDs', 'App interactions'] },
  { name: 'MoEngage', cat: 'Engagement', a: ['com/moengage'], i: ['MoEngageSDK'], f: ['package:moengage_flutter'], data: ['Device or other IDs', 'App interactions'] },
  { name: 'Braze', cat: 'Engagement', a: ['com/braze'], i: ['BrazeKit'], f: ['package:braze_plugin'], data: ['Device or other IDs', 'App interactions'] },
  { name: 'Mixpanel', cat: 'Analytics', a: ['com/mixpanel'], i: ['Mixpanel'], f: ['package:mixpanel_flutter'], data: ['App interactions'] },
  { name: 'Amplitude', cat: 'Analytics', a: ['com/amplitude'], i: ['AmplitudeSwift', 'Amplitude.framework'], f: ['package:amplitude_flutter'], data: ['App interactions'] },
  { name: 'Segment', cat: 'Analytics', a: ['com/segment/analytics'], i: ['Segment'], f: [], data: ['App interactions'] },
  { name: 'Intercom', cat: 'Support', a: ['io/intercom'], i: ['Intercom.framework'], f: ['package:intercom_flutter'], data: ['Email address', 'Messages'] },
  { name: 'RevenueCat', cat: 'Payments', a: ['com/revenuecat'], i: ['RevenueCat'], f: ['package:purchases_flutter'], data: ['Purchase history'] },
  { name: 'Stripe', cat: 'Payments', a: ['com/stripe/android'], i: ['StripeCore', 'StripePayments'], f: ['package:flutter_stripe'], data: ['Payment info'] },
  { name: 'Razorpay', cat: 'Payments', a: ['com/razorpay'], i: ['Razorpay'], f: ['package:razorpay_flutter'], data: ['Payment info', 'Phone number', 'Email address'] },
  { name: 'PhonePe / Paytm / UPI SDK', cat: 'Payments', a: ['com/phonepe', 'net/one97/paytm'], i: ['PhonePePayment', 'AppInvokeSDK'], f: [], data: ['Payment info'] },
  { name: 'Google Play Billing', cat: 'Payments', a: ['com/android/billingclient'], i: [], f: ['package:in_app_purchase'], data: ['Purchase history'] },
  { name: 'StoreKit (IAP)', cat: 'Payments', a: [], i: ['SKPaymentQueue', 'StoreKit.framework'], f: [], data: ['Purchase history'] },
  { name: 'Google Maps', cat: 'Maps', a: ['com/google/android/gms/maps'], i: ['GoogleMaps', 'GMSMapView'], f: ['package:google_maps_flutter'], data: ['Approximate location'] },
  { name: 'OkHttp certificate pinning', cat: 'Security', a: ['okhttp3/CertificatePinner'], i: [], f: [], data: [], security: 'pinning' },
  { name: 'TrustKit / Alamofire pinning', cat: 'Security', a: [], i: ['TrustKit', 'ServerTrustManager', 'PinnedCertificatesTrustEvaluator'], f: [], data: [], security: 'pinning' },
  { name: 'Play Integrity API', cat: 'Security', a: ['com/google/android/play/core/integrity', 'com/google/android/play/integrity'], i: [], f: ['package:app_device_integrity'], data: [], security: 'integrity' },
  { name: 'App Attest / DeviceCheck', cat: 'Security', a: [], i: ['DCAppAttestService', 'DCDevice'], f: [], data: [], security: 'integrity' },
  { name: 'Firebase App Check', cat: 'Security', a: ['com/google/firebase/appcheck'], i: ['FirebaseAppCheck'], f: ['package:firebase_app_check'], data: [], security: 'integrity' },
  { name: 'RootBeer (root detection)', cat: 'Security', a: ['com/scottyab/rootbeer'], i: [], f: ['package:flutter_jailbreak_detection', 'package:safe_device'], data: [], security: 'root' },
  { name: 'Freerasp / Talsec', cat: 'Security', a: ['com/aheaditec/talsec'], i: ['TalsecRuntime'], f: ['package:freerasp'], data: [], security: 'root' },
  { name: 'Encrypted storage (Keystore / Keychain wrapper)', cat: 'Security', a: ['androidx/security/crypto', 'EncryptedSharedPreferences'], i: ['SecItemAdd', 'kSecAttrAccessible'], f: ['package:flutter_secure_storage'], data: [], security: 'storage' },
];

/** Android permissions that trigger extra Play Console declarations or policy review. */
export const SENSITIVE_PERMISSIONS = {
  'android.permission.READ_SMS': { level: 'restricted', note: 'SMS & Call Log policy: only default SMS handler apps or approved exceptions. Permissions Declaration Form required.' },
  'android.permission.RECEIVE_SMS': { level: 'restricted', note: 'SMS & Call Log policy. Use the SMS Retriever / User Consent API for OTPs instead.' },
  'android.permission.SEND_SMS': { level: 'restricted', note: 'SMS & Call Log policy — declaration required.' },
  'android.permission.READ_CALL_LOG': { level: 'restricted', note: 'SMS & Call Log policy — declaration required.' },
  'android.permission.WRITE_CALL_LOG': { level: 'restricted', note: 'SMS & Call Log policy — declaration required.' },
  'android.permission.PROCESS_OUTGOING_CALLS': { level: 'restricted', note: 'SMS & Call Log policy — declaration required.' },
  'android.permission.QUERY_ALL_PACKAGES': { level: 'restricted', note: 'Package visibility policy: needs a core-use justification in Play Console; prefer <queries>.' },
  'android.permission.MANAGE_EXTERNAL_STORAGE': { level: 'restricted', note: 'All files access: only file managers, backup, antivirus etc. Declaration required.' },
  'android.permission.ACCESS_BACKGROUND_LOCATION': { level: 'restricted', note: 'Background location declaration + video demo + prominent disclosure required.' },
  'android.permission.REQUEST_INSTALL_PACKAGES': { level: 'restricted', note: 'Only for apps whose core purpose is installing packages. Declaration required.' },
  'android.permission.USE_FULL_SCREEN_INTENT': { level: 'restricted', note: 'Android 14+: only calling and alarm apps get it by default; declare in Play Console.' },
  'android.permission.SCHEDULE_EXACT_ALARM': { level: 'review', note: 'Exact alarm policy: denied by default on Android 14+; justify or use inexact alarms.' },
  'android.permission.USE_EXACT_ALARM': { level: 'restricted', note: 'Only alarm clock / calendar apps. Declaration required.' },
  'android.permission.READ_MEDIA_IMAGES': { level: 'restricted', note: 'Photo & video permissions policy: use the Android photo picker unless broad access is core functionality.' },
  'android.permission.READ_MEDIA_VIDEO': { level: 'restricted', note: 'Photo & video permissions policy: use the photo picker unless core functionality.' },
  'android.permission.BIND_ACCESSIBILITY_SERVICE': { level: 'restricted', note: 'Accessibility API policy: prominent disclosure + declaration required.' },
  'android.permission.BIND_VPN_SERVICE': { level: 'restricted', note: 'VpnService policy declaration required.' },
  'android.permission.READ_CONTACTS': { level: 'review', note: 'Personal & sensitive data: prominent disclosure and Data safety declaration. Loan apps may not request it.' },
  'android.permission.ACCESS_FINE_LOCATION': { level: 'review', note: 'Declare location in Data safety; prefer approximate location when possible.' },
  'android.permission.CAMERA': { level: 'review', note: 'Declare camera/photo use in Data safety if images leave the device.' },
  'android.permission.RECORD_AUDIO': { level: 'review', note: 'Declare audio data in Data safety.' },
  'android.permission.READ_PHONE_STATE': { level: 'review', note: 'Avoid; device identifiers (IMEI) are not allowed for advertising.' },
  'android.permission.BODY_SENSORS': { level: 'review', note: 'Health data — Health apps declaration.' },
  'android.permission.READ_EXTERNAL_STORAGE': { level: 'review', note: 'Ignored on Android 13+ when targeting API 33+. Use READ_MEDIA_* / photo picker.' },
  'android.permission.WRITE_EXTERNAL_STORAGE': { level: 'review', note: 'No effect on Android 11+ scoped storage; remove unless maxSdkVersion is set.' },
  'android.permission.SYSTEM_ALERT_WINDOW': { level: 'review', note: 'Draw over other apps — reviewers scrutinise it; justify the use.' },
  'com.google.android.gms.permission.AD_ID': { level: 'review', note: 'Declare Advertising ID use in Play Console (App content → Advertising ID).' },
  'android.permission.FOREGROUND_SERVICE': { level: 'review', note: 'Android 14+: each foreground service type must be declared in Play Console with a video.' },
};

/** iOS: API marker → Info.plist purpose string(s) required (any of). */
export const IOS_PURPOSE_KEYS = [
  { key: 'NSCameraUsageDescription', label: 'Camera', markers: ['AVCaptureDevice', 'UIImagePickerControllerSourceTypeCamera'] },
  { key: 'NSMicrophoneUsageDescription', label: 'Microphone', markers: ['requestRecordPermission', 'AVAudioRecorder'] },
  { key: 'NSPhotoLibraryUsageDescription', label: 'Photo library', markers: ['PHPhotoLibrary', 'PHAsset'] },
  { key: 'NSLocationWhenInUseUsageDescription', label: 'Location', markers: ['CLLocationManager'] },
  { key: 'NSContactsUsageDescription', label: 'Contacts', markers: ['CNContactStore'] },
  { key: 'NSCalendarsFullAccessUsageDescription', alt: ['NSCalendarsUsageDescription', 'NSCalendarsWriteOnlyAccessUsageDescription'], label: 'Calendars', markers: ['EKEventStore'] },
  { key: 'NSRemindersFullAccessUsageDescription', alt: ['NSRemindersUsageDescription'], label: 'Reminders', markers: ['EKReminder'] },
  { key: 'NSBluetoothAlwaysUsageDescription', label: 'Bluetooth', markers: ['CBCentralManager', 'CBPeripheralManager'] },
  { key: 'NSFaceIDUsageDescription', label: 'Face ID', markers: ['LAContext'] },
  { key: 'NSUserTrackingUsageDescription', label: 'App Tracking Transparency', markers: ['ATTrackingManager'] },
  { key: 'NSHealthShareUsageDescription', label: 'HealthKit', markers: ['HKHealthStore'] },
  { key: 'NSSpeechRecognitionUsageDescription', label: 'Speech recognition', markers: ['SFSpeechRecognizer'] },
  { key: 'NSMotionUsageDescription', label: 'Motion & fitness', markers: ['CMMotionActivityManager', 'CMPedometer'] },
  { key: 'NFCReaderUsageDescription', label: 'NFC', markers: ['NFCNDEFReaderSession', 'NFCTagReaderSession'] },
  { key: 'NSAppleMusicUsageDescription', label: 'Media library', markers: ['MPMediaLibrary', 'MPMediaQuery'] },
  { key: 'NSLocalNetworkUsageDescription', label: 'Local network', markers: ['NWBrowser', 'NSNetServiceBrowser'] },
];

/** Required-reason API categories (privacy manifest NSPrivacyAccessedAPIType values). */
export const REQUIRED_REASON_APIS = [
  { type: 'NSPrivacyAccessedAPICategoryUserDefaults', label: 'User defaults', markers: ['NSUserDefaults', 'UserDefaults'] },
  { type: 'NSPrivacyAccessedAPICategoryFileTimestamp', label: 'File timestamp', markers: ['NSFileCreationDate', 'NSFileModificationDate', 'creationDateKey', 'contentModificationDateKey', 'getattrlist'] },
  { type: 'NSPrivacyAccessedAPICategorySystemBootTime', label: 'System boot time', markers: ['systemUptime', 'mach_absolute_time'] },
  { type: 'NSPrivacyAccessedAPICategoryDiskSpace', label: 'Disk space', markers: ['NSFileSystemFreeSize', 'volumeAvailableCapacityKey', 'volumeAvailableCapacityForImportantUsageKey', 'statfs'] },
  { type: 'NSPrivacyAccessedAPICategoryActiveKeyboards', label: 'Active keyboards', markers: ['activeInputModes'] },
];

/** Apple's list of commonly used third-party SDKs that must ship a privacy manifest + signature. */
export const APPLE_PRIVACY_SDKS = ['Abseil', 'AFNetworking', 'Alamofire', 'AppAuth', 'BoringSSL', 'openssl_grpc', 'Capacitor', 'Charts', 'connectivity_plus', 'Cordova', 'device_info_plus', 'DKImagePickerController', 'DKPhotoGallery', 'FBAEMKit', 'FBLPromises', 'FBSDKCoreKit', 'FBSDKCoreKit_Basics', 'FBSDKLoginKit', 'FBSDKShareKit', 'file_picker', 'FirebaseABTesting', 'FirebaseAuth', 'FirebaseCore', 'FirebaseCoreDiagnostics', 'FirebaseCoreExtension', 'FirebaseCoreInternal', 'FirebaseCrashlytics', 'FirebaseDynamicLinks', 'FirebaseFirestore', 'FirebaseInstallations', 'FirebaseMessaging', 'FirebaseRemoteConfig', 'Flutter', 'flutter_inappwebview', 'flutter_local_notifications', 'fluttertoast', 'FMDB', 'geolocator_apple', 'GoogleDataTransport', 'GoogleSignIn', 'GoogleToolboxForMac', 'GoogleUtilities', 'grpcpp', 'GTMAppAuth', 'GTMSessionFetcher', 'hermes', 'image_picker_ios', 'IQKeyboardManager', 'IQKeyboardManagerSwift', 'Kingfisher', 'leveldb', 'Lottie', 'MBProgressHUD', 'nanopb', 'OneSignal', 'OneSignalCore', 'OneSignalExtension', 'OneSignalOutcomes', 'OpenSSL', 'OrderedSet', 'package_info', 'package_info_plus', 'path_provider', 'path_provider_ios', 'Promises', 'Protobuf', 'Reachability', 'RealmSwift', 'RxCocoa', 'RxRelay', 'RxSwift', 'SDWebImage', 'share_plus', 'shared_preferences_ios', 'SnapKit', 'sqflite', 'Starscream', 'SVProgressHUD', 'SwiftyGif', 'SwiftyJSON', 'Toast', 'UnityFramework', 'url_launcher', 'url_launcher_ios', 'video_player_avfoundation', 'wakelock', 'webview_flutter_wkwebview'];

/** Code-level risk markers (Android dex strings / iOS symbols). */
export const ANDROID_RISK_MARKERS = {
  webviewDebug: 'setWebContentsDebuggingEnabled',
  jsInterface: 'addJavascriptInterface',
  allowAllHostnames: 'ALLOW_ALL_HOSTNAME_VERIFIER',
  allowAllHostnames2: 'AllowAllHostnameVerifier',
  sslErrorProceed: 'onReceivedSslError',
  fileAccessUrls: 'setAllowUniversalAccessFromFileURLs',
  worldReadable: 'MODE_WORLD_READABLE',
  r8: '~~R8{',
  d8: '~~D8{',
  debugMode: '"compilation-mode":"debug"',
  releaseMode: '"compilation-mode":"release"',
  kotlin: 'kotlin/Metadata',
  compose: 'androidx/compose/runtime',
  dynamicCode: 'dalvik/system/DexClassLoader',
  runtimeExec: 'java/lang/Runtime',
  photoPicker: 'PickVisualMedia',
};

export const IOS_RISK_MARKERS = {
  uiwebview: 'UIWebView',
  idfa: 'advertisingIdentifier',
  appleSignIn: 'ASAuthorizationAppleIDProvider',
  swiftui: 'SwiftUI',
  swift: 'libswiftCore',
  nslog: 'NSLog',
  arbitraryTls: 'kCFStreamSSLValidatesCertificateChain',
  dlopen: 'dlopen',
  privateApi: '_UIApplicationSystemGestureStateChanged',
};
