# Contributing

## Scope

This repository provides a clean-room source-tree patcher and end-user updater for RapidRAW Blur Noise Edition. RapidRAW has no public plugin API, so changes must remain installable, reversible, and compatible with a specific upstream RapidRAW release.

Do not decompile, reverse engineer, copy code from, or extract assets from commercial software.

## Development setup

- Node.js 22 or newer
- A RapidRAW source checkout matching the target release
- Rust/Cargo and the Tauri toolchain for host builds

```bash
npm ci
npm test
```

## Change requirements

1. Keep code and code comments in English.
2. Add or update a focused test for behavior changes.
3. Keep `installer/install.mjs` idempotent and preserve manifest/hash checks.
4. Never overwrite a managed target file with a changed hash without an explicit `--force` path.
5. Test the generated end-user updater against an existing RapidRAW installation with the installer prompt declined before publishing.
6. Run `npm test` before opening a pull request.

## Target-version policy

Each release bundle is built from and tested against one RapidRAW upstream version. Do not label a release as compatible with an upstream version that was not built and tested.

## Pull requests

Describe the RapidRAW version tested, installer path used, verification commands, and any GUI smoke-test coverage.
