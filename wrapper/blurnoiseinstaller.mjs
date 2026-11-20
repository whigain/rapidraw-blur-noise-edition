#!/usr/bin/env node
/* eslint-disable no-console */
//
// blurnoiseinstaller.mjs — End-user installer for RapidRAW Blur Noise Edition.
//
// This is the script that becomes `BlurNoisePluginInstaller.exe` via Node's
// Single Executable Application (SEA) feature. See build-exe.mjs.
//
// Flow at runtime:
//   1. Locate installed RapidRAW (Program Files, LocalAppData, Registry).
//   2. Locate the bundled Blur Noise MSI next to the exe (./RapidRAW_*.msi).
//   3. Show the user a short summary + confirm prompt.
//   4. Launch msiexec / NSIS setup to install/upgrade. Tauri installers use
//      a stable ProductCode, so this upgrades vanilla RapidRAW in-place to
//      the Blur Noise Edition.
//   5. Exit when the installer is done; report success/failure.
//
// Zero npm deps on purpose — the SEA bundle stays small and we don't need to
// vendor native modules. All I/O is Node stdlib.

import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectBundle, shouldAllowInstall } from './install-selection.mjs';
import { validateReleaseManifest } from './release-manifest.mjs';

const VERSION = '0.1.3';

// ---------------------------------------------------------------------------
// Pretty ANSI output — works in modern Windows terminals.
// ---------------------------------------------------------------------------
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const log = {
  title: (m) => console.log(`\n${C.bold}${m}${C.reset}`),
  step: (m) => console.log(`${C.cyan}▸${C.reset} ${m}`),
  ok: (m) => console.log(`  ${C.green}✓${C.reset} ${m}`),
  warn: (m) => console.log(`  ${C.yellow}!${C.reset} ${m}`),
  err: (m) => console.log(`  ${C.red}✗${C.reset} ${m}`),
  info: (m) => console.log(`  ${m}`),
  blank: () => console.log(''),
};

