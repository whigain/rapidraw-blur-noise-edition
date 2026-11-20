# Security Policy

## Supported versions

Security fixes are provided for the latest published Blur Noise Edition release only.

## Reporting a vulnerability

Do not open a public issue for vulnerabilities that could expose local files, execute arbitrary commands, bypass installer integrity checks, or modify an unintended RapidRAW installation.

Instead, contact the repository maintainer privately with:

- affected Blur Noise Edition version;
- RapidRAW version and operating system;
- reproduction steps or a minimal proof of concept;
- impact assessment.

Reports will be acknowledged as soon as practical. Please allow time for a fix before public disclosure.

## Installer safety

The installer intentionally operates only on a RapidRAW source tree, while the end-user updater installs a prebuilt RapidRAW edition through its native installer. Neither tool should accept arbitrary paths or bypass manifest integrity checks by default.
