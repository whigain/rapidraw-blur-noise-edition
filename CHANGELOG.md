# Changelog

All notable changes to this project are documented here.

## [0.2.0] - 2026-11-20

### Changed

- GitHub releases now contain one self-contained `BlurNoisePluginInstaller.exe` instead of six companion files.
- The EXE embeds the MSI, NSIS setup, Ed25519-signed manifest, signature, and third-party notices.
- Runtime verification checks both embedded installer hashes before selecting the installed RapidRAW channel.
- Only the selected installer is extracted into a disposable temporary directory and removed after use.
- Release automation now signs the internal payload first, builds the single EXE, and uploads only that EXE.

### Verified

- 27 automated tests, isolated one-file SEA smoke test, embedded signature/hash verification, channel detection, and clean prompt-decline exit.

## [0.1.3] - 2026-11-18

### Added

- Gaussian Blur, procedural Noise, and Film Noise adjustment sections.
- Seed reroll controls, opacity controls, monochrome options, film response, and film-stock presets.
- Copy/Paste coverage for Blur Noise adjustment groups.
- End-user updater that detects an existing RapidRAW installation and launches the matching native installer.
- Wrapper checks for installed and bundled RapidRAW versions, prefers the current installer channel, chooses the newest compatible bundled release, and refuses downgrades.

### Fixed

- Film-noise custom stock detection and monochrome blue-tint behavior.
- Image-space noise sampling to reduce preview instability across zoom levels.
- Value-noise sampling for grain sizes above one pixel.
- Upgrade reconciliation for newly introduced Copy/Paste adjustment keys.

### Verified

- Plugin tests, installer dry-run, TypeScript check, Rust check, WGSL validation, frontend build, GUI smoke tests, and a Windows Tauri release bundle.
