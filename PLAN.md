# PLAN.md — Blur Noise Plugin für RapidRAW (v0.1.3+ Roadmap)

Status: **v0.1.2 ausgeliefert** (Gaussian Blur + Noise + Film Noise, Copy/Paste, Render-Cache-Fix).
Dieses Dokument ist die Roadmap für **v0.1.3+** — basierend auf einem vollständigen Audit und
einer neuen User-Anforderung zur Preview-Qualität.

- v0.1.0 Scaffolding-Plan: archiviert in `PLAN_v010.md` (nur noch historischer Kontext)
- Clean-Room-Prinzip bleibt bestehen: keine Dekompilierung von Adobe/RapidGrade-Binaries;
  Research nur gegen öffentliche Literatur + User-eigene `.rgprofile`-Parameter
- Code-Kommentare englisch, User-Kommunikation deutsch (Denglisch OK)

---

## Research: Preview-Rendering (neue User-Anforderung)

> *"das rendering soll verbessert werden damit man immer sehen kann im preview wie der grain
> oder etc aussieht wenn man nicht reinzoomt"*

### Problem (im RapidRAW-Pipeline-Code verifiziert, `src-tauri/src/render/source.rs`)

RapidRAWs Render-Pipeline arbeitet mit einer variablen **`working_size`**, die sich am
UI-Zoom und `target_resolution` orientiert — Logs zeigen bei einem einzigen Testlauf
z.B. 853×652, 1024×783, 1536×1174 je nach Zoomstufe. Unsere Effect-Shader
(`noise_apply`, `film_noise_apply`) dispatchen pro Pixel mit `id.xy` als Hash-Input:

```wgsl
let hr = noise_hash4(id.xy, seed);   // ← viewport-Pixel-Koordinaten
```

Daraus folgen **drei zusammenhängende Symptome**:

1. **Grain "schwimmt" beim Zoomen**: Dieselbe Bildstelle bekommt bei Preview-Res 853 einen
   anderen Noise-Wert als bei Res 1024. Pattern ist nicht stabil → unruhige Preview.
2. **Grain wirkt unterschiedlich stark je Zoom**: Bei Res 853 ist ein "Pixel Noise" relativ
   größer am Bildschirm als bei Res 1536. User sieht vermeintlich mehr/weniger Grain,
   obwohl die Einstellung identisch ist.
3. **Final-Export entspricht nicht der Preview**: Das Export-Rendering läuft bei voller
   Auflösung (z.B. 4756×3636). Dort wird Grain pro Export-Pixel generiert und dann beim
   Anzeigen vom Anzeige-Treiber downgesampelt → der sichtbare Effekt in der Preview
   während des Edits ist **nicht** vorhersagbar für das exportierte Bild.

### Industrie-Standard-Lösung

Lightroom, Capture One und DxO FilmPack rendern Grain im **Bildkoordinaten-Raum**, nicht
im Viewport-Raum. Bedeutet: Der Hash-Input ist "welche Original-Bildpixel repräsentiert
dieser Preview-Pixel", nicht der Preview-Pixel selbst. Konkret:

```wgsl
let scale = vec2<f32>(source_size) / vec2<f32>(working_size);
let image_xy = vec2<u32>(vec2<f32>(id.xy) * scale);
let hr = noise_hash4(image_xy, seed);   // stabil über alle Zoomstufen
```

Damit:
- Pattern bleibt identisch von Fit-Zoom bis 1:1 (kein "Swimming")
- Preview-Rendering simuliert implizit das Downsampling des Exports: Mehrere
  benachbarte "Image-Pixels" fallen auf einen Preview-Pixel → Hash-Werte werden effektiv
  gemittelt (ähnlich wie eine Mip-Map), was den finalen Look vorhersagbar macht
- Grain-Amplitude bei niedriger Preview-Res **nimmt leicht ab** (geringere Varianz durch
  Mittelung) — exakt der Effekt im finalen Export. Für sehr feines Grain (grain_scale=1)
  wird das Grain bei starkem Zoom-Out eventuell unsichtbar — das ist korrekt, weil bei
  einem 25% Zoom auch echtes 1-Pixel-Grain im Export unsichtbar ist

