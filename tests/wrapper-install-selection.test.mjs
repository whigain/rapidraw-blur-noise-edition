import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareVersions,
  parseBundleVersion,
  selectBundle,
  shouldAllowInstall,
} from '../wrapper/install-selection.mjs';

test('parses a Tauri bundle version from MSI and NSIS filenames', () => {
  assert.equal(parseBundleVersion('RapidRAW_1.7.0_x64_en-US.msi'), '1.7.0');
  assert.equal(parseBundleVersion('RapidRAW_1.7.0_x64-setup.exe'), '1.7.0');
  assert.equal(parseBundleVersion('RapidRAW_setup.exe'), null);
});

test('prefers the existing installation channel when both bundles exist', () => {
  const bundles = [
    { kind: 'msi', path: 'RapidRAW_1.7.0_x64_en-US.msi' },
    { kind: 'nsis', path: 'RapidRAW_1.7.0_x64-setup.exe' },
  ];

  assert.equal(selectBundle(bundles, 'nsis').kind, 'nsis');
  assert.equal(selectBundle(bundles, 'msi').kind, 'msi');
  assert.equal(selectBundle([{ kind: 'nsis', path: 'RapidRAW_1.7.0_x64-setup.exe' }], 'msi'), null);
  assert.equal(selectBundle([{ kind: 'nsis', path: 'RapidRAW_setup.exe' }], 'nsis'), null);
  assert.equal(
    selectBundle([{ kind: 'nsis', file: 'RapidRAW_1.7.0_x64-setup.exe' }], 'nsis').file,
    'RapidRAW_1.7.0_x64-setup.exe',
  );
  assert.equal(
    selectBundle([
      { kind: 'nsis', path: 'RapidRAW_1.6.9_x64-setup.exe' },
      { kind: 'nsis', path: 'RapidRAW_1.7.0_x64-setup.exe' },
    ], 'nsis').path,
    'RapidRAW_1.7.0_x64-setup.exe',
  );
});

test('allows an upgrade but rejects a downgrade', () => {
  assert.ok(compareVersions('1.7.0', '1.6.9') > 0);
  assert.equal(shouldAllowInstall('1.6.9', '1.7.0'), true);
  assert.equal(shouldAllowInstall('unknown', '1.7.0'), true);
  assert.equal(shouldAllowInstall('unbekannt', '1.7.0'), true);
  assert.equal(shouldAllowInstall('1.7.0', '1.6.9'), false);
});
