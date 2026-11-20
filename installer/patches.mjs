// patches.mjs — declarative list of every change the installer makes to RapidRAW.
// Each patch is idempotent: it looks for a marker first and skips if already applied.
//
// Markers follow the convention:   /* blur-noise-plugin:<id> */  (JS/TS/TSX/Rust/WGSL)
// For JSON files we use a top-level "_blurNoisePluginInstalled" sentinel key.
//
// Unlike the Press Plugin (pure frontend), this plugin also patches src-tauri/
// (Rust + WGSL) — see PLAN.md "Architektur-Erkenntnisse" for why each Rust
// touch point was chosen to be as small as possible (reuse existing GPU
// primitives instead of adding new pipelines wherever feasible).

export const PLUGIN_VERSION = '0.1.3';
export const BACKUP_DIR = '.blur-noise-plugin-backup';
export const MANIFEST_FILE = '.blur-noise-plugin-manifest.json';

/** Files that are copied verbatim from plugin-src/ into the RapidRAW tree. */
export const COPY_FILES = [
  // Rust — new effect modules, each reusing existing GPU primitives.
  { from: 'src-tauri/src/effects/gaussian_blur.rs', to: 'src-tauri/src/effects/gaussian_blur.rs' },
  { from: 'src-tauri/src/effects/noise.rs', to: 'src-tauri/src/effects/noise.rs' },
  { from: 'src-tauri/src/effects/film_noise.rs', to: 'src-tauri/src/effects/film_noise.rs' },
  // Frontend — new Effects-panel sections + pure logic.
  { from: 'src/components/adjustments/sections/GaussianBlurSection.tsx', to: 'src/components/adjustments/sections/GaussianBlurSection.tsx' },
  { from: 'src/components/adjustments/sections/NoiseSection.tsx', to: 'src/components/adjustments/sections/NoiseSection.tsx' },
  { from: 'src/components/adjustments/sections/FilmNoiseSection.tsx', to: 'src/components/adjustments/sections/FilmNoiseSection.tsx' },
  { from: 'src/utils/blurNoise.ts', to: 'src/utils/blurNoise.ts' },
];

/**
 * Text patches. Each entry describes:
 *   - file: path relative to RapidRAW root
 *   - id: short identifier used in the marker and logs
 *   - anchor: exact string that must appear in the file (we patch around it)
 *   - mode: 'insertAfter' | 'insertBefore' | 'replace'
 *   - payload: the string to insert / replacement
 *   - alreadyApplied: string that proves this patch is already done (idempotency)
 */
