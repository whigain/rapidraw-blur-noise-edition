# PLAN.md — Blur Noise Plugin für RapidRAW

Status: **Core Feature #1 implementiert, Verifikation läuft.**

## Kontext

Drittes Konzept in dieser Session (nach Texture-Overlay und Grain-Emulator — beide
Research-Ergebnisse bleiben in `../Texture Plugin/PLAN.md` erhalten, falls später
relevant). Dieses Plugin bildet **Photoshops „Gaussian Blur" und „Add Noise"**
eigenständig nach (Clean-Room, kein Adobe-Code/-Assets) und ist das erste Plugin
der Session, das auch `src-tauri/` (Rust + WGSL) patcht statt nur Frontend.

## Rechtliches (Kurzfassung, siehe Chat-Verlauf für die volle Abwägung)

Gaußsche Faltung und Uniform/Gaussian-Pixelrauschen sind jahrzehntealte, öffentlich
beschriebene Standardverfahren (Adobe selbst beschreibt Gaussian Blur nur als
„gewichteter Mittelwert über eine Glockenkurve"). Kein Photoshop-Vergleichstest,
keine Adobe-Ressourcen — reine Eigenimplementierung auf RapidRAWs eigener,
bereits vorhandener GPU-Infrastruktur. **Nicht pixel-identisch mit Photoshop,
aber behaviorally gleichwertig** — das war von Anfang an der explizit akzeptierte
Maßstab.

## Architektur-Erkenntnisse (im RapidRAW-Code verifiziert)

1. **`shaders/blur.wgsl`** ist ein fertiger, aber separat registrierter (nicht ins
   `Group`-System eingebundener) echter Gauß-Separable-Blur — nicht wiederverwendet,
   weil der Aufrufpfad/die Bind-Group-Erzeugung dafür nicht untersucht war und das
   Risiko den Nutzen nicht aufwog.
2. **`ComputeEncoder::blur(src: Tex, radius, passes, flags) -> Tex`**
   (`render/gpu/compute.rs`) ist eine bereits produktiv genutzte 3-Pass-Box-Blur-
   Approximation von Gauß (Kovesi 1995 „Fast Almost-Gaussian Filtering"), verwendet
   von Lens Blur/Fog für genau diesen Zweck. **Gaussian Blur nutzt dieselben
   `box_h`/`box_v`-Pipelines direkt** (nicht die Convenience-Methode selbst, wegen
   Tex/Slot-Ownership — siehe `effects/gaussian_blur.rs`), statt einen neuen Shader
   zu schreiben.
3. **Adjustments fließen als loses JSON** (`serde_json::Value`) durch die
   Export-/Render-Pipeline — neue Felder brauchen kein neues Rust-Struct.
4. **Tier-2-Effekte** (Relight, Fog, Lens Blur) folgen alle demselben Muster:
   `prepare(adjustments, ..., size) -> Option<Job>` + `encode(enc, job, src, dst)`,
   aufgerufen in `render/source.rs`. Gaussian Blur + Noise folgen exakt diesem
   Muster, direkt nach Lens Blur eingehängt.
5. **Noise braucht einen neuen Shader-Entry-Point**, aber keine neue Pipeline:
   `noise_apply` wurde zu `shaders/compute_common.wgsl` hinzugefügt (dieselbe Datei,
   die `box_h`/`box_v`/`area_down`/`gf_pack`/`gf_coeffs` bereitstellt) und unter
   `Group::Common` registriert — kein neues Bind-Group-Layout, keine neue Pipeline.
6. **Parameter-Transport ohne neues Uniform-Layout:** `noise_apply` zweckentfremdet
   die bestehenden `Grid`-Felder (`radius`→Seed, `eps`→Amount, zwei ungenutzte
   `flags`-Bits→Monochrome/Gaussian) statt einen eigenen Uniform-Typ einzuführen.
7. **Rauschen wird in sRGB-artigem Raum angewendet, nicht in Linear-Licht** — sonst
   sieht es in Schatten zu schwach und in Lichtern zu stark aus (Photoshops Add
   Noise arbeitet im Anzeigeraum).

## Datenmodell

Neue Felder auf `Adjustments` (`src/utils/adjustments.ts`, `defaultAdjustments.json`):

```ts
gaussianBlurEnabled: boolean;
gaussianBlurRadius: number;      // px, UI 0–100, Rust clamp 0–300
noiseEnabled: boolean;
noiseAmount: number;             // %, UI 0–100 (Photoshop erlaubt bis 400, Rust-seitig toleriert)
noiseDistribution: 'uniform' | 'gaussian';
noiseMonochrome: boolean;
noiseSeed: number;               // fix, für stabile Vorschau (kein Zeit-Jitter)
```

## UI

Zwei neue `AdjustmentSubSection`s im **bestehenden Effects-Panel**, direkt nach
Grain (kein neues Top-Level-Panel — siehe Begründung im Chat: Blur/Noise sind
Pixel-Effekte wie Lens Blur/Grain, keine eigene Workflow-Kategorie):
- `GaussianBlurSection.tsx` — Enable-Switch + Radius-Slider.
- `NoiseSection.tsx` — Enable-Switch + Amount-Slider + Uniform/Gaussian-Dropdown +
  Monochrome-Switch + „Vintage Video"-Preset-Button (Blur 1.6 px, Noise 3 %
  monochrom/gaussian — exakt die Werte aus dem Session-Briefing).

## Rust-Invokes

**Null neue Tauri-Invokes.** Beide Effekte laufen automatisch mit durch die
bestehende Live-Preview- und Export-Pipeline (`render/source.rs`), weil sie als
Tier-2-Effekte registriert sind — exakt wie Lens Blur/Fog/Relight.

## Patch-Surface

| Datei | Änderung |
|---|---|
| `src-tauri/src/effects/gaussian_blur.rs` | NEU — reused `box_h`/`box_v` |
| `src-tauri/src/effects/noise.rs` | NEU — neuer `noise_apply`-Call |
| `src-tauri/src/effects/mod.rs` | 2× `pub mod` |
| `src-tauri/src/render/source.rs` | 2 neue `prepare`/`encode`-Calls nach Lens Blur |
| `src-tauri/src/render/gpu/compute.rs` | `"noise_apply"` zur `Group::Common`-Entry-Liste |
| `src-tauri/src/shaders/compute_common.wgsl` | NEU: `noise_apply` + Hash/sRGB-Helfer |
| `src/utils/adjustments.ts` | Effect-Enum, Interface-Felder, Merge-Defaults |
| `src/utils/defaultAdjustments.json` | 7 neue Default-Werte |
| `src/components/adjustments/Effects.tsx` | Import + 2 Section-Mounts nach Grain |
| `src/components/adjustments/sections/{Gaussian,Noise}*.tsx` | NEU |
| `src/utils/blurNoise.ts` | NEU — Presets, Clamp-Helfer (pure, getestet) |
| `src/i18n/locales/{en,de}.json` | `editor.blurNoise.*` (JSON-Merge, kein Anker) |

## Bewusst NICHT gemacht (Risiko/Nutzen)

| Nicht umgesetzt | Warum |
|---|---|
| `shaders/blur.wgsl` (echter Gauß) wiederverwenden | Aufrufpfad nicht verifiziert; Box-3-Pass ist etablierte, bereits produktiv genutzte Näherung |
| Photoshop-Pixelvergleich | Explizit nicht gewollt (Clean-Room) |
| Noise/Blur als lokale Masken-Effekte | `MaskAdjustments` hat dafür kein Feld; wie Lens Blur fürs Erste global-only |
| Copy/Paste- und Reset-Tool-Listen erweitern | Kein 100% sicherer Text-Anker verifiziert — bewusste Lücke, siehe unten |

## Verifikations-Workflow

1. `npm test` (plugin-eigenes Repo) — pure Logik (Presets, Clamping).
2. `node installer/install.mjs --rapidraw <RapidRAW-main>` — Patches anwenden.
3. `cargo check` in `RapidRAW-main/src-tauri` — Rust-Korrektheit, ohne vollen Build.
4. `npx tsc --noEmit` + `npm test` + `npm run build` in RapidRAW-main — Frontend.
5. Erst danach: ein gemeinsamer `npm run tauri build` (18–20 Min) zum echten Sehen.

## Bekannte Lücken (v0.1, ehrlich dokumentiert)

- `ADJUSTMENT_TOOLS_BY_ID`/Copy-Paste-Gruppen/Reset-Liste kennen die neuen Tools
  noch nicht (Sichtbarkeits-Submenü, Copy/Paste-Adjustments, "Reset"-Button
  betreffen sie nicht individuell) — rein kosmetische Lücke, Effekte funktionieren.
- Kein lokales Masken-Targeting für Blur/Noise.
- `shaders/blur.wgsl`s echter Gauß-Kernel bleibt ungenutzt (P2-Kandidat, falls die
  3-Pass-Box-Näherung optisch nicht genügt).
