import test from 'node:test';
import assert from 'node:assert/strict';

import { validateReleaseManifest } from '../wrapper/release-manifest.mjs';

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