### Umsetzung

- `prepare()`-Signatur erweitern um `source_size: (u32, u32)`
- In `render/source.rs` ist `source.size` schon vorhanden bei der Effects-Dispatch-Phase —
  einen weiteren Parameter durchschleusen
- Shader braucht Zugang zur `source_size`. Vorhandener `Grid`-Struct hat keine
  passenden Felder frei — Lösung: **`grid.src` repurposen**. Nur unsere Shader lesen
  diese spezielle Grid-Instanz, und `src` wird bei `Grid::new(dst)` auf `[0,0]` default
  gesetzt — kein Conflict mit anderen `Group::Common`-Entries

Betrifft: `noise.rs`, `film_noise.rs`, `compute_common.wgsl` (beide WGSL-Funktionen),
`patches.mjs` (`rust-dispatch-gaussian-blur-noise` payload)

**Nicht betroffen**: `gaussian_blur.rs` — das nutzt die bestehenden box_h/box_v-Pipelines,
die bereits korrekt in Preview-Resolution arbeiten. Bei einem Gauß-Blur ist zoom-abhängige
Varianz sogar gewünscht, damit Blur-Radius in Pixel-Einheiten stimmt.

---

## Prioritäten-Übersicht

| Prio | Thema | Aufwand | Sichtbar? |
|------|-------|---------|-----------|
| P0.1 | FilmNoise Monochrome-Modus mit Blue-Boost → Blaustich | 15 min | Ja, sofort |
| P0.2 | Stock-Dropdown bleibt bei manueller Änderung "hängen" | 30 min | Ja, UX |
| P0.3 | Copy/Paste Adjustments kopiert noch nicht alle Felder korrekt | 30-60 min | Ja, Workflow |
| **P1.1** | **Preview-Stabilität (image-space noise sampling)** ⭐ | **1,5-2 h** | **Ja, deutlich** |
| P1.2 | Density-Weight-Mode: optionales "Full Range" | 30 min | Ja, Creative-Control |
| P1.3 | Block-Grain → Value-Noise (weichere Grain-Textur) | 1,5 h | Ja, Qualität |
| P1.4 | Shader-Warmup beim App-Start | 20 min | Ja, erster Toggle schneller |
| P2.1 | Gaussian Blur + FilmNoise bekommen `actions`-Slot | 45 min | Ja, UX |
| P2.2 | FilmNoise Opacity-Slider (Parität mit Noise) | 45 min | Ja, Creative-Control |
| P2.3 | FilmNoise Monochrome-Switch (UI-Convenience) | 20 min | Ja |
| P2.4 | Seed-Re-Roll-Button für Noise + FilmNoise | 30 min | Ja |
| P2.5 | clampNoiseOpacity Konsistenz-Patch oder Code-Kommentar | 10 min | Nein |
| P3.1 | Halation / Bloom als 4. Section ⭐ | 1 Tag | Ja, großer Film-Look-Win |
| P3.2 | Preset-Export (`.bnprofile`-Format) | 3 h | Ja, Workflow |
| P3.3 | LOG-aware Density-Gewichtung | 1 h | Nur bei RAW/LOG |
| P4.1 | Rust-Unit-Tests für `prepare()`-Edge-Cases | 1 h | Nein, Robustheit |
| P4.2 | `npm test`-Script in Blur Noise Plugin/package.json | 2 min | Nein, DX |
| P4.3 | Wrapper EXE: deutsche Strings komplett oder i18n | 20 min | Beim Install sichtbar |
| P4.4 | build-exe.mjs SIGINT-Cleanup | 15 min | Nur bei Dev-Abbruch |
| P4.5 | CI (GitHub Actions `node --test` + `cargo check` + naga) | 30 min | Nein |
| P5.1 | defaultAdjustments.json-Anchor → JSON-Deep-Merge | 2 h | Nur zukunftssicher |
| P5.2 | WGSL-Helpers in separaten `wgsl-shared-helpers`-Patch | 45 min | Nur zukunftssicher |

---

## P0 — Bugfixes (müssen in v0.1.3 rein)

### P0.1 FilmNoise Blue-Tint im Monochrome-Modus

