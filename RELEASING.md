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
- [ ] Copy exactly one matching MSI and one matching NSIS setup artifact into `dist/`.
- [ ] `RAPIDRAW_RELEASE_SIGNING_KEY=<path-to-offline-ed25519-private-key> npm run assemble-release` to create the internal SHA-256 manifest, detached signature, and third-party notices.
- [ ] Confirm `release-manifest.sig` verifies against `wrapper/release-public-key.pem`.
- [ ] `npm run build-exe` to embed MSI + NSIS + signed manifest + notices into one EXE.
- [ ] Copy only `BlurNoisePluginInstaller.exe` to an otherwise empty folder and smoke-test it with the prompt declined.
- [ ] Test both MSI and NSIS selection paths against disposable existing RapidRAW installations.

## Publish

- [ ] Create a Git tag and GitHub Release.
- [ ] Upload only `BlurNoisePluginInstaller.exe`.
- [ ] State supported RapidRAW version, the EXE SHA-256, known limitations, signing status, and upgrade instructions.

## Automated releases (GitHub Actions)

`.github/workflows/release.yml` reproduces the whole `Package` + `Publish`
chain on a `windows-latest` runner, modeled on upstream RapidRAW's
`release.yml`. It triggers when a GitHub Release is **published**, and can also
be started manually via **Run workflow** (with `release_tag` for a rebuild that
uploads to an existing release).

What the job does, in order: checkout this repo + upstream RapidRAW at the pinned tag →
Rust/Node setup → `npm ci` + `npm test` → `installer/install.mjs` dry-run then
real patch → build the patched RapidRAW (`npx tauri build --bundles nsis,msi`)
→ stage both installers into `dist/` → create and verify the Ed25519-signed
internal payload → `npm run build-exe` embeds everything into one SEA executable
→ `gh release upload` publishes only `BlurNoisePluginInstaller.exe`.

### One-time repository configuration

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `RAPIDRAW_REPO` | `owner/name` of the RapidRAW source repo (default `CyberTimon/RapidRAW`) |
| Variable | `RAPIDRAW_REF` | git tag/branch/SHA whose source matches this plugin's patch anchors |
| Secret | `RAPIDRAW_RELEASE_SIGNING_KEY` | the offline Ed25519 **private** key (PEM); its public half is `wrapper/release-public-key.pem` |

**Important — matching source:** this edition targets the public upstream tag
`CyberTimon/RapidRAW@v1.7.0`. The patcher fails loudly if `RAPIDRAW_REF` points
at source whose anchors differ. Windows checkouts must force LF line endings,
because the patch anchors intentionally use LF.

The workflow never commits the signing key or any `dist/` binary; it writes the
key to `RUNNER_TEMP` for the signing step only and deletes it immediately.
