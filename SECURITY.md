# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) ("Report a vulnerability" on the Security tab).
We aim to acknowledge reports within 72 hours and to ship a fix or mitigation within 14 days.

## Scope

- Parsing bugs that lead to script execution, XSS or crashes when a crafted APK/AAB/IPA is opened
- Anything that causes file contents or analysis results to leave the user's browser
- Content-Security-Policy bypasses on the hosted site
- Supply-chain risks in the CI workflows or GitHub Action

## Design guarantees

- All analysis runs client-side. There is no backend, no telemetry and no third-party script.
- The page ships with `Content-Security-Policy: default-src 'self'`.
- Every string taken from an analyzed file is HTML-escaped before rendering.
- Detected secrets are masked in the UI and in every export.

## Supported versions

Only the latest release on `main` receives security fixes.
