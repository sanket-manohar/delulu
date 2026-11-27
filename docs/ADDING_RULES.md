# Adding or updating a rule

## 1. A store requirement changed (most common)

Edit `src/rules/policy.js`:

```js
export const LAST_REVIEWED = '2027-08-31';
export const POLICY = {
  play: { minTargetSdk: 37, minTargetSdkExisting: 36, ... },
  apple: { minSdkMajor: 27, ... },
};
export const POLICY_TIMELINE = [
  { platform: 'Google Play', rule: 'New apps and updates must target API 37', date: '2027-08-31', status: 'in force', url: 'https://support.google.com/...' },
  ...
];
```

The checks, guides and the policy tracker page all read from these values. Then update the expectations in `tests/analyzers.test.mjs` if needed.

## 2. A new automated check

Add it to `src/analyzers/android.js` or `ios.js`:

```js
R.check({
  id: 'play.myCheck',                 // stable id: used by the MASVS checklist and saved progress
  group: G.upload,                    // groups shown on the Store checks page
  title: 'Short positive statement',  // phrase it as the passing condition
  status: ok ? 'pass' : 'fail',       // pass | fail | warn | info | na
  severity: 'blocker',                // blocker | high | medium | low | info
  detail: 'What is wrong and what the store does about it.',
  evidence: ['file/path or value'],   // never include unmasked secrets
  fix: { default: ['…'], flutter: ['…'], 'react-native': ['…'], 'native-android': ['…'] },
  refs: [{ label: 'Official doc', url: 'https://…' }],
  itms: 'ITMS-9xxxx',                 // iOS only, when the upload error code is known
  masvs: 'MASVS-NETWORK-1',           // optional
  category: 'security',               // store | security | privacy
});
```

Severity guide:

| Severity | Use when |
|---|---|
| `blocker` | The upload or review is rejected automatically, or a server secret is exposed |
| `high` | Likely human-review rejection or a serious security weakness |
| `medium` | Should be fixed before launch |
| `low` | Hygiene / best practice |
| `info` | Guidance that needs a manual decision |

If the check maps to an OWASP MASVS control, add its id to the matching item in `MASVS` inside `src/report/pages.js` so the checklist auto-verifies it.

## 3. A new SDK fingerprint

Append to `SDKS` in `src/rules/signatures.js`:

```js
{ name: 'Acme Analytics', cat: 'Analytics', a: ['com/acme/analytics'], i: ['AcmeAnalytics'], f: ['package:acme_analytics'], data: ['App interactions', 'Device or other IDs'], ads: false }
```

- `a`: substrings of DEX class descriptors (`com/vendor/sdk`)
- `i`: iOS symbol or framework names
- `f`: Flutter package URIs found in `libapp.so` / `App.framework`
- `data`: feeds the Data safety / App Privacy draft

## 4. Test it

Build a synthetic package in a test using `buildZip`, `encodeAxml`, `buildElf`, `buildMacho` and `plistXml` from `src/core/`, then assert on `report.checks`. Run `npm test`.
