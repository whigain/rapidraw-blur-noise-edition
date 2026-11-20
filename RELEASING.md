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
- [ ] `npm run assemble-release` to create the SHA-256 release manifest and third-party notices.
- [ ] Smoke-test `BlurNoisePluginInstaller.exe` with the prompt declined and intact artifacts.
- [ ] Modify one copied artifact and verify the updater rejects its SHA-256 mismatch.
- [ ] Test both MSI and NSIS selection paths against disposable existing RapidRAW installations.

## Publish

- [ ] Complete every requirement in [PUBLISHING.md](PUBLISHING.md) before publishing binary assets.
- [ ] Create a Git tag and GitHub Release.
- [ ] Upload `BlurNoisePluginInstaller.exe`, the matching MSI and NSIS setup artifacts, `release-manifest.json`, and `THIRD_PARTY_NOTICES.txt`.
- [ ] State supported RapidRAW version, SHA-256 hashes, known limitations, signing status, and upgrade instructions.
