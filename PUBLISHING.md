# Binary release publishing requirements

The source repository can be published without binary assets. Do **not** publish `dist/` assets as a public release until all requirements below are met.

## Required authenticity controls

1. **Authenticode-sign `BlurNoisePluginInstaller.exe`** with a certificate controlled by the release maintainer.
2. **Authenticode-sign the bundled RapidRAW MSI and NSIS artifacts**, or publish only upstream artifacts whose signatures have been verified before release assembly.
3. **Sign `release-manifest.json`** with an offline release signing key and make the updater verify that detached signature against an embedded public key.
4. Publish SHA-256 checksums for every release asset in the GitHub Release notes.

The current `release-manifest.json` guards against accidental corruption or a changed individual installer file. It does not authenticate a complete replacement of the updater, manifest, and payload as a set.

## Required release contents

- `BlurNoisePluginInstaller.exe`
- matching RapidRAW NSIS setup
- matching RapidRAW MSI
- `release-manifest.json`
- `THIRD_PARTY_NOTICES.txt` generated from the exact Node runtime used for the SEA executable

## Release account setup

Before the first public release, create a GitHub repository remote, configure GitHub Actions permissions as needed, and set up the signing certificate/private signing key outside the repository. Never commit certificates, private keys, passwords, or release credentials.
