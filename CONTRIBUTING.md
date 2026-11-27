# Contributing to StoreReady

Thanks for helping developers ship without rejections! 🎉

## Ground rules

- **Zero runtime dependencies.** The site must keep working by opening `index.html` from any static host. No bundler, no npm packages in `src/`.
- **Privacy first.** No network requests from the page, no analytics. The CSP (`default-src 'self'`) must stay strict.
- **Cite sources.** Every store rule needs a link to the official Google or Apple page.
- **No real secrets or real apps in the repo.** Tests build synthetic packages (see `src/core/samples.js`). Assemble fake credential strings at runtime (`['sk', 'live', ...].join('_')`) so GitHub secret scanning stays quiet.

## Development

```bash
python3 -m http.server 8080   # then open http://localhost:8080
npm test                      # node:test — must pass before a PR
node cli/storeready.mjs path/to/app.aab
```

## Most-wanted contributions

1. **Policy updates.** When Google or Apple announce a new requirement, update `src/rules/policy.js` (constants + `POLICY_TIMELINE`) and bump `LAST_REVIEWED`. Use the *Store policy changed* issue template if you can't send a PR.
2. **New checks.** See [docs/ADDING_RULES.md](docs/ADDING_RULES.md).
3. **SDK fingerprints** in `src/rules/signatures.js` (class paths for Android, symbols/framework names for iOS, `package:` names for Flutter).
4. **Framework guides** in `src/report/frameworks.js` and `src/report/pages.js`.
5. **Translations** of the guides.

## Pull requests

- One topic per PR; add or update a test in `tests/`.
- Follow the existing style (2-space indent, ES modules, `// SPDX-License-Identifier: MIT` header).
- Describe *why*: link the store policy, rejection email or ITMS code that motivated the change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for titles (`feat:`, `fix:`, `rules:`, `docs:`).

By contributing you agree that your work is licensed under the MIT License and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
