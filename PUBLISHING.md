# Binary release publishing requirements

The source repository can be published without binary assets. Do **not** publish `dist/` assets as a public release until all requirements below are met.

## Required authenticity controls

1. **Authenticode-sign `BlurNoisePluginInstaller.exe`** with a certificate controlled by the release maintainer.
2. **Authenticode-sign the bundled RapidRAW MSI and NSIS artifacts**, or publish only upstream artifacts whose signatures have been verified before release assembly.
3. **Sign `release-manifest.json`** with the offline Ed25519 release key and distribute the matching `release-manifest.sig`. The updater verifies it against its embedded public key. The private key stays outside the repository.
4. Publish SHA-256 checksums for every release asset in the GitHub Release notes.

The signed manifest authenticates the native installer hashes to the updater's embedded public key. Authenticode signing is still required to let Windows and users detect replacement of the updater itself.

## Required release contents

- `BlurNoisePluginInstaller.exe`
- matching RapidRAW NSIS setup
- matching RapidRAW MSI
- `release-manifest.json`
- `release-manifest.sig`
- `THIRD_PARTY_NOTICES.txt` generated from the exact Node runtime used for the SEA executable

## Release account setup

Before the first public release, create a GitHub repository remote, configure GitHub Actions permissions as needed, and set up the signing certificate/private signing key outside the repository. Never commit certificates, private keys, passwords, or release credentials.
