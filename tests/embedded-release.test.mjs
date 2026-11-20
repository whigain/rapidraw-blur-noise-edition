import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  extractEmbeddedInstaller,
  loadVerifiedEmbeddedRelease,
} from '../wrapper/embedded-release.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createEmbeddedAssets() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const msi = Buffer.from('embedded-msi-payload');
  const nsis = Buffer.from('embedded-nsis-payload');
  const manifest = {
    schemaVersion: 1,
    pluginVersion: '0.2.0',
    rapidrawVersion: '1.7.0',
    artifacts: [
      { file: 'RapidRAW_1.7.0_x64_en-US.msi', kind: 'msi', sha256: sha256(msi) },
      { file: 'RapidRAW_1.7.0_x64-setup.exe', kind: 'nsis', sha256: sha256(nsis) },
    ],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const assets = new Map([
    ['release-manifest.json', manifestBytes],
    ['release-manifest.sig', Buffer.from(`${sign(null, manifestBytes, privateKey).toString('base64')}\n`)],
    ['RapidRAW_1.7.0_x64_en-US.msi', msi],
    ['RapidRAW_1.7.0_x64-setup.exe', nsis],
    ['THIRD_PARTY_NOTICES.txt', Buffer.from('notices')],
  ]);
  const getAsset = (name) => {
    const asset = assets.get(name);
    if (!asset) throw new Error(`missing asset: ${name}`);
    return asset.buffer.slice(asset.byteOffset, asset.byteOffset + asset.byteLength);
  };
  return { assets, getAsset, publicKey: publicKey.export({ type: 'spki', format: 'pem' }) };
}

test('loads and verifies installers embedded in a single EXE bundle', () => {
  const release = createEmbeddedAssets();
  const loaded = loadVerifiedEmbeddedRelease(release.getAsset, release.publicKey);

  assert.equal(loaded.manifest.pluginVersion, '0.2.0');
  assert.equal(loaded.manifest.rapidrawVersion, '1.7.0');
  assert.equal(loaded.artifacts.get('nsis').bytes.toString(), 'embedded-nsis-payload');
  assert.equal(loaded.artifacts.get('msi').bytes.toString(), 'embedded-msi-payload');
  assert.equal(loaded.notices.toString(), 'notices');
});

test('rejects a single EXE bundle when an embedded installer hash is wrong', () => {
  const release = createEmbeddedAssets();
  release.assets.set('RapidRAW_1.7.0_x64-setup.exe', Buffer.from('tampered'));

  assert.throws(
    () => loadVerifiedEmbeddedRelease(release.getAsset, release.publicKey),
    /SHA-256 verification failed/i,
  );
});

test('extracts only the selected embedded installer into a disposable directory', async (t) => {
  const release = createEmbeddedAssets();
  const loaded = loadVerifiedEmbeddedRelease(release.getAsset, release.publicKey);
  const root = await mkdtemp(join(tmpdir(), 'embedded-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const extracted = await extractEmbeddedInstaller(loaded.artifacts.get('nsis'), root);
  assert.equal((await readFile(extracted.path)).toString(), 'embedded-nsis-payload');
  assert.match(extracted.path, /RapidRAW_1\.7\.0_x64-setup\.exe$/);

  await extracted.cleanup();
  await assert.rejects(() => readFile(extracted.path), /ENOENT/);
});