**Problem**: Bei `color_sat=0` sollen R=G=B=gray (reines Grau). Aktuell wird
`nb *= blue_boost` *nach* dem `mix(gray, nb, color_sat)` angewendet → Blau-Noise ist
immer um Faktor `blue_boost` lauter, auch wenn der User "monochrom" will.

**Betroffen**: `installer/patches.mjs` → `wgsl-film-noise-apply` Payload

**Fix**:
```wgsl
// vorher:
nr = mix(gray, nr, color_sat);
ng = mix(gray, ng, color_sat);
nb = mix(gray, nb, color_sat);
nb *= blue_boost;

// nachher:
nr = mix(gray, nr, color_sat);
ng = mix(gray, ng, color_sat);
nb = mix(gray, nb * blue_boost, color_sat);
```

**Acceptance Criteria**:
- `color_sat=0` + beliebiges `blue_boost` → identische R/G/B-Noise-Amplituden (visuell grau)
- `color_sat=1` + `blue_boost=2` → Blau-Grain ~2× lauter als R/G
- `color_sat=0.5` + `blue_boost=2` → Zwischenstand, nicht nur Blau boosted

### P0.2 Stock-Dropdown "klebt" an alter Auswahl

**Problem**: User wählt "35mm" → Werte werden auf 35mm-Defaults gesetzt. User schiebt
Strength manuell auf 90%. Dropdown zeigt weiter "35mm", obwohl Werte nicht mehr dem
Preset entsprechen → verwirrend.

**Betroffen**: `plugin-src/src/components/adjustments/sections/FilmNoiseSection.tsx`,
`plugin-src/src/utils/blurNoise.ts`

**Fix** (Option A, empfohlen): `FilmNoiseStock`-Union um `'custom'` erweitern.
Jeder Slider-Change setzt `filmNoiseStock = 'custom'`. Im Dropdown "Custom" zeigen,
Auswahl von "Custom" ändert keine anderen Werte.

**Acceptance Criteria**:
- Stock wählen → Werte auf Preset; Dropdown zeigt Stock
- Slider ändern → Dropdown zeigt "Custom"
- Stock neu wählen → Werte zurück auf Preset

### P0.3 Copy/Paste Adjustments kopiert noch nicht alle Felder korrekt

**Problem (vom User gemeldet)**: Trotz der in v0.1.2 ergänzten `ADJUSTMENT_GROUPS.effects`-
Einträge für Gaussian Blur / Noise / Film Noise werden **nicht alle Felder** beim
Copy/Paste zuverlässig übertragen. Konkrete Symptome werden erst am laufenden
Preview-Build diagnostiziert, aber bekannte potenzielle Ursachen:

