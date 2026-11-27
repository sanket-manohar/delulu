# Releasing Delulu

## First launch (one time)

1. **Create the repo**: on GitHub, create a new **public** repository `sanket-manohar/delulu` (no README, no license; they're already here).
2. **Push**:
   ```bash
   git remote add origin https://github.com/sanket-manohar/delulu.git
   git push -u origin main --tags
   ```
3. **Turn on the website**: repo **Settings → Pages → Source: GitHub Actions**. The `Deploy site to GitHub Pages` workflow publishes to
   **https://sanket-manohar.github.io/delulu/** in about two minutes.
4. **Repo polish** (Settings → General):
   - Description: `It's only delulu until it's approved ✈️ Check your APK/AAB/IPA against Google Play & App Store rules before you submit. 100% in-browser.`
   - Website: `https://sanket-manohar.github.io/delulu/`
   - Topics: `android`, `ios`, `flutter`, `react-native`, `expo`, `app-store`, `google-play`, `apk`, `ipa`, `mobile-security`, `owasp`, `developer-tools`
   - Social preview: upload `assets/img/og.png`
   - Features: enable **Sponsorships** (uses `.github/FUNDING.yml`), Issues and Discussions
5. **Protect `main`**: Settings → Branches → add rule for `main`: require a pull request and your approval. Nobody can then quietly change the donation link in `src/config.js` or `.github/FUNDING.yml`.
6. **Security**: Settings → Code security → enable **Private vulnerability reporting**, **Dependabot alerts** and **Secret scanning**.
7. **GitHub Action marketplace (optional)**: Releases → draft a release from tag `v1.0.0` → tick *Publish this Action to the GitHub Marketplace*.

## Before you announce

- [ ] Open the live site, run the sample APK and IPA, and step through the tour.
- [ ] Test 5–10 real builds (Flutter, React Native/Expo, native Android, native iOS).
- [ ] GitHub Sponsors profile approved (the coffee popup links to `github.com/sponsors/sanket-manohar`).
- [ ] Record a 20–30 s demo: drop build → blockers → board → fix → 0% delulu.

## Every new version

1. Update `src/rules/policy.js` if store rules changed (bump `LAST_REVIEWED`).
2. Bump `VERSION` in `src/config.js` and `package.json`; add a `CHANGELOG.md` entry.
3. `npm test`
4. `git tag vX.Y.Z && git tag -f v1 && git push --tags --force` (the moving `v1` tag keeps `uses: sanket-manohar/delulu@v1` working).

Store-rule calendar: **Google Play** raises the target API every **31 August**; **Apple** raises the minimum Xcode/SDK every **spring (around April)**.
