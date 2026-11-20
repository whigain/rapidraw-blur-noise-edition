import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadVerifiedRelease } from '../wrapper/release-bundle.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function createSignedRelease() {
  const dir = await mkdtemp(join(tmpdir(), 'rapidraw-release-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const msi = Buffer.from('msi-payload');
  const nsis = Buffer.from('nsis-payload');
  await writeFile(join(dir, 'RapidRAW_1.7.0_x64_en-US.msi'), msi);
  await writeFile(join(dir, 'RapidRAW_1.7.0_x64-setup.exe'), nsis);
  const manifest = {
    schemaVersion: 1,
    pluginVersion: '0.1.3',
    rapidrawVersion: '1.7.0',
    artifacts: [
      { file: 'RapidRAW_1.7.0_x64_en-US.msi', kind: 'msi', sha256: sha256(msi) },
      { file: 'RapidRAW_1.7.0_x64-setup.exe', kind: 'nsis', sha256: sha256(nsis) },
    ],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(join(dir, 'release-manifest.json'), manifestBytes);
  await writeFile(join(dir, 'release-manifest.sig'), `${sign(null, manifestBytes, privateKey).toString('base64')}\n`);
  return { dir, publicKey: publicKey.export({ type: 'spki', format: 'pem' }) };
}

test('loads a release only when its manifest signature and artifact hashes verify', async (t) => {
  const release = await createSignedRelease();
  t.after(() => rm(release.dir, { recursive: true, force: true }));

  const manifest = await loadVerifiedRelease(release.dir, release.publicKey);
  assert.equal(manifest.rapidrawVersion, '1.7.0');

  await writeFile(join(release.dir, 'release-manifest.json'), '{"tampered":true}\n');
  await assert.rejects(() => loadVerifiedRelease(release.dir, release.publicKey), /signature/i);
});
