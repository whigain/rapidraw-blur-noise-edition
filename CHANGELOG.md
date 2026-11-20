# Changelog

All notable changes to this project are documented here.

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
