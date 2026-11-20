// Pure logic for the Blur Noise Plugin — kept dependency-free and test-safe
// (node:test imports this directly; no Tauri/React imports allowed here).

export type NoiseDistribution = 'uniform' | 'gaussian';

export const GAUSSIAN_BLUR_MIN = 0;
export const GAUSSIAN_BLUR_MAX = 100;
export const NOISE_AMOUNT_MIN = 0;
export const NOISE_AMOUNT_MAX = 100;
export const NOISE_OPACITY_MIN = 0;
export const NOISE_OPACITY_MAX = 100;

export function clampGaussianBlurRadius(value: number): number {
  if (!Number.isFinite(value)) return GAUSSIAN_BLUR_MIN;
  return Math.min(GAUSSIAN_BLUR_MAX, Math.max(GAUSSIAN_BLUR_MIN, value));
}

export function clampNoiseAmount(value: number): number {
  if (!Number.isFinite(value)) return NOISE_AMOUNT_MIN;
  return Math.min(NOISE_AMOUNT_MAX, Math.max(NOISE_AMOUNT_MIN, value));
}

export function clampNoiseOpacity(value: number): number {
  if (!Number.isFinite(value)) return NOISE_OPACITY_MAX;
  return Math.min(NOISE_OPACITY_MAX, Math.max(NOISE_OPACITY_MIN, value));
}

// ---------------------------------------------------------------------------
// Film Noise — clean-room film grain simulation.
//
// Parameter model deliberately mirrors the vocabulary used by RapidGrade's
// own Film profiles (strength / blur / blue_strength / saturation) because
// that vocabulary IS the standard film-grain-UI shape — nothing proprietary
// about it. The algorithm implementation is entirely original; see
// src-tauri/src/effects/film_noise.rs and the film_noise_apply WGSL function
// for the actual math (spatial block hash + luminance-weighted density
// modulation + per-channel independent Gaussian noise).
// ---------------------------------------------------------------------------
export const FILM_NOISE_STRENGTH_MIN = 0;
export const FILM_NOISE_STRENGTH_MAX = 100;
export const FILM_NOISE_GRAIN_SIZE_MIN = 0.5;
export const FILM_NOISE_GRAIN_SIZE_MAX = 4;
export const FILM_NOISE_BLUE_BOOST_MIN = 0;
export const FILM_NOISE_BLUE_BOOST_MAX = 3;
export const FILM_NOISE_COLOR_SAT_MIN = 0;
export const FILM_NOISE_COLOR_SAT_MAX = 100;
// Opacity re-uses the plain Noise opacity range for user familiarity —
// slider shape and endpoint behaviour match exactly.
export const FILM_NOISE_OPACITY_MIN = 0;
export const FILM_NOISE_OPACITY_MAX = 100;

// 'film' = parabolic density weighting peaking at midtone luma (the natural
// D-log-E curve of an analog emulsion); 'flat' bypasses that and distributes
// grain approximately evenly across shadows and highlights for creative
// control (e.g. forcing grain into pure blacks). See film_noise_apply WGSL.
export type FilmNoiseResponse = 'film' | 'flat';

// 'custom' is NOT a preset — it's the sentinel value the dropdown shows
// whenever the user has nudged a slider away from a stock's canonical values.
// Keeps the UI honest: a dropdown showing '35mm' now actually means the four
// sliders are at the 35mm preset values, not just "35mm was last clicked".
export type FilmNoiseStock = '16mm' | 's16' | '35mm' | 's35' | 'imax' | 'custom';

export interface FilmNoiseStockPreset {
  id: Exclude<FilmNoiseStock, 'custom'>;
  // Pre-tuned defaults for the four user-facing sliders. Values picked so
  // that larger formats look finer (imax < 35mm < 16mm) — matches the real
  // physical relationship between film format and apparent grain size.
  strength: number;        // 0-100
  grainSize: number;       // 0.5-4 px
  blueBoost: number;       // 0-3
  colorSaturation: number; // 0-100
}

