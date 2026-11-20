import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uninstaller = fileURLToPath(new URL('../installer/uninstall.mjs', import.meta.url));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('uninstaller rejects manifest paths that escape the selected RapidRAW tree', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'rapidraw-blur-noise-path-'));
  const root = join(parent, 'tree');
  const victim = join(parent, 'victim.txt');
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(parent, { recursive: true, force: true });
  });

  await mkdir(root, { recursive: true });
  await writeFile(victim, 'do not delete');
  await writeFile(join(root, '.blur-noise-plugin-manifest.json'), JSON.stringify({
    pluginVersion: '0.1.3',
    files: {
      '../victim.txt': { kind: 'copy', addedByPlugin: true },
    },
  }));

  const result = spawnSync(process.execPath, [uninstaller, '--rapidraw', root], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /unsafe manifest path/i);
  assert.equal(await readFile(victim, 'utf8'), 'do not delete');
});

test('uninstaller refuses to overwrite a managed file changed after installation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rapidraw-blur-noise-uninstall-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });

  await mkdir(join(root, '.blur-noise-plugin-backup'), { recursive: true });
  await writeFile(join(root, 'managed.txt'), 'user changes');
  await writeFile(join(root, '.blur-noise-plugin-backup', 'managed.txt'), 'original content');
  await writeFile(join(root, '.blur-noise-plugin-manifest.json'), JSON.stringify({
    pluginVersion: '0.1.3',
    files: {
      'managed.txt': { kind: 'patch', hashAfter: sha256('plugin content') },
    },
  }));

  const result = spawnSync(process.execPath, [uninstaller, '--rapidraw', root], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /modified after install|hash mismatch/i);
  assert.equal(await readFile(join(root, 'managed.txt'), 'utf8'), 'user changes');
});