export const TEXT_PATCHES = [
  // -----------------------------------------------------------------
  // Rust — register the two new effect modules.
  // -----------------------------------------------------------------
  {
    file: 'src-tauri/src/effects/mod.rs',
    id: 'rust-mod-gaussian-blur',
    anchor: 'pub mod fog;',
    mode: 'insertAfter',
    alreadyApplied: 'pub mod gaussian_blur;',
    payload: '\npub mod gaussian_blur;',
  },
  {
    file: 'src-tauri/src/effects/mod.rs',
    id: 'rust-mod-noise',
    anchor: 'pub mod motion_blur;',
    mode: 'insertAfter',
    alreadyApplied: 'pub mod noise;',
    payload: '\npub mod noise;',
  },
  {
    file: 'src-tauri/src/effects/mod.rs',
    id: 'rust-mod-film-noise',
    anchor: 'pub mod relight;',
    mode: 'insertAfter',
    alreadyApplied: 'pub mod film_noise;',
    payload: '\npub mod film_noise;',
  },

  // -----------------------------------------------------------------
  // Rust — dispatch the two new effects right after Lens Blur, in the
  // same per-frame pass list render/source.rs already builds for every
  // other Tier-2 effect (relight, fog, lens_blur).
  // -----------------------------------------------------------------
  {
    file: 'src-tauri/src/render/source.rs',
    id: 'rust-dispatch-gaussian-blur-noise',
    anchor:
      '                stage(enc, &mut current, working_size, &|enc, src, dst| {\n' +
      '                    crate::effects::lens_blur::encode(enc, &job, src, dst)\n' +
      '                });\n' +
      '            }\n' +
      '        }',
    mode: 'replace',
    alreadyApplied: 'crate::effects::gaussian_blur::prepare',
    payload:
      '                stage(enc, &mut current, working_size, &|enc, src, dst| {\n' +
      '                    crate::effects::lens_blur::encode(enc, &job, src, dst)\n' +
      '                });\n' +
      '            }\n' +
      '            /* blur-noise-plugin:dispatch */\n' +
      '            if let Some(job) = crate::effects::gaussian_blur::prepare(adjustments, working_size) {\n' +
      '                stage(enc, &mut current, working_size, &|enc, src, dst| {\n' +
      '                    crate::effects::gaussian_blur::encode(enc, &job, src, dst)\n' +
      '                });\n' +
      '            }\n' +
      '            if let Some(job) = crate::effects::noise::prepare(adjustments, working_size, source.size) {\n' +
      '                stage(enc, &mut current, working_size, &|enc, src, dst| {\n' +
      '                    crate::effects::noise::encode(enc, &job, src, dst)\n' +
      '                });\n' +
      '            }\n' +
      '            if let Some(job) = crate::effects::film_noise::prepare(adjustments, working_size, source.size) {\n' +
      '                stage(enc, &mut current, working_size, &|enc, src, dst| {\n' +
      '                    crate::effects::film_noise::encode(enc, &job, src, dst)\n' +
      '                });\n' +
      '            }\n' +
      '        }',
  },

  // -----------------------------------------------------------------
  // Fixup: v0.1.2 → v0.1.3 upgraders carry the old `prepare(adjustments,
  // working_size)` signature from the earlier dispatch patch (its
  // alreadyApplied marker triggers above and skips reapplying). Here we
  // surgically add the third `source.size` argument that noise.rs /
  // film_noise.rs now require for image-space hashing. Gaussian Blur is
  // intentionally NOT touched — its radius lives in preview-pixel units
  // and must stay zoom-dependent (see PLAN.md P1.1 research section).
  // -----------------------------------------------------------------
  {
    file: 'src-tauri/src/render/source.rs',
    id: 'rust-dispatch-noise-source-size',
    anchor:
      'if let Some(job) = crate::effects::noise::prepare(adjustments, working_size) {',
    mode: 'replace',
    alreadyApplied:
      'crate::effects::noise::prepare(adjustments, working_size, source.size)',
    payload:
      'if let Some(job) = crate::effects::noise::prepare(adjustments, working_size, source.size) {',
  },
  {
    file: 'src-tauri/src/render/source.rs',
    id: 'rust-dispatch-film-noise-source-size',
    anchor:
      'if let Some(job) = crate::effects::film_noise::prepare(adjustments, working_size) {',
    mode: 'replace',
    alreadyApplied:
      'crate::effects::film_noise::prepare(adjustments, working_size, source.size)',
    payload:
      'if let Some(job) = crate::effects::film_noise::prepare(adjustments, working_size, source.size) {',
  },

  // -----------------------------------------------------------------
  // Rust — register the new "noise_apply" WGSL entry point under the
  // existing Group::Common pipeline set (no new Group / pipeline layout).
  // -----------------------------------------------------------------
  {
    file: 'src-tauri/src/render/gpu/compute.rs',
    id: 'rust-register-noise-entry',
    anchor: '                &["box_h", "box_v", "area_down", "gf_pack", "gf_coeffs"],',
    mode: 'replace',
    alreadyApplied: '"film_noise_apply"',
    payload: '                &["box_h", "box_v", "area_down", "gf_pack", "gf_coeffs", "noise_apply", "film_noise_apply", "blit_f16"],',
  },

  // -----------------------------------------------------------------
  // WGSL — the actual noise shader, appended to the shared compute_common
  // module (included into every Group, same as box_h/box_v/area_down).
  // -----------------------------------------------------------------
  {
    file: 'src-tauri/src/shaders/compute_common.wgsl',
    id: 'wgsl-noise-apply',
    anchor:
      '@compute @workgroup_size(8, 8, 1)\n' +
      'fn gf_coeffs(@builtin(global_invocation_id) id: vec3<u32>) {\n' +
      '    if (outside(id)) { return; }\n' +
      '    let m = textureLoad(t0, id.xy, 0);\n' +
      '    let var_i = max(m.z - m.x * m.x, 0.0);\n' +
      '    let a = (m.w - m.x * m.y) / (var_i + params.grid.eps);\n' +
      '    textureStore(out_f32, id.xy, vec4<f32>(a, m.y - a * m.x, 0.0, 0.0));\n' +
      '}',
    mode: 'insertAfter',
    alreadyApplied: 'fn noise_apply(',
    payload:
      '\n\n' +
      '// blur-noise-plugin:noise — Photoshop "Add Noise"-style per-pixel noise.\n' +
      '// Clean-room: reuses the Grid struct\'s existing fields (radius=seed,\n' +
      '// eps=amount, two unused flag bits) instead of a new uniform layout.\n' +
      'const MONOCHROME: u32 = 4u;\n' +
      'const GAUSSIAN_NOISE: u32 = 8u;\n' +
      '\n' +
      'fn noise_hash4(p: vec2<u32>, seed: u32) -> vec4<f32> {\n' +
      '    var v = vec4<u32>(p, seed, 0x9e3779b9u) * 1664525u + 1013904223u;\n' +
      '    v.x += v.y * v.w;\n' +
      '    v.y += v.z * v.x;\n' +
      '    v.z += v.x * v.y;\n' +
      '    v.w += v.y * v.z;\n' +
      '    v ^= v >> vec4<u32>(16u);\n' +
      '    v.x += v.y * v.w;\n' +
      '    v.y += v.z * v.x;\n' +
      '    v.z += v.x * v.y;\n' +
      '    v.w += v.y * v.z;\n' +
      '    return vec4<f32>(v >> vec4<u32>(8u)) / 16777216.0;\n' +
      '}\n' +
      '\n' +
      'fn noise_gaussian4(h: vec4<f32>) -> f32 {\n' +
      '    return (h.x + h.y + h.z + h.w - 2.0) * 1.7320508;\n' +
      '}\n' +
      '\n' +
      'fn noise_to_srgb(c: f32) -> f32 {\n' +
      '    let x = clamp(c, 0.0, 1.0);\n' +
      '    return select(1.055 * pow(x, 1.0 / 2.4) - 0.055, x * 12.92, x <= 0.0031308);\n' +
      '}\n' +
      '\n' +
      'fn noise_to_linear(c: f32) -> f32 {\n' +
      '    let x = clamp(c, 0.0, 1.0);\n' +
      '    return select(pow((x + 0.055) / 1.055, 2.4), x / 12.92, x <= 0.04045);\n' +
      '}\n' +
      '\n' +
      '// image_xy maps the preview-space id.xy back to source-image space so\n' +
      '// the hash input stays stable across zoom levels. The Grid uniform\n' +
      '// carries working_size in .dst and source_size in .src — see noise.rs\n' +
      '// / film_noise.rs module docs for the preview-stability rationale.\n' +
      'fn noise_image_xy(id: vec2<u32>) -> vec2<u32> {\n' +
      '    let scale = vec2<f32>(params.grid.src) / max(vec2<f32>(params.grid.dst), vec2<f32>(1.0));\n' +
      '    return vec2<u32>(vec2<f32>(id) * scale);\n' +
      '}\n' +
      '\n' +
      '@compute @workgroup_size(8, 8, 1)\n' +
      'fn noise_apply(@builtin(global_invocation_id) id: vec3<u32>) {\n' +
      '    if (outside(id)) { return; }\n' +
      '    let base = textureLoad(t0, id.xy, 0);\n' +
      '    let amount = params.grid.eps;\n' +
      '    let seed = params.grid.radius;\n' +
      '    let gaussian = (params.grid.flags & GAUSSIAN_NOISE) != 0u;\n' +
      '    let mono = (params.grid.flags & MONOCHROME) != 0u;\n' +
      '    // Opacity is packed into Grid.channel (unused by noise_apply) as an\n' +
      '    // f32 bitcast to u32 on the Rust side; unpack it here. 0 = original,\n' +
      '    // 1 = fully noisy. Clamp defensively in case Rust ever sends garbage.\n' +
      '    let opacity = clamp(bitcast<f32>(params.grid.channel), 0.0, 1.0);\n' +
      '    // image-space coordinate — stable across zoom (v0.1.3 P1.1).\n' +
      '    let img = noise_image_xy(id.xy);\n' +
      '\n' +
      '    var delta: vec3<f32>;\n' +
      '    if (mono) {\n' +
      '        let h = noise_hash4(img, seed);\n' +
      '        let n = select(h.x * 2.0 - 1.0, noise_gaussian4(h), gaussian);\n' +
      '        delta = vec3<f32>(n);\n' +
      '    } else {\n' +
      '        let hr = noise_hash4(img, seed);\n' +
      '        let hg = noise_hash4(img, seed + 1u);\n' +
      '        let hb = noise_hash4(img, seed + 2u);\n' +
      '        if (gaussian) {\n' +
      '            delta = vec3<f32>(noise_gaussian4(hr), noise_gaussian4(hg), noise_gaussian4(hb));\n' +
      '        } else {\n' +
      '            delta = vec3<f32>(hr.x, hg.x, hb.x) * 2.0 - 1.0;\n' +
      '        }\n' +
      '    }\n' +
      '\n' +
      '    // Perturb in perceptual (sRGB-ish) space like Photoshop, not in linear\n' +
      '    // light — linear-space noise looks far too subtle in shadows and far\n' +
      '    // too strong in highlights compared to how Add Noise actually looks.\n' +
      '    let srgb = vec3<f32>(noise_to_srgb(base.x), noise_to_srgb(base.y), noise_to_srgb(base.z));\n' +
      '    let perturbed = clamp(srgb + delta * amount, vec3<f32>(0.0), vec3<f32>(1.0));\n' +
      '    let result = vec3<f32>(\n' +
      '        noise_to_linear(perturbed.x),\n' +
      '        noise_to_linear(perturbed.y),\n' +
      '        noise_to_linear(perturbed.z),\n' +
      '    );\n' +
      '    // Blend the noisy result back into the original by `opacity`. For\n' +
      '    // pure additive noise this is close to (but not identical to) just\n' +
      '    // scaling amount, because the perturb step already clipped to [0,1]\n' +
      '    // in sRGB — opacity lets the user ease that clip off without losing\n' +
      '    // the noise texture everywhere else.\n' +
      '    let blended = mix(base.rgb, result, opacity);\n' +
      '    textureStore(out_f16, id.xy, vec4<f32>(blended, base.a));\n' +
      '}\n' +
      '\n' +
      '// blur-noise-plugin:blit — f32 -> f16 format-converting copy. box_h/box_v\n' +
      '// always write out_f32; this is the one explicit step that gets a Group::\n' +
      '// Common f32 intermediate result into an f16 destination (e.g. Gaussian\n' +
      '// Blur\'s final output) without a binding/format mismatch.\n' +
      '@compute @workgroup_size(8, 8, 1)\n' +
      'fn blit_f16(@builtin(global_invocation_id) id: vec3<u32>) {\n' +
      '    if (outside(id)) { return; }\n' +
      '    textureStore(out_f16, id.xy, textureLoad(t0, id.xy, 0));\n' +
      '}',
  },

  // -----------------------------------------------------------------
  // WGSL — Film Noise shader, same compute_common.wgsl module. Shares the
  // noise_hash4 / noise_gaussian4 / noise_to_srgb / noise_to_linear helpers
  // the Noise patch above installs (both land in the Group::Common module).
  // -----------------------------------------------------------------
  {
    file: 'src-tauri/src/shaders/compute_common.wgsl',
    id: 'wgsl-film-noise-apply',
    anchor:
      'fn blit_f16(@builtin(global_invocation_id) id: vec3<u32>) {\n' +
      '    if (outside(id)) { return; }\n' +
      '    textureStore(out_f16, id.xy, textureLoad(t0, id.xy, 0));\n' +
      '}',
    mode: 'insertAfter',
    alreadyApplied: 'fn film_noise_apply(',
    payload:
      '\n\n' +
      '// blur-noise-plugin:film-noise — spatial, density-weighted, blue-boosted film grain.\n' +
      '// Clean-room: reuses noise_hash4 / noise_gaussian4 / noise_to_srgb /\n' +
      '// noise_to_linear / noise_image_xy from the noise_apply block above,\n' +
      '// so both effects must ship in the same module (they do).\n' +
      '//\n' +
      '// v0.1.3 upgrades over v0.1.2:\n' +
      '//   - Hash input is image-space (noise_image_xy), not viewport id.xy.\n' +
      '//     Grain pattern stays stable across UI zoom (P1.1).\n' +
      '//   - Value-noise via bilinear interpolation between four hash samples,\n' +
      '//     so grain sizes > 1 look softly textured instead of block-tiled (P1.3).\n' +
      '//   - Blue-boost applied INSIDE the saturation mix so color_sat=0\n' +
      '//     actually produces equal-amplitude R/G/B gray grain (P0.1 fix).\n' +
      '//   - Optional flat density response for grain in shadows/highlights (P1.2).\n' +
      '//   - Opacity blend over the original image, like the plain Noise\n' +
      '//     effect; packed into flags bits 8..15 (P2.2).\n' +
      '//\n' +
      '// Grid.flags layout (see film_noise.rs for the authoritative spec):\n' +
      '//   bits 0..6 : grain_size quantized to 0.5-4.0 (128 steps)\n' +
      '//   bit  7    : response-flat flag\n' +
      '//   bits 8..15: opacity quantized to 0-100% (256 steps)\n' +
      'const FILM_RESPONSE_FLAT: u32 = 128u;\n' +
      '\n' +
      '@compute @workgroup_size(8, 8, 1)\n' +
      'fn film_noise_apply(@builtin(global_invocation_id) id: vec3<u32>) {\n' +
      '    if (outside(id)) { return; }\n' +
      '    let base = textureLoad(t0, id.xy, 0);\n' +
      '    let seed = params.grid.radius;\n' +
      '    let strength = params.grid.eps;\n' +
      '    let packed = params.grid.channel;\n' +
      '    let color_sat = clamp(f32(packed >> 16u) / 10000.0, 0.0, 1.0);\n' +
      '    let blue_boost = clamp(f32(packed & 0xffffu) / 10000.0, 0.0, 10.0);\n' +
      '    // Unpack grain_size (continuous f32 reconstructed from 7-bit quant),\n' +
      '    // response flag, and opacity from the flags u32.\n' +
      '    let grain_size_q = f32(params.grid.flags & 0x7Fu);\n' +
      '    let grain_size = max(0.5 + grain_size_q * (3.5 / 127.0), 0.5);\n' +
      '    let response_flat = (params.grid.flags & FILM_RESPONSE_FLAT) != 0u;\n' +
      '    let opacity = f32((params.grid.flags >> 8u) & 0xFFu) / 255.0;\n' +
      '\n' +
      '    // Image-space sampling — same working_size → source_size map as\n' +
      '    // noise_apply, so the grain pattern anchors to the original image.\n' +
      '    let img = vec2<f32>(noise_image_xy(id.xy));\n' +
      '    // Value-noise bilerp (v0.1.3 P1.3): sample four hashes on the\n' +
      '    // image-space grain lattice and blend them, giving soft transitions\n' +
      '    // instead of the hard block edges the earlier grain_scale took.\n' +
      '    let fp = img / grain_size;\n' +
      '    let base_xy = vec2<u32>(fp);\n' +
      '    let f = fract(fp);\n' +
      '    let w00 = (1.0 - f.x) * (1.0 - f.y);\n' +
      '    let w10 = f.x * (1.0 - f.y);\n' +
      '    let w01 = (1.0 - f.x) * f.y;\n' +
      '    let w11 = f.x * f.y;\n' +
      '    let x1 = vec2<u32>(1u, 0u);\n' +
      '    let y1 = vec2<u32>(0u, 1u);\n' +
      '\n' +
      '    let hr00 = noise_hash4(base_xy,           seed);\n' +
      '    let hr10 = noise_hash4(base_xy + x1,      seed);\n' +
      '    let hr01 = noise_hash4(base_xy + y1,      seed);\n' +
      '    let hr11 = noise_hash4(base_xy + x1 + y1, seed);\n' +
      '    let hg00 = noise_hash4(base_xy,           seed + 1u);\n' +
      '    let hg10 = noise_hash4(base_xy + x1,      seed + 1u);\n' +
      '    let hg01 = noise_hash4(base_xy + y1,      seed + 1u);\n' +
      '    let hg11 = noise_hash4(base_xy + x1 + y1, seed + 1u);\n' +
      '    let hb00 = noise_hash4(base_xy,           seed + 2u);\n' +
      '    let hb10 = noise_hash4(base_xy + x1,      seed + 2u);\n' +
      '    let hb01 = noise_hash4(base_xy + y1,      seed + 2u);\n' +
      '    let hb11 = noise_hash4(base_xy + x1 + y1, seed + 2u);\n' +
      '\n' +
      '    var nr = w00 * noise_gaussian4(hr00) + w10 * noise_gaussian4(hr10)\n' +
      '           + w01 * noise_gaussian4(hr01) + w11 * noise_gaussian4(hr11);\n' +
      '    var ng = w00 * noise_gaussian4(hg00) + w10 * noise_gaussian4(hg10)\n' +
      '           + w01 * noise_gaussian4(hg01) + w11 * noise_gaussian4(hg11);\n' +
      '    var nb = w00 * noise_gaussian4(hb00) + w10 * noise_gaussian4(hb10)\n' +
      '           + w01 * noise_gaussian4(hb01) + w11 * noise_gaussian4(hb11);\n' +
      '\n' +
      '    // color_sat=0 collapses all three channels to shared gray noise (B&W\n' +
      '    // film look); =1 keeps them fully independent (strongly colored grain).\n' +
      '    // Blue silver halide crystals are physically coarser → blue grain is\n' +
      '    // ~2x more visible in real color film. The multiplier is applied\n' +
      '    // INSIDE the color_sat mix (v0.1.3 P0.1): the old code multiplied\n' +
      '    // after the mix, so color_sat=0 still shifted the blue channel\n' +
      '    // relative to R/G and the output was tinted blue instead of gray.\n' +
      '    let gray = (nr + ng + nb) * (1.0 / 3.0);\n' +
      '    nr = mix(gray, nr, color_sat);\n' +
      '    ng = mix(gray, ng, color_sat);\n' +
      '    nb = mix(gray, nb * blue_boost, color_sat);\n' +
      '\n' +
      "    // Density weighting: grain is most visible where the film's D-log-E\n" +
      '    // curve is steepest, i.e. midtones. Parabola peaks at L=0.5 and cleanly\n' +
      '    // falls to zero at both ends. Response=flat (v0.1.3 P1.2) swaps this\n' +
      "    // for a near-uniform 0.25 weight so grain stays visible in shadows\n" +
      '    // and highlights, trading physical accuracy for creative control.\n' +
      '    let luma = dot(base.rgb, vec3<f32>(0.299, 0.587, 0.114));\n' +
      '    let density_weight = select(4.0 * luma * (1.0 - luma), 0.25, response_flat);\n' +
      '\n' +
      '    let srgb = vec3<f32>(noise_to_srgb(base.x), noise_to_srgb(base.y), noise_to_srgb(base.z));\n' +
      '    let delta = vec3<f32>(nr, ng, nb) * strength * density_weight;\n' +
      '    let perturbed = clamp(srgb + delta, vec3<f32>(0.0), vec3<f32>(1.0));\n' +
      '    let result = vec3<f32>(\n' +
      '        noise_to_linear(perturbed.x),\n' +
      '        noise_to_linear(perturbed.y),\n' +
      '        noise_to_linear(perturbed.z),\n' +
      '    );\n' +
      '    // Opacity blend — original at 0, full grain at 1 (v0.1.3 P2.2).\n' +
      '    let blended = mix(base.rgb, result, opacity);\n' +
      '    textureStore(out_f16, id.xy, vec4<f32>(blended, base.a));\n' +
      '}',
  },

  // -----------------------------------------------------------------
  // Frontend — Effect enum (utils/adjustments.ts)
  // -----------------------------------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-effect-enum',
    anchor: "  LensBlurMaxFade = 'lensBlurMaxFade',",
    mode: 'insertAfter',
    alreadyApplied: "GaussianBlurEnabled = 'gaussianBlurEnabled'",
    payload:
      '\n  /* blur-noise-plugin:enum */\n' +
      "  GaussianBlurEnabled = 'gaussianBlurEnabled',\n" +
      "  GaussianBlurRadius = 'gaussianBlurRadius',\n" +
      "  NoiseEnabled = 'noiseEnabled',\n" +
      "  NoiseAmount = 'noiseAmount',\n" +
      "  NoiseOpacity = 'noiseOpacity',\n" +
      "  NoiseDistribution = 'noiseDistribution',\n" +
      "  NoiseMonochrome = 'noiseMonochrome',\n" +
      "  NoiseSeed = 'noiseSeed',\n" +
      "  FilmNoiseEnabled = 'filmNoiseEnabled',\n" +
      "  FilmNoiseStock = 'filmNoiseStock',\n" +
      "  FilmNoiseStrength = 'filmNoiseStrength',\n" +
      "  FilmNoiseGrainSize = 'filmNoiseGrainSize',\n" +
      "  FilmNoiseBlueBoost = 'filmNoiseBlueBoost',\n" +
      "  FilmNoiseColorSaturation = 'filmNoiseColorSaturation',\n" +
      "  FilmNoiseSeed = 'filmNoiseSeed',",
  },
  // -----------------------------------------------------------------
  // Frontend — Adjustments interface fields
  // -----------------------------------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-adjustments-interface',
    anchor: '  lensBlurMinFade: number;',
    mode: 'insertAfter',
    alreadyApplied: 'gaussianBlurEnabled: boolean;',
    payload:
      '\n  /* blur-noise-plugin:fields */\n' +
      '  gaussianBlurEnabled: boolean;\n' +
      '  gaussianBlurRadius: number;\n' +
      '  noiseEnabled: boolean;\n' +
      '  noiseAmount: number;\n' +
      '  noiseOpacity: number;\n' +
      "  noiseDistribution: 'uniform' | 'gaussian';\n" +
      '  noiseMonochrome: boolean;\n' +
      '  noiseSeed: number;\n' +
      '  filmNoiseEnabled: boolean;\n' +
      "  filmNoiseStock: '16mm' | 's16' | '35mm' | 's35' | 'imax' | 'custom';\n" +
      '  filmNoiseStrength: number;\n' +
      '  filmNoiseGrainSize: number;\n' +
      '  filmNoiseBlueBoost: number;\n' +
      '  filmNoiseColorSaturation: number;\n' +
      '  filmNoiseSeed: number;',
  },

  // -----------------------------------------------------------------
  // Frontend — fixup patch for v0.1.2 → v0.1.3 upgraders: extend the
  // FilmNoiseStock type union with 'custom'. The original
  // ts-adjustments-interface patch above already stamped the field into
  // the file during a prior install, so its alreadyApplied marker now
  // matches regardless of whether 'custom' is in the union. This tiny
  // follow-up patch is a no-op on fresh v0.1.3 installs (the union is
  // already correct, and its own alreadyApplied matches) and surgically
  // upgrades the old union on everyone else.
  // -----------------------------------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-filmnoisestock-add-custom',
    anchor: "filmNoiseStock: '16mm' | 's16' | '35mm' | 's35' | 'imax';",
    mode: 'replace',
    alreadyApplied: "filmNoiseStock: '16mm' | 's16' | '35mm' | 's35' | 'imax' | 'custom';",
    payload: "filmNoiseStock: '16mm' | 's16' | '35mm' | 's35' | 'imax' | 'custom';",
  },

  // -----------------------------------------------------------------
  // Frontend — merge-with-defaults function (loadedAdjustments ?? INITIAL_ADJUSTMENTS)
  // -----------------------------------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-merge-defaults',
    anchor:
      '    lensBlurMinFade: loadedAdjustments.lensBlurMinFade ?? INITIAL_ADJUSTMENTS.lensBlurMinFade,',
    mode: 'insertAfter',
    alreadyApplied: 'gaussianBlurEnabled: loadedAdjustments.gaussianBlurEnabled',
    payload:
      '\n    /* blur-noise-plugin:merge */\n' +
      '    gaussianBlurEnabled: loadedAdjustments.gaussianBlurEnabled ?? INITIAL_ADJUSTMENTS.gaussianBlurEnabled,\n' +
      '    gaussianBlurRadius: loadedAdjustments.gaussianBlurRadius ?? INITIAL_ADJUSTMENTS.gaussianBlurRadius,\n' +
      '    noiseEnabled: loadedAdjustments.noiseEnabled ?? INITIAL_ADJUSTMENTS.noiseEnabled,\n' +
      '    noiseAmount: loadedAdjustments.noiseAmount ?? INITIAL_ADJUSTMENTS.noiseAmount,\n' +
      '    noiseOpacity: loadedAdjustments.noiseOpacity ?? INITIAL_ADJUSTMENTS.noiseOpacity,\n' +
      '    noiseDistribution: loadedAdjustments.noiseDistribution ?? INITIAL_ADJUSTMENTS.noiseDistribution,\n' +
      '    noiseMonochrome: loadedAdjustments.noiseMonochrome ?? INITIAL_ADJUSTMENTS.noiseMonochrome,\n' +
      '    noiseSeed: loadedAdjustments.noiseSeed ?? INITIAL_ADJUSTMENTS.noiseSeed,\n' +
      '    filmNoiseEnabled: loadedAdjustments.filmNoiseEnabled ?? INITIAL_ADJUSTMENTS.filmNoiseEnabled,\n' +
      '    filmNoiseStock: loadedAdjustments.filmNoiseStock ?? INITIAL_ADJUSTMENTS.filmNoiseStock,\n' +
      '    filmNoiseStrength: loadedAdjustments.filmNoiseStrength ?? INITIAL_ADJUSTMENTS.filmNoiseStrength,\n' +
      '    filmNoiseGrainSize: loadedAdjustments.filmNoiseGrainSize ?? INITIAL_ADJUSTMENTS.filmNoiseGrainSize,\n' +
      '    filmNoiseBlueBoost: loadedAdjustments.filmNoiseBlueBoost ?? INITIAL_ADJUSTMENTS.filmNoiseBlueBoost,\n' +
      '    filmNoiseColorSaturation: loadedAdjustments.filmNoiseColorSaturation ?? INITIAL_ADJUSTMENTS.filmNoiseColorSaturation,\n' +
      '    filmNoiseSeed: loadedAdjustments.filmNoiseSeed ?? INITIAL_ADJUSTMENTS.filmNoiseSeed,',
  },

  // -----------------------------------------------------------------
  // Frontend — register both tools in the Effects section's tool catalog.
  // Not just cosmetic for the "Customize Panels" submenu: RapidRAW's
  // adjustments panel sizes/scrolls its Effects content based on this list
  // (getAdjustmentToolOrder -> getAdjustmentSectionToolIds), so skipping
  // this leaves the two new sections rendered in the DOM but UNREACHABLE
  // by scrolling past Grain. Confirmed by an actual GUI test, not just
  // static checks (cargo check/naga/tsc all pass either way).
  // -----------------------------------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-register-effects-tools',
    anchor:
      "    { id: 'motionBlur', label: 'adjustments.effects.motionBlur' },\n" +
      "    { id: 'grain', label: 'adjustments.effects.grain' },\n" +
      '  ],\n' +
      '};',
    mode: 'replace',
    alreadyApplied: "{ id: 'gaussianBlur', label: 'editor.blurNoise.gaussianBlur.title' }",
    payload:
      "    { id: 'motionBlur', label: 'adjustments.effects.motionBlur' },\n" +
      "    { id: 'grain', label: 'adjustments.effects.grain' },\n" +
      "    { id: 'gaussianBlur', label: 'editor.blurNoise.gaussianBlur.title' },\n" +
      "    { id: 'noise', label: 'editor.blurNoise.noise.title' },\n" +
      "    { id: 'filmNoise', label: 'editor.blurNoise.filmNoise.title' },\n" +
      '  ],\n' +
      '};',
  },

  // -----------------------------------------------------------------
  // Frontend — default values (utils/defaultAdjustments.json)
  // -----------------------------------------------------------------
  {
    file: 'src/utils/defaultAdjustments.json',
    id: 'json-default-adjustments',
    anchor: '  "grainAmount": 0,\n  "grainRoughness": 50,\n  "grainSize": 25,',
    mode: 'insertAfter',
    alreadyApplied: '"gaussianBlurEnabled"',
    payload:
      '\n  "gaussianBlurEnabled": false,\n' +
      '  "gaussianBlurRadius": 0,\n' +
      '  "noiseEnabled": false,\n' +
      '  "noiseAmount": 0,\n' +
      '  "noiseOpacity": 100,\n' +
      '  "noiseDistribution": "uniform",\n' +
      '  "noiseMonochrome": false,\n' +
      '  "noiseSeed": 1,\n' +
      '  "filmNoiseEnabled": false,\n' +
      '  "filmNoiseStock": "35mm",\n' +
      '  "filmNoiseStrength": 60,\n' +
      '  "filmNoiseGrainSize": 1,\n' +
      '  "filmNoiseBlueBoost": 2,\n' +
      '  "filmNoiseColorSaturation": 20,\n' +
      '  "filmNoiseSeed": 1,',
  },

  // -----------------------------------------------------------------
  // Frontend — mount the two new sections inside the Effects panel, right
  // after Grain (same pattern RapidRAW itself uses for every other section).
  // -----------------------------------------------------------------
  {
    file: 'src/components/adjustments/Effects.tsx',
    id: 'tsx-effects-import',
    anchor: "import AdjustmentSubSection from './AdjustmentSubSection';",
    mode: 'insertAfter',
    alreadyApplied: "import GaussianBlurSection from './sections/GaussianBlurSection';",
    payload:
      '\n/* blur-noise-plugin:import */\n' +
      "import GaussianBlurSection from './sections/GaussianBlurSection';\n" +
      "import NoiseSection from './sections/NoiseSection';\n" +
      "import FilmNoiseSection from './sections/FilmNoiseSection';",
  },
  {
    file: 'src/components/adjustments/Effects.tsx',
    id: 'tsx-effects-mount',
    anchor:
      '                value={adjustments.grainRoughness}\n' +
      '                onDragStateChange={onDragStateChange}\n' +
      '                fillOrigin="min"\n' +
      '              />\n' +
      '            </AdjustmentSubSection>\n' +
      '          )}\n' +
      '        </>',
    mode: 'replace',
    alreadyApplied: '/* blur-noise-plugin:sections */',
    payload:
      '                value={adjustments.grainRoughness}\n' +
      '                onDragStateChange={onDragStateChange}\n' +
      '                fillOrigin="min"\n' +
      '              />\n' +
      '            </AdjustmentSubSection>\n' +
      '          )}\n' +
      '\n' +
      '          {/* blur-noise-plugin:sections */}\n' +
      '          <GaussianBlurSection\n' +
      '            adjustments={adjustments}\n' +
      '            handleAdjustmentChange={handleAdjustmentChange}\n' +
      '            hiddenTools={hiddenTools}\n' +
      '            onDragStateChange={onDragStateChange}\n' +
      '            toolOrder={toolOrder}\n' +
      '          />\n' +
      '          <NoiseSection\n' +
      '            adjustments={adjustments}\n' +
      '            handleAdjustmentChange={handleAdjustmentChange}\n' +
      '            hiddenTools={hiddenTools}\n' +
      '            onDragStateChange={onDragStateChange}\n' +
      '            setAdjustments={setAdjustments}\n' +
      '            toolOrder={toolOrder}\n' +
      '          />\n' +
      '          <FilmNoiseSection\n' +
      '            adjustments={adjustments}\n' +
      '            handleAdjustmentChange={handleAdjustmentChange}\n' +
      '            hiddenTools={hiddenTools}\n' +
      '            onDragStateChange={onDragStateChange}\n' +
      '            setAdjustments={setAdjustments}\n' +
      '            toolOrder={toolOrder}\n' +
      '          />\n' +
      '        </>',
  },

  // -----------------------------------------------------------------
  // Frontend — register the new effect groups in the copy/paste UI so users
  // can include/exclude them when copying adjustments between images
  // (ADJUSTMENT_GROUPS.effects feeds the modal; without this the new
  // effects silently never travel, no matter what the user ticks).
  // -----------------------------------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-register-copy-groups',
    anchor:
      "        Effect.RelightShadowSoftness,\n" +
      '      ],\n' +
      '    },\n' +
      '  ],\n' +
      '  geometry: [',
    mode: 'replace',
    alreadyApplied: "'modals.copyPaste.groups.gaussianBlur'",
    payload:
      "        Effect.RelightShadowSoftness,\n" +
      '      ],\n' +
      '    },\n' +
      '    /* blur-noise-plugin:copy-groups */\n' +
      "    { label: 'modals.copyPaste.groups.gaussianBlur', keys: [Effect.GaussianBlurEnabled, Effect.GaussianBlurRadius] },\n" +
      '    {\n' +
      "      label: 'modals.copyPaste.groups.noise',\n" +
      '      keys: [\n' +
      '        Effect.NoiseEnabled,\n' +
      '        Effect.NoiseAmount,\n' +
      '        Effect.NoiseOpacity,\n' +
      '        Effect.NoiseDistribution,\n' +
      '        Effect.NoiseMonochrome,\n' +
      '        Effect.NoiseSeed,\n' +
      '      ],\n' +
      '    },\n' +
      '    {\n' +
      "      label: 'modals.copyPaste.groups.filmNoise',\n" +
      '      keys: [\n' +
      '        Effect.FilmNoiseEnabled,\n' +
      '        Effect.FilmNoiseStock,\n' +
      '        Effect.FilmNoiseStrength,\n' +
      '        Effect.FilmNoiseGrainSize,\n' +
      '        Effect.FilmNoiseBlueBoost,\n' +
      '        Effect.FilmNoiseColorSaturation,\n' +
      '        Effect.FilmNoiseSeed,\n' +
      '      ],\n' +
      '    },\n' +
      '  ],\n' +
      '  geometry: [',
  },

  // -----------------------------------------------------------------
  // Rust — add my effect fields to calculate_effects_hash (and _transform_
  // hash). RapidRAW caches the rendered "effects stage" keyed by
  // calculate_effects_hash — if my fields aren't in it, the cache serves
  // a stale frame when the user tweaks my sliders and the preview looks
  // stuck until something unrelated (like zoom) invalidates a broader
  // cache. This is the fix for the "only renders when zoomed in" bug
  // the user reported.
  // -----------------------------------------------------------------
  {
    file: 'src-tauri/src/render/cache_utils.rs',
    id: 'rust-cache-effects-hash',
    anchor:
      '    if fog_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &[\n' +
      '                "fogAmount",\n' +
      '                "fogStart",\n' +
      '                "fogDensity",\n' +
      '                "fogHeight",\n' +
      '                "fogVariation",\n' +
      '                "fogGlow",\n' +
      '                "fogTemperature",\n' +
      '                "fogTint",\n' +
      '                "fogDepthMap",\n' +
      '            ],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '        hash_orientation(adjustments, &mut hasher);\n' +
      '    }\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_thumbnail_source_hash',
    mode: 'replace',
    alreadyApplied: '// blur-noise-plugin:cache-effects',
    payload:
      '    if fog_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &[\n' +
      '                "fogAmount",\n' +
      '                "fogStart",\n' +
      '                "fogDensity",\n' +
      '                "fogHeight",\n' +
      '                "fogVariation",\n' +
      '                "fogGlow",\n' +
      '                "fogTemperature",\n' +
      '                "fogTint",\n' +
      '                "fogDepthMap",\n' +
      '            ],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '        hash_orientation(adjustments, &mut hasher);\n' +
      '    }\n' +
      '\n' +
      '    // blur-noise-plugin:cache-effects — without this, the effects-stage\n' +
      '    // cache serves a stale frame when only these fields change.\n' +
      '    let gaussian_blur_enabled = is_effect_enabled(adjustments, "gaussianBlur", "gaussianBlurEnabled");\n' +
      '    gaussian_blur_enabled.hash(&mut hasher);\n' +
      '    if gaussian_blur_enabled {\n' +
      '        hash_effect_keys(adjustments, &["gaussianBlurRadius"], &mut hasher);\n' +
      '    }\n' +
      '    let noise_enabled = is_effect_enabled(adjustments, "noise", "noiseEnabled");\n' +
      '    noise_enabled.hash(&mut hasher);\n' +
      '    if noise_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &["noiseAmount", "noiseOpacity", "noiseDistribution", "noiseMonochrome", "noiseSeed"],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '    }\n' +
      '    let film_noise_enabled = is_effect_enabled(adjustments, "filmNoise", "filmNoiseEnabled");\n' +
      '    film_noise_enabled.hash(&mut hasher);\n' +
      '    if film_noise_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &[\n' +
      '                "filmNoiseStock",\n' +
      '                "filmNoiseStrength",\n' +
      '                "filmNoiseGrainSize",\n' +
      '                "filmNoiseBlueBoost",\n' +
      '                "filmNoiseColorSaturation",\n' +
      '                "filmNoiseSeed",\n' +
      '            ],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '    }\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_thumbnail_source_hash',
  },

  // Same story for calculate_transform_hash — it also feeds a cache and
  // also hashes lens_blur/relight/fog internally, so symmetry alone would
  // justify adding my fields; and anecdotally the stale-frame symptom goes
  // away faster with both caches tracking the full adjustments.
  {
    file: 'src-tauri/src/render/cache_utils.rs',
    id: 'rust-cache-transform-hash',
    anchor:
      '    hash_ai_patches(adjustments, &mut hasher);\n' +
      '    hash_ai_denoise(adjustments, &mut hasher);\n' +
      '    hash_negative_conversion(adjustments, &mut hasher);\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_full_job_hash',
    mode: 'replace',
    alreadyApplied: '// blur-noise-plugin:cache-transform',
    payload:
      '    hash_ai_patches(adjustments, &mut hasher);\n' +
      '    hash_ai_denoise(adjustments, &mut hasher);\n' +
      '    hash_negative_conversion(adjustments, &mut hasher);\n' +
      '\n' +
      '    // blur-noise-plugin:cache-transform\n' +
      '    let gaussian_blur_enabled = is_effect_enabled(adjustments, "gaussianBlur", "gaussianBlurEnabled");\n' +
      '    gaussian_blur_enabled.hash(&mut hasher);\n' +
      '    if gaussian_blur_enabled {\n' +
      '        hash_effect_keys(adjustments, &["gaussianBlurRadius"], &mut hasher);\n' +
      '    }\n' +
      '    let noise_enabled = is_effect_enabled(adjustments, "noise", "noiseEnabled");\n' +
      '    noise_enabled.hash(&mut hasher);\n' +
      '    if noise_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &["noiseAmount", "noiseOpacity", "noiseDistribution", "noiseMonochrome", "noiseSeed"],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '    }\n' +
      '    let film_noise_enabled = is_effect_enabled(adjustments, "filmNoise", "filmNoiseEnabled");\n' +
      '    film_noise_enabled.hash(&mut hasher);\n' +
      '    if film_noise_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &[\n' +
      '                "filmNoiseStock",\n' +
      '                "filmNoiseStrength",\n' +
      '                "filmNoiseGrainSize",\n' +
      '                "filmNoiseBlueBoost",\n' +
      '                "filmNoiseColorSaturation",\n' +
      '                "filmNoiseSeed",\n' +
      '            ],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '    }\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_full_job_hash',
  },

  // -----------------------------------------------------------------
  // v0.1.3 new fields — filmNoiseOpacity (P2.2) and filmNoiseResponse (P1.2).
  // Each of these patches hangs off a `filmNoiseSeed`-adjacent anchor from
  // the v0.1.2 patches above, so the installer touches every dependent
  // location (enum, interface, merge-defaults, JSON defaults, both cache
  // hash functions, copy/paste group). The original v0.1.2 patches are
  // left untouched — their alreadyApplied markers fire on upgrade and the
  // field-level fixups below idempotently top them up with the new fields.
  // On a fresh install they run right after the v0.1.2 patches with the
  // anchor still intact, so the end state is the same.
  // -----------------------------------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-effect-enum-v013-opacity-response',
    anchor: "FilmNoiseSeed = 'filmNoiseSeed',",
    mode: 'insertAfter',
    alreadyApplied: "FilmNoiseOpacity = 'filmNoiseOpacity'",
    payload:
      '\n  /* blur-noise-plugin:enum-v013 */\n' +
      "  FilmNoiseOpacity = 'filmNoiseOpacity',\n" +
      "  FilmNoiseResponse = 'filmNoiseResponse',",
  },
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-adjustments-interface-v013-opacity-response',
    anchor: '  filmNoiseSeed: number;',
    mode: 'insertAfter',
    alreadyApplied: 'filmNoiseOpacity: number;',
    payload:
      '\n  /* blur-noise-plugin:fields-v013 */\n' +
      '  filmNoiseOpacity: number;\n' +
      "  filmNoiseResponse: 'film' | 'flat';",
  },
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-merge-defaults-v013-opacity-response',
    anchor:
      '    filmNoiseSeed: loadedAdjustments.filmNoiseSeed ?? INITIAL_ADJUSTMENTS.filmNoiseSeed,',
    mode: 'insertAfter',
    alreadyApplied: 'filmNoiseOpacity: loadedAdjustments.filmNoiseOpacity',
    payload:
      '\n    /* blur-noise-plugin:merge-v013 */\n' +
      '    filmNoiseOpacity: loadedAdjustments.filmNoiseOpacity ?? INITIAL_ADJUSTMENTS.filmNoiseOpacity,\n' +
      '    filmNoiseResponse: loadedAdjustments.filmNoiseResponse ?? INITIAL_ADJUSTMENTS.filmNoiseResponse,',
  },
  {
    file: 'src/utils/defaultAdjustments.json',
    id: 'json-defaults-v013-opacity-response',
    anchor: '"filmNoiseSeed": 1,',
    mode: 'insertAfter',
    alreadyApplied: '"filmNoiseOpacity":',
    payload:
      '\n  "filmNoiseOpacity": 100,\n' +
      '  "filmNoiseResponse": "film",',
  },
  {
    file: 'src-tauri/src/render/cache_utils.rs',
    id: 'rust-cache-effects-v013-opacity-response',
    anchor:
      '    let film_noise_enabled = is_effect_enabled(adjustments, "filmNoise", "filmNoiseEnabled");\n' +
      '    film_noise_enabled.hash(&mut hasher);\n' +
      '    if film_noise_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &[\n' +
      '                "filmNoiseStock",\n' +
      '                "filmNoiseStrength",\n' +
      '                "filmNoiseGrainSize",\n' +
      '                "filmNoiseBlueBoost",\n' +
      '                "filmNoiseColorSaturation",\n' +
      '                "filmNoiseSeed",\n' +
      '            ],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '    }\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_thumbnail_source_hash',
    mode: 'replace',
    alreadyApplied: '"filmNoiseOpacity",',
    payload:
      '    let film_noise_enabled = is_effect_enabled(adjustments, "filmNoise", "filmNoiseEnabled");\n' +
      '    film_noise_enabled.hash(&mut hasher);\n' +
      '    if film_noise_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &[\n' +
      '                "filmNoiseStock",\n' +
      '                "filmNoiseStrength",\n' +
      '                "filmNoiseGrainSize",\n' +
      '                "filmNoiseBlueBoost",\n' +
      '                "filmNoiseColorSaturation",\n' +
      '                "filmNoiseSeed",\n' +
      '                "filmNoiseOpacity",\n' +
      '                "filmNoiseResponse",\n' +
      '            ],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '    }\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_thumbnail_source_hash',
  },
  {
    file: 'src-tauri/src/render/cache_utils.rs',
    id: 'rust-cache-transform-v013-opacity-response',
    anchor:
      '    let film_noise_enabled = is_effect_enabled(adjustments, "filmNoise", "filmNoiseEnabled");\n' +
      '    film_noise_enabled.hash(&mut hasher);\n' +
      '    if film_noise_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &[\n' +
      '                "filmNoiseStock",\n' +
      '                "filmNoiseStrength",\n' +
      '                "filmNoiseGrainSize",\n' +
      '                "filmNoiseBlueBoost",\n' +
      '                "filmNoiseColorSaturation",\n' +
      '                "filmNoiseSeed",\n' +
      '            ],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '    }\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_full_job_hash',
    mode: 'replace',
    alreadyApplied: '"filmNoiseOpacity",\n                "filmNoiseResponse",\n            ],\n            &mut hasher,\n        );\n    }\n\n    hasher.finish()\n}\n\npub fn calculate_full_job_hash',
    payload:
      '    let film_noise_enabled = is_effect_enabled(adjustments, "filmNoise", "filmNoiseEnabled");\n' +
      '    film_noise_enabled.hash(&mut hasher);\n' +
      '    if film_noise_enabled {\n' +
      '        hash_effect_keys(\n' +
      '            adjustments,\n' +
      '            &[\n' +
      '                "filmNoiseStock",\n' +
      '                "filmNoiseStrength",\n' +
      '                "filmNoiseGrainSize",\n' +
      '                "filmNoiseBlueBoost",\n' +
      '                "filmNoiseColorSaturation",\n' +
      '                "filmNoiseSeed",\n' +
      '                "filmNoiseOpacity",\n' +
      '                "filmNoiseResponse",\n' +
      '            ],\n' +
      '            &mut hasher,\n' +
      '        );\n' +
      '    }\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_full_job_hash',
  },
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-register-copy-groups-v013-opacity-response',
    anchor: '        Effect.FilmNoiseSeed,',
    mode: 'insertAfter',
    alreadyApplied: 'Effect.FilmNoiseOpacity',
    payload: '\n        Effect.FilmNoiseOpacity,\n        Effect.FilmNoiseResponse,',
  },

  // -----------------------------------------------------------------
  // Frontend — reconcile persisted copy/paste settings with the current
  // COPYABLE_ADJUSTMENT_KEYS so a plugin update (new effect fields!) is
  // adopted without the user having to re-tick every group manually.
  //
  // Bug being fixed (v0.1.3 P0.3): useAppInitialization only resets the
  // includedAdjustments when it's missing/empty — if the user has ever
  // saved copy/paste settings before installing this plugin, their
  // persisted includedAdjustments silently exclude every new blur-noise
  // field, so Copy/Paste looks half-broken until they open the settings
  // modal and click "Select all".
  //
  // The knownAdjustments bucket already exists in the Settings type but
  // is otherwise unused in upstream RapidRAW — we repurpose it as the
  // "has the user ever been shown this key" tracker, so deliberate
  // deselections survive across future plugin updates.
  // -----------------------------------------------------------------
  {
    file: 'src/hooks/useAppInitialization.ts',
    id: 'ts-copypaste-reconcile-new-keys',
    anchor:
      '        if (\n' +
      '          !settings.copyPasteSettings ||\n' +
      '          !settings.copyPasteSettings.includedAdjustments ||\n' +
      '          settings.copyPasteSettings.includedAdjustments.length === 0\n' +
      '        ) {\n' +
      "          settings.copyPasteSettings = { mode: 'merge', includedAdjustments: COPYABLE_ADJUSTMENT_KEYS };\n" +
      '        }',
    mode: 'insertAfter',
    alreadyApplied: 'blur-noise-plugin:copypaste-reconcile — auto-adopt newly',
    payload:
      '\n\n' +
      '        /* blur-noise-plugin:copypaste-reconcile — auto-adopt newly\n' +
      '           introduced copyable keys (plugin updates add fields the\n' +
      "           user has never seen). knownAdjustments tracks what they've\n" +
      '           been shown; new keys get appended to includedAdjustments\n' +
      '           on first boot, respecting any prior deliberate deselection. */\n' +
      '        if (settings.copyPasteSettings?.includedAdjustments?.length) {\n' +
      '          const known = new Set<string>(\n' +
      '            (settings.copyPasteSettings.knownAdjustments?.length\n' +
      '              ? settings.copyPasteSettings.knownAdjustments\n' +
      '              : settings.copyPasteSettings.includedAdjustments) as string[],\n' +
      '          );\n' +
      '          const included = new Set<string>(settings.copyPasteSettings.includedAdjustments as string[]);\n' +
      '          let dirty = false;\n' +
      '          for (const key of COPYABLE_ADJUSTMENT_KEYS) {\n' +
      '            if (!known.has(key)) {\n' +
      '              included.add(key);\n' +
      '              known.add(key);\n' +
      '              dirty = true;\n' +
      '            }\n' +
      '          }\n' +
      '          if (dirty) {\n' +
      '            settings.copyPasteSettings = {\n' +
      '              ...settings.copyPasteSettings,\n' +
      '              includedAdjustments: Array.from(included),\n' +
      '              knownAdjustments: Array.from(known),\n' +
      '            };\n' +
      '            handleSettingsChange(settings);\n' +
      '          }\n' +
      '        }',
  },
];