export const FILM_NOISE_STOCKS: FilmNoiseStockPreset[] = [
  { id: 'imax', strength: 40, grainSize: 0.5, blueBoost: 1.8, colorSaturation: 20 },
  { id: 's35',  strength: 55, grainSize: 1.2, blueBoost: 2.0, colorSaturation: 20 },
  { id: '35mm', strength: 60, grainSize: 1.0, blueBoost: 2.0, colorSaturation: 20 },
  { id: 's16',  strength: 70, grainSize: 2.0, blueBoost: 2.2, colorSaturation: 25 },
  { id: '16mm', strength: 80, grainSize: 2.5, blueBoost: 2.4, colorSaturation: 30 },
];

export function findFilmNoiseStock(id: string): FilmNoiseStockPreset | undefined {
  return FILM_NOISE_STOCKS.find((s) => s.id === id);
}

export function clampFilmNoiseStrength(value: number): number {
  if (!Number.isFinite(value)) return FILM_NOISE_STRENGTH_MIN;
  return Math.min(FILM_NOISE_STRENGTH_MAX, Math.max(FILM_NOISE_STRENGTH_MIN, value));
}

export function clampFilmNoiseOpacity(value: number): number {
  // Same fallback-to-MAX convention as clampNoiseOpacity: legacy edits
  // saved before this field existed should keep their original look.
  if (!Number.isFinite(value)) return FILM_NOISE_OPACITY_MAX;
  return Math.min(FILM_NOISE_OPACITY_MAX, Math.max(FILM_NOISE_OPACITY_MIN, value));
}

// Checks whether the four slider values currently match any known stock
// preset within a tight tolerance. Used by the Film Noise section to swap
// the dropdown over to 'custom' as soon as a slider leaves the preset, and
// to swap it back when the values happen to line up again.
export function matchFilmNoiseStock(
  strength: number,
  grainSize: number,
  blueBoost: number,
  colorSaturation: number,
): FilmNoiseStock {
  const eps = 0.0001;
  const match = FILM_NOISE_STOCKS.find(
    (s) =>
      Math.abs(s.strength - strength) < eps &&
      Math.abs(s.grainSize - grainSize) < eps &&
      Math.abs(s.blueBoost - blueBoost) < eps &&
      Math.abs(s.colorSaturation - colorSaturation) < eps,
  );
  return match ? match.id : 'custom';
}

// Re-roll seed to a fresh non-zero u32. 0 is reserved as "not yet seeded"
// inside the shader branch gates, so we explicitly avoid it.
export function rollNoiseSeed(): number {
  const v = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return v === 0 ? 1 : v;
}

export interface BlurNoisePresetValues {
  gaussianBlurEnabled: boolean;
  gaussianBlurRadius: number;
  noiseEnabled: boolean;
  noiseAmount: number;
  noiseOpacity: number;
  noiseDistribution: NoiseDistribution;
  noiseMonochrome: boolean;
}

export interface BlurNoisePreset {
  id: string;
  labelKey: string;
  values: BlurNoisePresetValues;
}

// "Vintage Video" — the look requested in the session brief: a light
// Gaussian blur plus a small amount of monochromatic, Gaussian-distributed
// noise, reminiscent of an analog camcorder transfer.
export const BLUR_NOISE_PRESETS: BlurNoisePreset[] = [
  {
    id: 'vintageVideo',
    labelKey: 'editor.blurNoise.presets.vintageVideo',
    values: {
      gaussianBlurEnabled: true,
      gaussianBlurRadius: 1.6,
      noiseEnabled: true,
      noiseAmount: 3,
      noiseOpacity: 100,
      noiseDistribution: 'gaussian',
      noiseMonochrome: true,
    },
  },
];

export function findPreset(id: string): BlurNoisePreset | undefined {
  return BLUR_NOISE_PRESETS.find((preset) => preset.id === id);
}