// ---------------------------------------------------------------------------
// Locate the directory of the running EXE/script, in both SEA and plain-node
// modes. In SEA mode process.execPath is the EXE itself; in plain node it's
// the node binary, so we fall back to the script's own URL.
// ---------------------------------------------------------------------------
function installerDir() {
  if (process.argv[0] && process.argv[0].toLowerCase().endsWith('blurnoiseplugininstaller.exe')) {
    return dirname(process.argv[0]);
  }
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

// ---------------------------------------------------------------------------
// Load the signed-release-equivalent manifest shipped next to the updater.
// The manifest is the only source of installer filenames. Every declared
// artifact is SHA-256 verified before the updater can launch it.
// ---------------------------------------------------------------------------
async function loadBundledRelease() {
  const dir = installerDir();
  const manifestPath = join(dir, 'release-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('release-manifest.json neben dem Updater fehlt. Bitte die vollständigen Release-Dateien zusammen entpacken.');
  }

  let manifest;
  try {
    manifest = validateReleaseManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  } catch (error) {
    throw new Error(`Release-Manifest ist ungültig: ${error.message}`);
  }

  for (const artifact of manifest.artifacts) {
    const artifactPath = join(dir, artifact.file);
    if (!existsSync(artifactPath)) {
      throw new Error(`Release-Artefakt fehlt: ${artifact.file}`);
    }
    const digest = createHash('sha256').update(await readFile(artifactPath)).digest('hex');
    if (digest !== artifact.sha256) {
      throw new Error(`SHA-256-Prüfung fehlgeschlagen: ${artifact.file}`);
    }
  }

  return { dir, manifest };
}

// ---------------------------------------------------------------------------
// Locate installed RapidRAW. Three signals in priority order:
//   1. Windows Registry Uninstall key (matches Tauri's MSI-installed entry)
//   2. Program Files\RapidRAW\RapidRAW.exe (Tauri default install path)
//   3. LocalAppData\Programs\RapidRAW\ (per-user install path)
// Returns { path, version } or null.
// ---------------------------------------------------------------------------
function tryRegistryLookup() {
  const roots = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  for (const root of roots) {
    try {
      const out = execFileSync('reg', ['query', root, '/s', '/f', 'RapidRAW', '/d'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000,
      });
      const blocks = out.split(/\r?\n\r?\n/);
      for (const block of blocks) {
        if (!/DisplayName\s+REG_SZ\s+RapidRAW\b/i.test(block)) continue;
        const loc = /InstallLocation\s+REG_SZ\s+([^\r\n]+)/i.exec(block);
        const ver = /DisplayVersion\s+REG_SZ\s+([^\r\n]+)/i.exec(block);
        if (loc && loc[1].trim()) {
          const path = loc[1].trim().replace(/^"|"$/g, '');
          return { path, version: ver?.[1]?.trim() ?? 'unbekannt', source: 'registry' };
        }
      }
    } catch {
      // reg key doesn't exist or no matches
    }
  }
  return null;
}

function tryFilesystemLookup() {
  const guesses = [
    process.env['LOCALAPPDATA'] && join(process.env['LOCALAPPDATA'], 'RapidRAW'),
    process.env['ProgramFiles'] && join(process.env['ProgramFiles'], 'RapidRAW'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'RapidRAW'),
    process.env['LOCALAPPDATA'] && join(process.env['LOCALAPPDATA'], 'Programs', 'RapidRAW'),
  ].filter(Boolean);
  for (const dir of guesses) {
    const exe = join(dir, 'RapidRAW.exe');
    if (existsSync(exe)) {
      return { path: dir, version: 'unbekannt', source: 'dateisystem' };
    }
  }
  return null;
}

function readExecutableVersion(exePath) {
  try {
    const escapedPath = exePath.replace(/'/g, "''");
    const output = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `(Get-Item -LiteralPath '${escapedPath}').VersionInfo.ProductVersion`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
    return /\d+(?:\.\d+){1,3}/.exec(output)?.[0] ?? null;
  } catch {
    return null;
  }
}

function detectInstallChannel(path) {
  return existsSync(join(path, 'uninstall.exe')) ? 'nsis' : 'msi';
}

function findInstalledRapidRaw() {
  const installed = tryRegistryLookup() ?? tryFilesystemLookup();
  if (!installed) return null;

  const exePath = join(installed.path, 'RapidRAW.exe');
  return {
    ...installed,
    version: readExecutableVersion(exePath) ?? installed.version ?? 'unknown',
    channel: detectInstallChannel(installed.path),
  };
}

// ---------------------------------------------------------------------------
// Confirm prompt. Keeps the EXE window open until the user answers (otherwise
// double-clicking the exe shows a flash and vanishes).
// ---------------------------------------------------------------------------
async function prompt(question, def = 'y') {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const hint = def === 'y' ? '[Y/n]' : '[y/N]';
    const ans = (await rl.question(`${question} ${hint} `)).trim().toLowerCase();
    if (!ans) return def === 'y';
    return ans === 'y' || ans === 'yes' || ans === 'j' || ans === 'ja';
  } finally {
    rl.close();
  }
}

async function pause(msg = 'Drücke ENTER zum Beenden...') {
  const rl = createInterface({ input: stdin, output: stdout });
  try { await rl.question(msg); } finally { rl.close(); }
}

// ---------------------------------------------------------------------------
// Launch the bundled installer.
// ---------------------------------------------------------------------------
function runInstaller(installer) {
  if (installer.kind === 'msi') {
    const args = ['/i', installer.path, '/passive', '/norestart'];
    log.step(`msiexec ${args.join(' ')}`);
    const res = spawnSync('msiexec.exe', args, { stdio: 'inherit' });
    if (res.status === null) throw new Error('msiexec konnte nicht gestartet werden (' + (res.error?.message ?? 'unbekannt') + ')');
    return res.status;
  }
  // NSIS setup — Tauri's NSIS supports /S (silent), /P (passive), /D=path.
  const args = ['/P'];
  log.step(`${basename(installer.path)} ${args.join(' ')}`);
  const res = spawnSync(installer.path, args, { stdio: 'inherit' });
  if (res.status === null) throw new Error('NSIS-Installer konnte nicht gestartet werden (' + (res.error?.message ?? 'unbekannt') + ')');
  return res.status;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`${C.bold}RapidRAW Blur Noise Plugin Installer v${VERSION}${C.reset}`);
  log.info(`${C.dim}Installiert die Blur Noise Edition (Gaussian Blur + Noise + Filmkorn) in deine bestehende RapidRAW-Installation.${C.reset}`);
  log.blank();

  const installed = findInstalledRapidRaw();
  let release;
  try {
    release = await loadBundledRelease();
  } catch (error) {
    log.err(error.message);
    await pause();
    process.exit(2);
  }
  const selected = selectBundle(release.manifest.artifacts, installed?.channel);
  const bundle = selected && { kind: selected.kind, path: join(release.dir, selected.file) };
  if (!bundle) {
    log.err(`Kein ${installed?.channel?.toUpperCase() ?? 'passender'} Installer im Release-Manifest gefunden.`);
    log.info('Das Release muss sowohl ein MSI- als auch ein NSIS-Artefakt enthalten.');
    await pause();
    process.exit(3);
  }
  const bundleVersion = release.manifest.rapidrawVersion;
  log.ok(`Blur-Noise-Edition-${bundle.kind.toUpperCase()} gefunden: ${basename(bundle.path)}`);

  if (installed) {
    log.ok(`Installiertes RapidRAW gefunden: ${installed.path}`);
    if (installed.version !== 'unbekannt') log.info(`  aktuelle Version: ${installed.version}`);
    if (bundleVersion) log.info(`  Blur-Noise-Edition: ${bundleVersion}`);
    log.info(`  Installationskanal: ${installed.channel.toUpperCase()}`);
    log.info(`${C.dim}  (Quelle: ${installed.source})${C.reset}`);
    if (!shouldAllowInstall(installed.version, bundleVersion)) {
      log.err(`Die gebündelte Blur-Noise-Edition ${bundleVersion} ist älter als die installierte Version ${installed.version}.`);
      log.info('Abbruch: bitte eine Blur-Noise-Edition für dieselbe oder eine neuere RapidRAW-Version verwenden.');
      await pause();
      process.exit(5);
    }
  } else {
    log.warn('Keine bestehende RapidRAW-Installation gefunden.');
    log.info('Der Installer installiert die Blur Noise Edition frisch.');
  }
  log.blank();

  const confirm = await prompt(
    installed
      ? `Blur Noise Edition über deine bestehende RapidRAW installieren?`
      : `RapidRAW Blur Noise Edition jetzt installieren?`,
  );
  if (!confirm) {
    log.info('Abgebrochen.');
    process.exit(0);
  }

  log.title('Installation läuft');
  let code;
  try {
    code = runInstaller(bundle);
  } catch (e) {
    log.err(e.message);
    await pause();
    process.exit(3);
  }
  log.blank();

  if (code === 0) {
    log.ok('Blur Noise Edition wurde erfolgreich installiert.');
    log.info('RapidRAW starten — die Gaussian-Blur-, Noise- und Filmkorn-Regler findest du im Effekte-Panel.');
  } else if (code === 1602) {
    log.warn('Installation vom Benutzer abgebrochen.');
  } else if (code === 1603) {
    log.err('Installation fehlgeschlagen (1603). Bitte den Installer als Administrator ausführen.');
  } else {
    log.err(`Installer beendete sich mit Exit-Code ${code}. Details stehen im Windows-Ereignisprotokoll.`);
  }

  await pause();
  process.exit(code === 0 ? 0 : 4);
}

main().catch(async (e) => {
  console.error(`\n${C.red}Fehler:${C.reset} ${e?.stack ?? e}`);
  await pause();
  process.exit(10);
});
