# Binary release publishing requirements

The source repository can be published without binaries. Public releases ship one self-contained Windows executable.

## Required integrity controls

1. **Sign the embedded `release-manifest.json`** with the offline Ed25519 release key. The private key stays outside the repository and is provided to GitHub Actions as `RAPIDRAW_RELEASE_SIGNING_KEY`.
2. Embed the exact matching RapidRAW MSI + NSIS artifacts, detached manifest signature, and third-party notices into `BlurNoisePluginInstaller.exe`.
3. Verify the signed manifest and every embedded installer SHA-256 before building the final EXE.
4. Publish the final EXE SHA-256 in the GitHub Release notes.

The updater verifies the embedded manifest against its compiled-in public key, selects the installed RapidRAW channel, and extracts only that verified installer into a disposable temporary directory.

## Authenticode status

Authenticode signing is optional for this project. Without it Windows SmartScreen may warn users that the publisher is unknown. Release notes and the README must state this clearly. Ed25519 protects the internal payload, but it is not a replacement for Windows publisher identity.

## Required release contents

Publish exactly one asset:

- `BlurNoisePluginInstaller.exe`

The MSI, NSIS setup, signed manifest, signature, and `THIRD_PARTY_NOTICES.txt` are build inputs embedded in the EXE—not separate downloads.

## Release account setup

Configure GitHub Actions permissions, `RAPIDRAW_REPO`, `RAPIDRAW_REF`, and the `RAPIDRAW_RELEASE_SIGNING_KEY` secret. Never commit certificates, private keys, passwords, or release credentials.