1. **`i18n-Labels fehlen oder sind leer**: Die `modals.copyPaste.groups.{gaussianBlur,
   noise,filmNoise}`-Keys werden über die in v0.1.2 erweiterte `install.mjs`-
   Deep-Merge-Routine eingefügt. Wenn die Ziel-JSON gar keine `modals.copyPaste.groups`-
   Struktur hat (frischer RapidRAW-Checkout), kann das ein Insert statt Merge sein,
   und die Gruppe erscheint mit Raw-Key als Label statt mit lokalisiertem Text.
2. **`noiseDistribution: string` wird bei `reconcileAdjustments` nicht durchgereicht**:
   `handleAdjustmentChange` hat die bekannte `parseInt`-Trap — wenn das Paste-Flow einen
   ähnlichen Numeric-Wrapper hat, wird der String `'gaussian'` zu `NaN` und der
   Wert fällt weg.
3. **`ADJUSTMENT_GROUPS` wird irgendwo gefiltert**: Vielleicht gibt es eine weitere
   Allowlist in `src/components/modals/CopyPasteModal.tsx` oder `src/utils/paste.ts`,
   die unsere neuen Effect-Keys noch nicht kennt.
4. **`filmNoiseStock: 'custom' | ...` bricht Deep-Equal-Diff im Paste-Flow** falls der
   Paste-Logik nur primitive Zahlen/Booleans erwartet.

**Diagnose-Schritte (müssen in der Session durchlaufen werden)**:

1. `tauri dev` starten, Bild A mit allen drei Effects auf non-default stellen,
   Copy-Button klicken
2. Browser-DevTools öffnen: `localStorage.getItem('clipboard-adjustments')` oder
   im State inspizieren — sind alle Felder im Clipboard-Objekt drin?
3. Bild B öffnen, Paste mit allen Gruppen aktiviert
4. Für jedes der 15+ neuen Felder (gaussianBlurEnabled/Radius, noiseEnabled/Amount/
   Opacity/Distribution/Monochrome/Seed, filmNoise×7) prüfen: ist der Wert von Bild A
   übernommen worden?
5. Je nach Finding: entsprechenden Patch nachziehen

**Betroffen (potenziell)**:
- `installer/patches.mjs` → ggf. zusätzlicher Patch für `CopyPasteModal.tsx` oder
  verwandte UI-Komponente
- `installer/install.mjs` → ggf. robusterer `modals.copyPaste.groups`-Merge mit
  Initial-Create
- RapidRAW `src/components/modals/CopyPasteModal.tsx` + `src/utils/paste.ts` oder
  `src/utils/clipboard.ts` — bisher unerforscht; Code-Search im Session-Start nötig

**Acceptance Criteria**:
- Alle 15 neuen Plugin-Felder landen beim Paste im Ziel-Bild wenn die entsprechende
  Gruppe aktiviert war (manuell verifiziert via UI-Screenshot-Vergleich vor/nach Paste)
- Deaktivierte Gruppen übertragen NICHTS (keine ungewollten Writes auf non-selected
  Fields)
- `filmNoiseStock: 'custom'` wird korrekt als String kopiert (nicht als NaN oder leer)
- i18n-Labels für die 3 neuen Gruppen zeigen deutschen/englischen Text, nicht Raw-Keys

---

## P1 — Preview-Qualität (vom User explizit angefragt)

### P1.1 Preview-Stabilität — Image-Space Noise Sampling ⭐ Kern-Request

Siehe Research-Sektion oben.

**Betroffen**:
- `plugin-src/src-tauri/src/effects/noise.rs` → `prepare()`-Signatur + Grid `src` setzen
- `plugin-src/src-tauri/src/effects/film_noise.rs` → dito
- `installer/patches.mjs` → `rust-dispatch-gaussian-blur-noise` Payload (prepare-Call
  bekommt extra Argument), `wgsl-noise-apply` Payload (Scale-Umrechnung + Sampling),
  `wgsl-film-noise-apply` Payload (dito)

**Umsetzung**:

1. Rust-Side: In `render/source.rs` ist `source.size` bereits sichtbar. `prepare(adjustments,
   working_size, source_size)` ergänzen.
2. `encode()` schreibt `source_size` in `Grid.src`:
   ```rust
   let grid = Grid {
       src: [source_size.0, source_size.1],
       radius: job.seed,
       // ...
       ..Grid::new(dst_size)
   };
   ```
3. WGSL (für `noise_apply` und `film_noise_apply`):
   ```wgsl
   let scale = vec2<f32>(params.grid.src) / vec2<f32>(params.grid.dst);
   let image_xy = vec2<u32>(vec2<f32>(id.xy) * scale);
   let hr = noise_hash4(image_xy, seed);
   ```
4. Für FilmNoise: `block_xy = image_xy / grain_scale;`

**Acceptance Criteria**:
- Preview an derselben Bildstelle zeigt identisches Grain-Pattern bei Zoom 25%, 50%, 100%,
  200% (kein Swimming mehr)
- Grain-Amplitude bei Zoom-Out moderat gedämpft (simuliertes Downsampling)
- Grain-Amplitude bei Zoom-In 1:1 entspricht dem Export
- Kein Regression im Gaussian-Blur-Verhalten

**Risiko**: Hash-Space wird größer (image_xy kann z.B. 4756 sein). `noise_hash4`
verarbeitet beliebig große u32-Werte. Kein Clamp nötig.

### P1.2 Density-Weight: optionaler "Full Range"-Mode

**Problem**: Aktuelle `4·L·(1-L)`-Gewichtung killt Grain in Highlights und Shadows
komplett. Physikalisch für echte Film-Emulsion korrekt, aber manche User wollen Grain
überall sichtbar.

**Fix**: Enum-Switch `filmNoiseResponse: 'film' | 'flat'`:
- `'film'` (default) = aktuelle Parabel-Gewichtung
- `'flat'` = `density_weight = 1.0` (gleichverteilt)

**Betroffen**: `blurNoise.ts`, `FilmNoiseSection.tsx`, `film_noise.rs` (neues Flag-Bit
`FILM_RESPONSE_FLAT = 16u`), `wgsl-film-noise-apply`:
```wgsl
density_weight = select(0.25, 4.0 * luma * (1.0 - luma), (flags & 16u) == 0u);
```
(konstante 0.25 für flat damit Gesamt-Intensität ähnlich zu peak-weighted)

**Acceptance Criteria**:
- `response=flat` + schwarzes Rechteck → Grain sichtbar (aktuell nicht)
- `response=film` unverändert vs. v0.1.2

### P1.3 Block-Grain → Value-Noise

**Problem**: Bei `grain_scale > 1` zeigt die aktuelle Block-Hash-Implementation sichtbare
quadratische Grenzen. Nicht wie echtes Film.

**Fix**: In `film_noise_apply` Bilinear-Interpolation zwischen 4 Nachbar-Hash-Samples:
```wgsl
let fp = vec2<f32>(id.xy) / f32(grain_scale);
let base = vec2<u32>(fp);
let f = fract(fp);
let n00 = noise_hash4_scalar(base, seed);
let n10 = noise_hash4_scalar(base + vec2<u32>(1u, 0u), seed);
let n01 = noise_hash4_scalar(base + vec2<u32>(0u, 1u), seed);
let n11 = noise_hash4_scalar(base + vec2<u32>(1u, 1u), seed);
let nr = mix(mix(n00.x, n10.x, f.x), mix(n01.x, n11.x, f.x), f.y);
// (dito für ng, nb mit seed+1/+2)
```

Kosten: 4× mehr Hash-Calls (12 statt 3). Bei 1536×1174 = 54M Hashes statt 13.5M. Immer
noch sub-Sekunde auf aktueller Hardware.

**Betroffen**: `wgsl-film-noise-apply` Payload

**Acceptance Criteria**:
- `grain_scale=3` → keine sichtbaren 3×3-Block-Grenzen mehr
- Rendering-Zeit immer noch < 300ms bei 1536×1174 (akzeptabel)

### P1.4 Shader-Warmup beim App-Start

**Problem**: Erster Trigger von Noise oder FilmNoise in einer App-Session kostet 5-10s
(Driver kompiliert das neue Group::Common-Modul).

**Fix**: In `render/source.rs` nach GPU-Init einen 1×1-Dummy-Dispatch jeder neuen
Shader-Entry absetzen. Overhead einmalig pro Session, statt beim ersten Slider-Move.

**Betroffen**: Neuer `rust-shader-warmup`-Patch in `patches.mjs`

**Acceptance Criteria**: Erster Noise-Toggle zeigt keine mehrsekundige Verzögerung mehr

---

## P2 — UX-Verbesserungen

### P2.1 Gaussian Blur + FilmNoise bekommen `actions`-Slot

Parität mit NoiseSection (hat "Vintage Video"-Button).
- Gaussian Blur: "Soft Focus" (Radius=3.0) als Preset
- FilmNoise: "Re-roll Seed" (neuer Zufalls-Seed)

### P2.2 FilmNoise Opacity-Slider

Parität mit NoiseSection. Packing-Herausforderung: Grid.channel ist schon mit
(color_sat, blue_boost) gefüllt. Lösung: `flags`-Bits erweitern. Opacity 0-100%
quantisiert auf 7 Bit (128 Stufen) reicht wahrnehmungsmäßig.

### P2.3 FilmNoise Monochrome-Switch

Aktuell nur über `colorSaturation=0`. Expliziter Toggle wäre intuitiver.
Umsetzung: Toggle setzt beim Einschalten `colorSaturation` auf 0 + merkt sich alten Wert;
beim Ausschalten restaurieren. Kein Backend-Change nötig.

### P2.4 Seed-Re-Roll für Noise + FilmNoise

Button in Section-Actions-Slot. Setzt Seed auf `Math.floor(Math.random() * 0xFFFFFFFF)`.

### P2.5 clampNoiseOpacity Konsistenz

Entweder Kommentar warum MAX statt MIN, oder Verhalten angleichen.

---

## P3 — Feature-Erweiterungen

### P3.1 Halation / Bloom als 4. Section ⭐ großer Film-Look-Win

Jedes Film-Profile deiner RapidGrade-Sammlung hat `"halation": { enable: true, ... }`.
Klassischer Film-Charakter: Rotschein an hellen Lichtkanten (Rückstreuung am Film-Träger).

Architektur:
1. Red-Channel aus Base-Image + Highlight-Mask (`smoothstep(0.6, 1.0, luma)`)
2. Großer Gauß-Blur (reuse `box_h`/`box_v`) mit Radius 10-30px
3. In Rot zurück-blenden (`base.r += halation_mask * strength`)

Params: Strength (0-100%), Radius (0-30px), Highlight Threshold (0.4-0.9), Color Tint
(rot-gelb Hue 0-30°). Aufwand: ~1 Tag.

### P3.2 Preset-Export (`.bnprofile`)

Ähnlich `.rgprofile`: JSON mit allen Blur-Noise-Plugin-Feldern. Dialog-Button
"Save as..." / "Load..." via Tauri-File-API.

### P3.3 LOG-aware Density-Gewichtung

Aktuell `luma = Rec.709`. Bei LOG-codierten RAWs nicht die wahrgenommene Helligkeit.
Switch "Linear" vs "Perceptual" für die Density-Berechnung.

---

## P4 — Code-Qualität & DX

- P4.1: `cargo test` in `effects/`-Modulen, Smoke-Test für `prepare()`-Edge-Cases
- P4.2: `"test": "node --test tests/"` in `package.json`
- P4.3: Wrapper EXE Strings konsistent
- P4.4: `build-exe.mjs` SIGINT-Handler für Cleanup
- P4.5: GitHub Actions Workflow: node test + cargo check + naga validate

---

## P5 — Zukunftssicherheit

### P5.1 defaultAdjustments.json Anchor-Robustness

JSON-Deep-Merge statt Text-Insert. Überlebt Upstream-Reordering.

### P5.2 WGSL-Helpers extrahieren

`noise_hash4`, `noise_gaussian4`, `noise_to_srgb`, `noise_to_linear` in separaten
`wgsl-shared-noise-helpers`-Patch. Entkoppelt FilmNoise von Noise.

---

## Deployment-Pfad v0.1.3

**Batch A — schnell, kein Shader (`tauri dev` Hot-Reload, ~1-2 h total)**:
- P0.2 (Stock-Dropdown-Fix)
- P0.3 (Copy/Paste-Diagnose + Fix)
- P2.3 (Monochrome-Switch)
- P2.4 (Seed-Re-Roll)
- P4.2 (`npm test` script)
- P4.3 (Wrapper-Strings)

**Batch B — Shader-Änderungen (`tauri dev`, dann Release-Build, ~3-4 h + 25 min build)**:
- P0.1 (Blue-Tint-Fix)
- P1.1 (Preview-Stabilität) ⭐ Hauptwunsch
- P1.3 (Value-Noise)
- P1.2 (Full-Range-Mode)
- P2.2 (FilmNoise Opacity)

**Batch C — Infrastruktur (optional, kein User-Deliverable)**:
- P1.4, P2.1, P2.5, P4.1, P4.4, P4.5

**Batch D — echte Features (eigener Release v0.2.0)**:
- P3.1 (Halation)
- P3.2 (Preset-Export)
- P3.3 (LOG-aware)

---

## Was NICHT im Scope ist

- Keine Dekompilierung von RapidGrade- oder Photoshop-Binaries
- Keine 1:1-Pixel-Übereinstimmung mit kommerziellen Tools (Clean-Room bleibt)
- Keine Monetarisierung-Hooks / Telemetry
- Kein eigenes LUT-Format (RapidRAW hat schon LUTs)
- Kein AI-basiertes Denoise (RapidRAW hat `aiDenoise` eingebaut)
