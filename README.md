# RapidRAW Blur Noise Edition

Gaussian Blur, procedural Noise, and Film Noise for [RapidRAW](https://github.com/CyberTimon/RapidRAW).

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

The release contains five files that must remain in the same folder:

```text
BlurNoisePluginInstaller.exe
RapidRAW_1.7.0_x64-setup.exe
RapidRAW_1.7.0_x64_en-US.msi
release-manifest.json
THIRD_PARTY_NOTICES.txt
```

`release-manifest.json` pins the expected filenames and SHA-256 digests. The updater verifies the selected native installer before it launches it.

1. Close RapidRAW.
2. Start `BlurNoisePluginInstaller.exe`.
3. Confirm the detected RapidRAW installation and update prompt.
4. Open RapidRAW and find **Gaussian Blur**, **Noise**, and **Film Noise** in the Effects panel.

The updater upgrades the existing installation, for example:

```text
C:\Users\<user>\AppData\Local\RapidRAW
```

Do **not** run the source-tree patcher against that folder. It contains a compiled application, not a RapidRAW source checkout.

> The updater is currently unsigned. Windows may display a SmartScreen warning until a release is code-signed. Do not publish binary assets until the controls in [PUBLISHING.md](PUBLISHING.md) are complete.

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
npm run build-exe
# Copy the matching RapidRAW_<version>_x64-setup.exe and RapidRAW_<version>_x64_<locale>.msi into dist/
npm run assemble-release
```

Publish the files in `dist/` as GitHub Release assets. They are intentionally ignored by Git.

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