/**
 * i18n insertions — safe JSON deep-merge (not anchor-based), so these don't
 * need verbatim knowledge of the existing locale files' exact contents.
 */
export const I18N_PATCHES = {
  en: {
    path: 'src/i18n/locales/en.json',
    editor: {
      _blurNoisePluginInstalled: PLUGIN_VERSION,
      blurNoise: {
        gaussianBlur: {
          title: 'Gaussian Blur',
          enable: 'Enable Gaussian Blur',
          radius: 'Radius',
        },
        noise: {
          title: 'Noise',
          enable: 'Enable Noise',
          amount: 'Amount',
          opacity: 'Opacity',
          distribution: 'Distribution',
          uniform: 'Uniform',
          gaussian: 'Gaussian',
          monochrome: 'Monochromatic',
          rerollSeed: '🎲 Seed',
          rerollSeedTitle: 'Reroll noise seed',
        },
        filmNoise: {
          title: 'Film Noise',
          enable: 'Enable Film Noise',
          stock: 'Film Stock',
          strength: 'Strength',
          opacity: 'Opacity',
          grainSize: 'Grain Size',
          blueBoost: 'Blue Boost',
          colorSaturation: 'Color Saturation',
          monochrome: 'Monochromatic',
          responseFlat: 'Grain in shadows & highlights',
          rerollSeed: '🎲 Seed',
          rerollSeedTitle: 'Reroll grain seed',
          stocks: {
            '16mm': '16mm',
            's16': 'Super 16',
            '35mm': '35mm',
            's35': 'Super 35',
            imax: 'IMAX',
            custom: 'Custom',
          },
        },
        presets: {
          vintageVideo: 'Vintage Video',
        },
      },
    },
    modals: {
      copyPaste: {
        groups: {
          gaussianBlur: 'Gaussian Blur',
          noise: 'Noise',
          filmNoise: 'Film Noise',
        },
      },
    },
  },
  de: {
    path: 'src/i18n/locales/de.json',
    editor: {
      _blurNoisePluginInstalled: PLUGIN_VERSION,
      blurNoise: {
        gaussianBlur: {
          title: 'Gaußscher Weichzeichner',
          enable: 'Gaußschen Weichzeichner aktivieren',
          radius: 'Radius',
        },
        noise: {
          title: 'Rauschen',
          enable: 'Rauschen aktivieren',
          amount: 'Stärke',
          opacity: 'Deckkraft',
          distribution: 'Verteilung',
          uniform: 'Gleichverteilt',
          gaussian: 'Gaußverteilt',
          monochrome: 'Monochrom',
          rerollSeed: '🎲 Seed',
          rerollSeedTitle: 'Neuen Zufalls-Seed generieren',
        },
        filmNoise: {
          title: 'Filmkorn',
          enable: 'Filmkorn aktivieren',
          stock: 'Filmformat',
          strength: 'Stärke',
          opacity: 'Deckkraft',
          grainSize: 'Korngröße',
          blueBoost: 'Blau-Boost',
          colorSaturation: 'Farbsättigung',
          monochrome: 'Monochrom',
          responseFlat: 'Grain in Schatten & Lichtern',
          rerollSeed: '🎲 Seed',
          rerollSeedTitle: 'Neuen Zufalls-Seed generieren',
          stocks: {
            '16mm': '16mm',
            's16': 'Super 16',
            '35mm': '35mm',
            's35': 'Super 35',
            imax: 'IMAX',
            custom: 'Custom',
          },
        },
        presets: {
          vintageVideo: 'Vintage-Video',
        },
      },
    },
    modals: {
      copyPaste: {
        groups: {
          gaussianBlur: 'Gaußscher Weichzeichner',
          noise: 'Rauschen',
          filmNoise: 'Filmkorn',
        },
      },
    },
  },
};
