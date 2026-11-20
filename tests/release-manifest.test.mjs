import test from 'node:test';
import assert from 'node:assert/strict';

import { generateKeyPairSync, sign } from 'node:crypto';

import { validateReleaseManifest } from '../wrapper/release-manifest.mjs';
import { verifyReleaseManifestSignature } from '../wrapper/release-signature.mjs';

const validManifest = {
  schemaVersion: 1,
  pluginVersion: '0.1.3',
  rapidrawVersion: '1.7.0',
  artifacts: [
    {
      file: 'RapidRAW_1.7.0_x64_en-US.msi',
      kind: 'msi',
      sha256: 'a'.repeat(64),
    },
    {
      file: 'RapidRAW_1.7.0_x64-setup.exe',
      kind: 'nsis',
      sha256: 'b'.repeat(64),
    },
  ],
};

test('accepts a complete release manifest with matching artifacts', () => {
  const manifest = validateReleaseManifest(validManifest);
  assert.equal(manifest.rapidrawVersion, '1.7.0');
  assert.equal(manifest.artifacts.length, 2);
});

test('rejects a release manifest without both native installer channels', () => {
  assert.throws(
    () => validateReleaseManifest({ ...validManifest, artifacts: [validManifest.artifacts[0]] }),
    /both MSI and NSIS/i,
  );
});

test('rejects unsafe or unverifiable artifact entries', () => {
  const unsafe = structuredClone(validManifest);
  unsafe.artifacts[0].file = '../RapidRAW_1.7.0_x64_en-US.msi';
  assert.throws(() => validateReleaseManifest(unsafe), /filename/i);

  const unhashed = structuredClone(validManifest);
  unhashed.artifacts[1].sha256 = 'not-a-sha256';
  assert.throws(() => validateReleaseManifest(unhashed), /SHA-256/i);
});

test('verifies an Ed25519 signature over the exact manifest bytes', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const manifestBytes = Buffer.from(`${JSON.stringify(validManifest, null, 2)}\n`, 'utf8');
  const signature = sign(null, manifestBytes, privateKey).toString('base64');

  assert.equal(verifyReleaseManifestSignature(manifestBytes, signature, publicKey.export({ type: 'spki', format: 'pem' })), true);
  assert.equal(verifyReleaseManifestSignature(Buffer.from('changed', 'utf8'), signature, publicKey.export({ type: 'spki', format: 'pem' })), false);
  assert.equal(verifyReleaseManifestSignature(manifestBytes, 'not-base64', publicKey.export({ type: 'spki', format: 'pem' })), false);
});
