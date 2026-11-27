// SPDX-License-Identifier: MIT
// Single source of truth for dated store requirements. Update this file when Google or Apple
// change the rules (every year around April for Apple and August for Google), then bump LAST_REVIEWED.

export const LAST_REVIEWED = '2026-11-27';

export const POLICY = {
  play: {
    minTargetSdk: 36, // new apps & updates, since 31 Aug 2026 (phones/tablets)
    minTargetSdkExisting: 35, // existing apps stay discoverable to new users
    minTargetSdkWear: 35,
    minTargetSdkTv: 34,
    pageSize16kbRequired: true,
    closedTestTesters: 12,
    closedTestDays: 14,
    registrationFeeUsd: 25,
    vitals: { crashRate: 1.09, anrRate: 0.47 },
  },
  apple: {
    minSdkMajor: 26, // built with Xcode 26 / iOS 26 SDK since 28 Apr 2026
    minXcode: 2600,
    minDeploymentTarget: 13, // iOS 13+ since 9 Sep 2026
    programFeeUsd: 99,
  },
};

export const POLICY_TIMELINE = [
  { platform: 'Google Play', rule: 'New apps and app updates must target Android 16 (API 36) or higher', date: '2026-08-31', status: 'in force', url: 'https://support.google.com/googleplay/android-developer/answer/11926878' },
  { platform: 'Google Play', rule: 'Existing apps must target API 35+ to stay visible to new users on newer Android versions', date: '2026-08-31', status: 'in force', url: 'https://support.google.com/googleplay/android-developer/answer/11926878' },
  { platform: 'Google Play', rule: 'Wear OS / Automotive must target API 35+, Android TV / XR API 34+', date: '2026-08-31', status: 'in force', url: 'https://support.google.com/googleplay/android-developer/answer/11926878' },
  { platform: 'Google Play', rule: 'Apps targeting Android 15+ must support 16 KB memory page sizes (native libraries)', date: '2025-11-01', status: 'in force; updates blocked from 2027-02-01 at the latest', url: 'https://developer.android.com/guide/practices/page-sizes' },
  { platform: 'Google Play', rule: 'New personal developer accounts (created after 13 Nov 2023) must run a closed test with 12+ testers for 14 continuous days before production', date: '2023-11-13', status: 'in force', url: 'https://support.google.com/googleplay/android-developer/answer/14151465' },
  { platform: 'Google Play', rule: 'New apps must be published as Android App Bundles (.aab) with Play App Signing', date: '2021-08-01', status: 'in force', url: 'https://developer.android.com/guide/app-bundle' },
  { platform: 'Android (all stores)', rule: 'Android developer verification: apps on certified devices must be registered by a verified developer — Brazil, Indonesia, Singapore, Thailand first; global in 2027', date: '2026-09-30', status: 'rolling out', url: 'https://developer.android.com/developer-verification' },
  { platform: 'App Store', rule: 'Apps must be built with Xcode 26+ and the iOS/iPadOS 26 SDK', date: '2026-04-28', status: 'in force', url: 'https://developer.apple.com/news/upcoming-requirements/' },
  { platform: 'App Store', rule: 'iOS and iPadOS apps uploaded must target iOS 13 or later', date: '2026-09-09', status: 'in force', url: 'https://developer.apple.com/news/upcoming-requirements/' },
  { platform: 'App Store', rule: 'Updated age-rating questions must be answered in App Store Connect (13+, 16+, 18+ tiers)', date: '2026-01-31', status: 'in force', url: 'https://developer.apple.com/news/upcoming-requirements/' },
  { platform: 'App Store', rule: 'Privacy manifest with approved reasons for required-reason APIs (incl. third-party SDKs)', date: '2024-05-01', status: 'in force', url: 'https://developer.apple.com/documentation/bundleresources/privacy-manifest-files' },
  { platform: 'App Store', rule: 'Apps that support account creation must let users delete their account in-app (Guideline 5.1.1(v))', date: '2022-06-30', status: 'in force', url: 'https://developer.apple.com/support/offering-account-deletion-in-your-app/' },
  { platform: 'App Store', rule: 'EU Digital Services Act: trader status must be declared to distribute in the EU', date: '2025-02-17', status: 'in force', url: 'https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/' },
];

