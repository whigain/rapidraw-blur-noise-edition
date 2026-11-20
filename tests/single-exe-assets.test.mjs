import test from 'node:test';
import assert from 'node:assert/strict';

import { createSeaAssetMap } from '../wrapper/single-exe-assets.mjs';

const manifest = {
  schemaVersion: 1,
  pluginVersion: '0.2.0',
  rapidrawVersion: '1.7.0',
  artifacts: [
    { file: 'RapidRAW_1.7.0_x64_en-US.msi', kind: 'msi', sha256: 'a'.repeat(64) },
    { file: 'RapidRAW_1.7.0_x64-setup.exe', kind: 'nsis', sha256: 'b'.repeat(64) },
  ],
};

test('maps every signed release payload into the Node SEA asset table', () => {
  assert.deepEqual(createSeaAssetMap(manifest), {
    'release-manifest.json': '../dist/release-manifest.json',
    'release-manifest.sig': '../dist/release-manifest.sig',
    'THIRD_PARTY_NOTICES.txt': '../dist/THIRD_PARTY_NOTICES.txt',
    'RapidRAW_1.7.0_x64_en-US.msi': '../dist/RapidRAW_1.7.0_x64_en-US.msi',
    'RapidRAW_1.7.0_x64-setup.exe': '../dist/RapidRAW_1.7.0_x64-setup.exe',
  });
});
