# RapidRAW Blur Noise Edition

[![Latest release](https://img.shields.io/github/v/release/whigain/rapidraw-blur-noise-edition?sort=semver&display_name=tag)](https://github.com/whigain/rapidraw-blur-noise-edition/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/whigain/rapidraw-blur-noise-edition/total)](https://github.com/whigain/rapidraw-blur-noise-edition/releases)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)](LICENSE)
![Platform: Windows x64](https://img.shields.io/badge/platform-Windows%20x64-lightgrey)
![Target: RapidRAW 1.7.0](https://img.shields.io/badge/RapidRAW-1.7.0-brightgreen)

Gaussian Blur, procedural Noise, and Film Noise for [RapidRAW](https://github.com/CyberTimon/RapidRAW).

## Download

[**⬇ Download the latest release**](https://github.com/whigain/rapidraw-blur-noise-edition/releases/latest)

Download **only** `BlurNoisePluginInstaller.exe` from the latest release, close RapidRAW, and run it. The EXE already contains the signed manifest plus both RapidRAW installer channels; it selects and temporarily extracts only the one your local installation needs. It installs the Blur Noise Edition into your existing **RapidRAW 1.7.0** — then open RapidRAW and find **Gaussian Blur**, **Noise**, and **Film Noise** in the Effects panel. (Windows may show a SmartScreen notice because the build is unsigned — *More info → Run anyway*.)

> **Important:** RapidRAW currently has no public runtime plugin API. This project is therefore a clean-room, versioned **source-tree patcher** plus a Windows **end-user updater** that installs a prebuilt RapidRAW edition. It never decompiles or patches a compiled RapidRAW binary in place.

## Features

- Gaussian Blur with an adjustable radius
- Procedural noise with amount, opacity, uniform/Gaussian distribution, monochrome mode, and seed reroll
- Film Noise with stock presets, `Custom` detection, grain size, opacity, monochrome mode, response control, and seed reroll
- Image-space noise sampling to keep the grain visually stable across preview zoom levels
- Copy/Paste groups covering Blur, Noise, and Film Noise settings
- Manifest-protected, idempotent source-tree installation and rollback support
- Windows end-user updater that locates an installed RapidRAW instance and launches the appropriate native installer

## Compatibility

| Component | Supported target |
| --- | --- |
| End-user Windows package | RapidRAW **1.7.0**, x64 |
| Source-tree patcher | A compatible RapidRAW source checkout with the expected patch anchors |
| Node.js | 22 or newer |
| Build toolchain | Rust/Cargo + Tauri toolchain required only for source builds |

Each upstream RapidRAW release must receive its own tested Blur Noise Edition bundle. The end-user updater detects the existing installation, reads its EXE version, selects the existing installer channel (NSIS/MSI), chooses the newest bundled compatible build, and refuses a downgrade.

## End-user installation — Windows

The release has one download:

```text
BlurNoisePluginInstaller.exe
```

The EXE embeds the matching MSI and NSIS installers, `release-manifest.json`, its Ed25519 signature, and the third-party notices. At startup it verifies the exact manifest bytes and both embedded installer SHA-256 hashes, detects the existing installation channel, and extracts only the selected native installer into a disposable temporary directory.

1. Close RapidRAW.
2. Start `BlurNoisePluginInstaller.exe`.
3. Confirm the detected RapidRAW installation and update prompt.
4. Open RapidRAW and find **Gaussian Blur**, **Noise**, and **Film Noise** in the Effects panel.

The updater upgrades the existing installation, for example:

```text
C:\Users\<user>\AppData\Local\RapidRAW
```

Do **not** run the source-tree patcher against that folder. It contains a compiled application, not a RapidRAW source checkout.

> The EXE is currently not Authenticode-signed, like upstream RapidRAW builds may also be. Windows can therefore display a SmartScreen warning. The embedded Ed25519 signature still protects the internal release manifest and installer hashes.

## Developer installation — RapidRAW source tree

Use this path only with a RapidRAW source checkout:

```bash
npm ci
npm test
node installer/install.mjs --rapidraw "C:/path/to/RapidRAW-main" --dry-run
node installer/install.mjs --rapidraw "C:/path/to/RapidRAW-main"
```

Then verify and build the patched host:

```bash
cd "C:/path/to/RapidRAW-main/src-tauri" && cargo check
cd "C:/path/to/RapidRAW-main" && npx tsc --noEmit && npm run build
npm run tauri build
```

The patcher writes a manifest and preserves originals under the target source tree. It refuses to overwrite a managed file whose hash has changed unless `--force` is used deliberately.

## Development

```bash
npm ci
npm test
```

Build the Windows end-user updater after a successful RapidRAW release build:

```bash
# Copy the matching RapidRAW_<version>_x64-setup.exe and RapidRAW_<version>_x64_<locale>.msi into dist/
RAPIDRAW_RELEASE_SIGNING_KEY=<offline-ed25519-private-key> npm run assemble-release
npm run build-exe
```

`build-exe` verifies the signed payload and embeds it into `dist/BlurNoisePluginInstaller.exe`. Publish only that EXE as the GitHub Release asset; the intermediate installers, manifest, signature, and notices remain CI/build inputs and are intentionally ignored by Git.

## Verification

The project test suite covers pure adjustment and installer-selection logic. A full release verification also includes:

1. `npm test`
2. installer `--dry-run`
3. `cargo check`
4. TypeScript check and frontend build
5. WGSL validation with Naga
6. GUI smoke testing with a real RapidRAW render
7. `npm run tauri build`
8. smoke testing the end-user updater against an existing RapidRAW installation

## Clean-room policy

This project reproduces generally known image-effect behavior without copying code or assets from commercial software. Do not add reverse-engineered code, extracted binaries, proprietary LUTs, or vendor assets.

## License

RapidRAW is licensed under the GNU Affero General Public License v3.0. This project distributes patches and a rebuilt RapidRAW edition, so it is also licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE).

## Disclaimer

This is an independent community project and is not affiliated with, endorsed by, or supported by the RapidRAW maintainers.

## Contributing and security

- See [CONTRIBUTING.md](CONTRIBUTING.md) for development and compatibility rules.
- See [SECURITY.md](SECURITY.md) for responsible disclosure guidance.
- See [CHANGELOG.md](CHANGELOG.md) for release notes.
- See [PUBLISHING.md](PUBLISHING.md) for binary-release security requirements.
