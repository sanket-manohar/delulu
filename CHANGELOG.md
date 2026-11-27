# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [1.0.0] — 2026-11-27

### Added
- In-browser analysis of APK, AAB and IPA with a streaming ZIP reader (handles multi-GB IPAs).
- Google Play checks: target API 36, 16 KB page sizes, 64-bit, signing (debug certificate, v1–v3.1), `android:exported`, restricted permissions, Advertising ID, foreground services, developer verification.
- App Store checks mapped to ITMS codes: Xcode 26 SDK, iOS 13+, purpose strings, privacy manifests, SDK manifests, UIWebView, simulator slices, provisioning, entitlements, orientations, launch screen, icons.
- OWASP MASVS v2 checklist, secret scanner (20+ patterns), sensitive file detection.
- Framework detection: Flutter, React Native, Expo, native Android/iOS, KMP, Unity, Unreal, MAUI, Capacitor, Cordova.
- Notion-style workspace with release guides, keys & secrets playbook, compliance by app type, privacy drafts, policy tracker.
- Markdown / ZIP / PDF / JSON exports, README badge, CLI and GitHub Action.
