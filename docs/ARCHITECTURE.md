# Architecture

StoreReady is a static site plus a Node CLI that share one analysis engine. It has no build step and no runtime dependencies.

```
                ┌──────────────── Browser (index.html) ────────────────┐
 APK/AAB/IPA ──▶│ src/ui/app.js ── analyze() ──▶ report ──▶ buildPages │──▶ Notion-style pages, exports
                └──────────────────────────────────────────────────────┘
 APK/AAB/IPA ──▶  cli/storeready.mjs ── analyze() ──▶ report ──▶ Markdown docs, JSON, exit code
```

## Layers

| Layer | Files | Responsibility |
|---|---|---|
| Core parsers | `src/core/zip.js` | Streaming ZIP reader over `Blob` (central directory, ZIP64, inflate via `DecompressionStream`) |
| | `src/core/axml.js` | Android binary XML (APK manifest), plus an encoder for tests/samples |
| | `src/core/protoxml.js` | aapt2 protobuf XML (AAB manifest) |
| | `src/core/plist.js` | XML + binary plists, `.mobileprovision` |
| | `src/core/binary.js` | ELF program headers (16 KB alignment), Mach-O fat/thin headers, `LC_BUILD_VERSION`, encryption, dylibs |
| | `src/core/scanner.js` | Chunked regex scanner: secrets, `http://` hosts, API/SDK markers |
| Rules | `src/rules/policy.js` | **Dated** store requirements: the only file to touch when policies change |
| | `src/rules/signatures.js` | SDK fingerprints, sensitive permissions, iOS purpose-string APIs, required-reason APIs |
| Analyzers | `src/analyzers/android.js`, `ios.js` | Run checks → `ReportBuilder.check({...})` records pass/fail/warn with severity, evidence, fix, refs |
| Report | `src/report/pages.js` | Turns a report into pages made of blocks (h2, callout, todo, toggle, table, issue…) |
| | `src/report/markdown.js` | Block model → Markdown |
| UI | `src/ui/render.js`, `app.js` | Block model → escaped HTML; router, persistence (localStorage), exports, search palette |

## Report shape (abridged)

```jsonc
{
  "platform": "android" | "ios",
  "format": "apk" | "aab" | "ipa",
  "app": { "id", "name", "versionName", "versionCode", ... },
  "framework": { "id": "flutter", "name": "Flutter", "details": [], "debugBuild": false },
  "checks": [{ "id": "play.targetSdk", "group", "title", "status": "pass|fail|warn|info|na", "severity", "detail", "evidence": [], "fix": { "default": [], "flutter": [] }, "refs": [], "itms", "masvs" }],
  "issues": [ /* failing checks sorted by severity */ ],
  "summary": { "score", "grade", "verdict", "ready", "counts": { "blocker", "high", ... } }
}
```

## Performance

- Only the central directory and the needed entries are read (`Blob.slice`), so a 2 GB IPA costs a few hundred MB of streaming at most.
- Each binary is streamed once: the scanner and the Mach-O header capture share a single pass.
- Scanning is capped per entry (256–400 MB) to keep the UI responsive.

## Security

- Every string from the analyzed file passes through `esc()` before it reaches `innerHTML`; links are only generated for `http(s)` URLs in our own rule text.
- CSP `default-src 'self'` with no inline scripts or styles; dynamic widths are set through the CSSOM.