/** App categories with extra mandatory requirements (beyond the baseline). */
export const APP_TYPES = {
  general: { label: 'General / utility', icon: '📱', items: [] },
  kids: {
    label: 'Kids / families (under 13)', icon: '🧸',
    items: [
      { store: 'play', text: 'Opt in to the Families policy in Target audience & content; meet Families Self-Certified Ads SDK requirements (only certified ad SDKs).', must: true },
      { store: 'play', text: 'Do not transmit Advertising ID, IMEI, location or other persistent identifiers from children.', must: true },
      { store: 'apple', text: 'Kids Category (Guideline 1.3): no third-party analytics/advertising, parental gate before links, purchases or permission prompts.', must: true },
      { store: 'both', text: 'Comply with COPPA (US), GDPR-K (EU) and India DPDP Act verifiable parental consent for children.', must: true },
    ],
  },
  health: {
    label: 'Health, fitness & medical', icon: '🩺',
    items: [
      { store: 'play', text: 'Complete the Health apps declaration in Play Console; Health Connect data needs an approved access request and a privacy policy that covers it.', must: true },
      { store: 'apple', text: 'HealthKit data may not be used for advertising or sold; clinical/medical claims need regulatory clearance documentation (Guideline 1.4.1, 5.1.3).', must: true },
      { store: 'both', text: 'Include a medical disclaimer; regulated medical devices need FDA/CE/CDSCO evidence in review notes.', must: true },
    ],
  },
  finance: {
    label: 'Finance, lending, payments', icon: '💳',
    items: [
      { store: 'play', text: 'Complete the Financial features declaration. Personal loan apps in India must be on the Play "approved lender" list / RBI digital lending rules and may not access contacts, photos or call logs.', must: true },
      { store: 'play', text: 'Personal loan apps: disclose APR, minimum/maximum repayment period (≥ 60 days), and fees in the listing.', must: true },
      { store: 'apple', text: 'Loan apps must show maximum APR and may not charge an APR above 36% or require full repayment in 60 days or less (Guideline 3.2.2(ix)).', must: true },
      { store: 'apple', text: 'Financial trading/crypto/banking apps must be submitted by the licensed institution (organization account) — Guideline 3.1.5 / 5.1.1(ix).', must: true },
      { store: 'both', text: 'Use certificate pinning, root/jailbreak detection, Play Integrity / App Attest and FLAG_SECURE / screenshot protection on sensitive screens.', must: false },
    ],
  },
  games: {
    label: 'Games', icon: '🎮',
    items: [
      { store: 'both', text: 'Loot boxes / random items must disclose odds before purchase (Play Real-Money & Monetization policy, Apple 3.1.1).', must: true },
      { store: 'play', text: 'Real-money gambling needs approved country licences and the gambling application form.', must: true },
      { store: 'apple', text: 'Real-money gaming must be geo-restricted, free on the store and submitted by the licensed entity (Guideline 5.3).', must: true },
    ],
  },
  social: {
    label: 'Social / user-generated content / chat', icon: '💬',
    items: [
      { store: 'both', text: 'Provide content reporting, user blocking, moderation of objectionable content and published terms (Apple 1.2, Play UGC policy).', must: true },
      { store: 'both', text: 'Account deletion must be available in-app and on the web (Play data deletion policy, Apple 5.1.1(v)).', must: true },
      { store: 'apple', text: 'Anonymous chat / random-match apps are commonly rejected unless robust moderation is in place.', must: false },
    ],
  },
  dating: {
    label: 'Dating', icon: '❤️',
    items: [
      { store: 'both', text: 'Age gate 18+, reporting and blocking, and moderation; set the age rating to 18+.', must: true },
      { store: 'apple', text: 'Guideline 4.3: dating apps are a saturated category — show unique features in review notes.', must: false },
    ],
  },
  vpn: {
    label: 'VPN / networking', icon: '🛡️',
    items: [
      { store: 'play', text: 'Use VpnService only as core functionality; complete the VpnService declaration; no ad-fraud or data harvesting.', must: true },
      { store: 'apple', text: 'Must use NEVPNManager, be submitted by an organization account, and disclose data collection (Guideline 5.4).', must: true },
    ],
  },
  crypto: {
    label: 'Crypto / Web3', icon: '🪙',
    items: [
      { store: 'play', text: 'Exchanges and software wallets must meet the Cryptocurrency exchanges & software wallets policy and local licensing (e.g. FIU-IND registration in India).', must: true },
      { store: 'apple', text: 'No on-device mining (3.1.5(ii)); exchanges only in licensed regions; NFT purchases follow IAP rules.', must: true },
    ],
  },
  news: {
    label: 'News & magazines', icon: '📰',
    items: [
      { store: 'play', text: 'Complete the News apps declaration; publish ownership and contact details.', must: true },
    ],
  },
  education: {
    label: 'Education', icon: '🎓',
    items: [
      { store: 'both', text: 'If used by children, Families / Kids requirements apply; school data may need FERPA/DPDP compliance.', must: false },
    ],
  },
  webview: {
    label: 'WebView wrapper / PWA', icon: '🌐',
    items: [
      { store: 'apple', text: 'Guideline 4.2 Minimum functionality: apps that are just a website in a WebView are rejected. Add native features (push, offline, device APIs).', must: true },
      { store: 'play', text: 'Webview apps must own the content they display (Spam & minimum functionality policy).', must: true },
    ],
  },
  enterprise: {
    label: 'Enterprise / internal', icon: '🏢',
    items: [
      { store: 'play', text: 'Use Managed Google Play private apps (exempt from target API rules) instead of public listing.', must: false },
      { store: 'apple', text: 'Use Apple Business Manager custom apps or the Enterprise Program (internal staff only).', must: false },
    ],
  },
};
