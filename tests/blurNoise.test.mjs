import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLUR_NOISE_PRESETS,
  clampFilmNoiseStrength,
  clampGaussianBlurRadius,
  clampNoiseAmount,
  clampNoiseOpacity,
  FILM_NOISE_STOCKS,
  findFilmNoiseStock,
  findPreset,
  GAUSSIAN_BLUR_MAX,
  GAUSSIAN_BLUR_MIN,
  matchFilmNoiseStock,
  NOISE_AMOUNT_MAX,
  NOISE_AMOUNT_MIN,
  NOISE_OPACITY_MAX,
  NOISE_OPACITY_MIN,
  rollNoiseSeed,
} from '../plugin-src/src/utils/blurNoise.ts';

test('clampGaussianBlurRadius clamps to [min, max]', () => {
  assert.equal(clampGaussianBlurRadius(-5), GAUSSIAN_BLUR_MIN);
  assert.equal(clampGaussianBlurRadius(1.6), 1.6);
  assert.equal(clampGaussianBlurRadius(9999), GAUSSIAN_BLUR_MAX);
});

test('clampGaussianBlurRadius rejects non-finite input', () => {
  assert.equal(clampGaussianBlurRadius(NaN), GAUSSIAN_BLUR_MIN);
  assert.equal(clampGaussianBlurRadius(Infinity), GAUSSIAN_BLUR_MIN);
});

test('clampNoiseAmount clamps to [min, max]', () => {
  assert.equal(clampNoiseAmount(-1), NOISE_AMOUNT_MIN);
  assert.equal(clampNoiseAmount(3), 3);
  assert.equal(clampNoiseAmount(500), NOISE_AMOUNT_MAX);
});

test('clampNoiseOpacity clamps to [min, max] and defaults bad input to MAX', () => {
  assert.equal(clampNoiseOpacity(-1), NOISE_OPACITY_MIN);
  assert.equal(clampNoiseOpacity(42), 42);
  assert.equal(clampNoiseOpacity(500), NOISE_OPACITY_MAX);
  // Fallback MAX (= full opacity) on NaN keeps legacy sidecars that pre-date
  // the opacity field looking exactly as they did before.
  assert.equal(clampNoiseOpacity(NaN), NOISE_OPACITY_MAX);
});

test('the "Vintage Video" preset matches the session brief exactly', () => {
  const preset = findPreset('vintageVideo');
  assert.ok(preset, 'preset should exist');
  assert.equal(preset.values.gaussianBlurEnabled, true);
  assert.equal(preset.values.gaussianBlurRadius, 1.6);
  assert.equal(preset.values.noiseEnabled, true);
  assert.equal(preset.values.noiseAmount, 3);
  assert.equal(preset.values.noiseOpacity, 100);
  assert.equal(preset.values.noiseMonochrome, true);
});

test('findPreset returns undefined for an unknown id', () => {
  assert.equal(findPreset('does-not-exist'), undefined);
});

test('every preset has a unique id', () => {
  const ids = BLUR_NOISE_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('film stock presets exist for all five formats and have sane values', () => {
  const ids = FILM_NOISE_STOCKS.map((s) => s.id);
  // Expected 5 formats, no duplicates, matches the five RapidGrade grain presets
  // the user's own profiles reference.
  assert.deepEqual([...ids].sort(), ['16mm', '35mm', 'imax', 's16', 's35']);
  assert.equal(new Set(ids).size, 5);
  // Larger formats should produce finer-looking grain. If a future edit
  // breaks that ordering (say, swapping imax and 16mm), the look stops
  // tracking physical film and this test catches it.
  const imax = findFilmNoiseStock('imax');
  const s35 = findFilmNoiseStock('35mm');
  const sixteen = findFilmNoiseStock('16mm');
  assert.ok(imax && s35 && sixteen);
  assert.ok(imax.grainSize <= s35.grainSize);
  assert.ok(s35.grainSize <= sixteen.grainSize);
  assert.ok(imax.strength <= sixteen.strength);
});

test('clampFilmNoiseStrength clamps to [0, 100]', () => {
  assert.equal(clampFilmNoiseStrength(-1), 0);
  assert.equal(clampFilmNoiseStrength(42), 42);
  assert.equal(clampFilmNoiseStrength(500), 100);
});

test('matchFilmNoiseStock returns the exact preset id when values align', () => {
  // Each stock in FILM_NOISE_STOCKS must round-trip: feeding its own values
  // back in should return its own id, not 'custom'. If this fails, the stock
  // dropdown would show 'Custom' immediately after a user picks a preset.
  for (const stock of FILM_NOISE_STOCKS) {
    assert.equal(
      matchFilmNoiseStock(stock.strength, stock.grainSize, stock.blueBoost, stock.colorSaturation),
      stock.id,
    );
  }
});

test('matchFilmNoiseStock returns "custom" when any slider moves off the preset', () => {
  const s = findFilmNoiseStock('35mm');
  assert.ok(s);
  assert.equal(matchFilmNoiseStock(s.strength + 0.2, s.grainSize, s.blueBoost, s.colorSaturation), 'custom');
  assert.equal(matchFilmNoiseStock(s.strength, s.grainSize + 0.2, s.blueBoost, s.colorSaturation), 'custom');
  assert.equal(matchFilmNoiseStock(s.strength, s.grainSize, s.blueBoost + 0.2, s.colorSaturation), 'custom');
  assert.equal(matchFilmNoiseStock(s.strength, s.grainSize, s.blueBoost, s.colorSaturation + 0.2), 'custom');
});

test('rollNoiseSeed produces non-zero u32 values', () => {
  // 0 is reserved by the WGSL hash paths as a "not yet seeded" marker, so
  // the roller must skip it. Sample 2000 rolls: hitting zero even once in
  // 2000 draws from a uniform u32 range is ~0.0005%, so a sane
  // implementation plus the explicit !=0 guard should make this bulletproof.
  for (let i = 0; i < 2000; i++) {
    const v = rollNoiseSeed();
    assert.ok(Number.isInteger(v), `seed ${i} not an integer`);
    assert.ok(v > 0, `seed ${i} not positive (${v})`);
    assert.ok(v <= 0xffffffff, `seed ${i} overflows u32 (${v})`);
  }
});

test('rollNoiseSeed yields diverse seeds (no obvious stuck state)', () => {
  // Two rolls back-to-back landing on the same value happens, but across
  // 200 rolls we expect well over 150 distinct values in practice.
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rollNoiseSeed());
  assert.ok(seen.size > 150, `only ${seen.size} distinct seeds out of 200`);
});
