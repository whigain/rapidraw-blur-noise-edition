# Release checklist

Use this checklist for every RapidRAW target-version update.

## Prepare

- [ ] Start from a compatible RapidRAW source checkout.
- [ ] Record the exact upstream RapidRAW version in `CHANGELOG.md` and the release notes.
- [ ] Run the source-tree installer dry-run before a real install.

## Verify

- [ ] `npm ci`
- [ ] `npm test`
- [ ] `node installer/install.mjs --rapidraw <source-tree> --dry-run`
- [ ] Real installer run with manifest/hash verification
- [ ] `cargo check` in `src-tauri`
- [ ] WGSL validation with the actual assembled preamble
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] GUI smoke test on a real image

## Package

- [ ] `npm run tauri build`
- [ ] Verify generated MSI/NSIS paths and sizes.
- [ ] `npm run build-exe`
- [ ] Copy exactly one matching MSI and one matching NSIS setup artifact into `dist/`.
- [ ] `RAPIDRAW_RELEASE_SIGNING_KEY=<path-to-offline-ed25519-private-key> npm run assemble-release` to create the SHA-256 manifest, detached signature, and third-party notices.
- [ ] Confirm `release-manifest.sig` verifies against `wrapper/release-public-key.pem` before publishing.
- [ ] Smoke-test `BlurNoisePluginInstaller.exe` with the prompt declined and intact artifacts.
- [ ] Modify one copied artifact and verify the updater rejects its SHA-256 mismatch.
- [ ] Test both MSI and NSIS selection paths against disposable existing RapidRAW installations.

## Publish

- [ ] Complete every requirement in [PUBLISHING.md](PUBLISHING.md) before publishing binary assets.
- [ ] Create a Git tag and GitHub Release.
- [ ] Upload `BlurNoisePluginInstaller.exe`, the matching MSI and NSIS setup artifacts, `release-manifest.json`, `release-manifest.sig`, and `THIRD_PARTY_NOTICES.txt`.
- [ ] State supported RapidRAW version, SHA-256 hashes, known limitations, signing status, and upgrade instructions.

## Automated releases (GitHub Actions)

`.github/workflows/release.yml` reproduces the whole `Package` + `Publish`
chain on a `windows-latest` runner, modeled on upstream RapidRAW's
`release.yml`. It triggers when a GitHub Release is **created** (draft or
published), and can also be started manually via **Run workflow**.

What the job does, in order: checkout this repo + a matching RapidRAW source →
Rust/Node setup → `npm ci` + `npm test` → `installer/install.mjs` dry-run then
real patch → build the patched RapidRAW (`npx tauri build --bundles nsis,msi`)
→ stage both installers into `dist/` → `npm run build-exe` → `npm run
assemble-release` (signs with the Ed25519 key from a secret) → verify the
signed manifest against the embedded public key → `gh release upload` all six
assets to the triggering release.

### One-time repository configuration

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `RAPIDRAW_REPO` | `owner/name` of the RapidRAW source repo (default `CyberTimon/RapidRAW`) |
| Variable | `RAPIDRAW_REF` | git tag/branch/SHA whose source matches this plugin's patch anchors |
| Secret | `RAPIDRAW_RELEASE_SIGNING_KEY` | the offline Ed25519 **private** key (PEM); its public half is `wrapper/release-public-key.pem` |

**Important — matching source:** this edition targets RapidRAW **1.7.0**, which
is not a public upstream tag. The patcher fails loudly if `RAPIDRAW_REF` points
at source whose anchors differ, so `RAPIDRAW_REF` must resolve to the exact
RapidRAW 1.7.0 source the patches were written against (e.g. a fork/branch you
control that hosts that source). If the source repo is private, also provide a
checkout token for the RapidRAW checkout step.

The workflow never commits the signing key or any `dist/` binary; it writes the
key to `RUNNER_TEMP` for the signing step only and deletes it immediately.
