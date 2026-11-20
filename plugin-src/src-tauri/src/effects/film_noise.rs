// Film Noise — Blur Noise Plugin for RapidRAW
//
// Clean-room implementation of a film-grain look, modelled after public
// knowledge of analog film grain:
//   - Grain is spatially correlated (silver halide crystals form clumps, not
//     per-pixel white noise). We fake this cheaply with a block-aligned hash:
//     all pixels in a `grain_scale`×`grain_scale` tile share the same random
//     value, so the effective grain size is tied to a user-adjustable scale.
//   - Grain is more visible in midtones than in shadows/highlights, because
//     the characteristic D-log-E curve of film has steepest slope mid-range.
//     Approximated by a parabolic 4·L·(1-L) density weighting on luminance.
//   - The blue-sensitive silver halide layer uses larger crystals than the
//     green/red layers, so blue grain is visibly stronger — exposed as a
//     `blue_boost` multiplier (default 2.0 ≈ typical 35mm color negative).
//   - `color_sat` interpolates between gray grain (0 = perfectly monochrome
//     like B&W film) and independent R/G/B grain (1 = heavily colored).
//
// Uses the shared `noise_hash4` / `noise_gaussian4` / `noise_to_srgb` /
// `noise_to_linear` helpers that the Noise effect appends to the
// `compute_common.wgsl` module, so this must be loaded in the same shader
// module. No new pipeline / bind group needed.
//
// v0.1.3 adds three user-facing knobs that fit into the same packing:
//   - Opacity (0-100%) blends the grain result over the original, like the
//     plain Noise effect. Stored as a quantized 8-bit value in flags high bits.
//   - Response ('film' default parabolic density, 'flat' uniform) lets the
//     user force grain into shadows/highlights, overriding the natural
//     D-log-E peak at midtones.
//   - Grain size is now continuous (f32) instead of a 1-4 px integer block,
//     because the v0.1.3 shader does bilinear interpolation between hash
//     samples for a softer, non-tiled look at sizes > 1.

use crate::render::adjustment_utils::is_effect_enabled;
use crate::render::gpu::compute::{Bind, ComputeEncoder, Grid, Group, Out, Slot};

pub struct FilmNoiseJob {
    seed: u32,
    strength: f32,
    grain_size: f32,
    blue_boost: f32,
    color_sat: f32,
    opacity: f32,
    response_flat: bool,
    // Full-source image size so the shader can hash in image space (same
    // preview-stability fix as noise.rs — see that file's module doc).
    source_size: (u32, u32),
}

pub fn prepare(
    adjustments: &serde_json::Value,
    (w, h): (u32, u32),
    source_size: (u32, u32),
) -> Option<FilmNoiseJob> {
    if !is_effect_enabled(adjustments, "filmNoise", "filmNoiseEnabled") {
        return None;
    }
    if w < 1 || h < 1 {
        return None;
    }
    let strength_pct = adjustments["filmNoiseStrength"].as_f64().unwrap_or(0.0) as f32;
    if strength_pct <= 0.0 {
        return None;
    }
    // User-facing 0-100% maps to a 0.0-2.0 shader strength (room for heavy
    // grain beyond the usual "subtle" 60% default without piling up at 1.0).
    let strength = (strength_pct / 100.0).clamp(0.0, 2.0);
    // Grain size stays as a continuous float: the v0.1.3 shader bilerps
    // between four neighbouring hash samples, so sizes like 1.7 px read as
    // a smooth intermediate texture (vs. the old rounded 1/2/3/4-px blocks).
    let grain_size = (adjustments["filmNoiseGrainSize"].as_f64().unwrap_or(1.0) as f32)
        .clamp(0.5, 4.0);
    let blue_boost = adjustments["filmNoiseBlueBoost"]
        .as_f64()
        .unwrap_or(2.0) as f32;
    let blue_boost = blue_boost.clamp(0.0, 3.0);
    let color_sat_pct = adjustments["filmNoiseColorSaturation"]
        .as_f64()
        .unwrap_or(20.0) as f32;
    let color_sat = (color_sat_pct / 100.0).clamp(0.0, 1.0);
    let seed = adjustments["filmNoiseSeed"].as_u64().unwrap_or(1) as u32;
    let opacity = (adjustments["filmNoiseOpacity"].as_f64().unwrap_or(100.0) as f32 / 100.0)
        .clamp(0.0, 1.0);
    if opacity <= 0.0 {
        return None;
    }
    let response_flat = adjustments["filmNoiseResponse"].as_str() == Some("flat");
    Some(FilmNoiseJob {
        seed,
        strength,
        grain_size,
        blue_boost,
        color_sat,
        opacity,
        response_flat,
        source_size,
    })
}

// Bit layout of Grid.flags for film_noise_apply (packed small to avoid adding
// new uniform slots to the shared Common group's bind layout):
//
//   bits  0-6 : grain_size quantized to 0.5-4.0 (7 bits, 128 steps,
//               resolution ~0.028 px — well below perceptual threshold)
//   bit   7   : response flat flag (0 = parabolic density, 1 = full-range)
//   bits  8-15: opacity quantized to 0-100% (8 bits, 256 steps, ~0.4%)
//   bits 16-17: grain_scale compatibility for future shader variants (reserved)
//
// The shader pulls grain_size back out as:
//   let q = f32(flags & 0x7Fu); let gsz = 0.5 + q * (3.5 / 127.0);
const RESPONSE_FLAT_BIT: u32 = 1 << 7;

pub fn encode(enc: &mut ComputeEncoder, job: &FilmNoiseJob, src: &Slot, dst: &Slot) {
    // Pack color_sat (0-1) into Grid.channel's high 16 bits and blue_boost
    // (0-3) into the low 16 bits, both quantized to 0.0001 resolution. This
    // avoids adding new uniform fields / bind groups to the shared Common
    // group's layout — Grid.channel is otherwise unused by this effect.
    let color_sat_u = (job.color_sat * 10_000.0).clamp(0.0, 65_535.0) as u32;
    let blue_boost_u = (job.blue_boost * 10_000.0).clamp(0.0, 65_535.0) as u32;
    let channel = (color_sat_u << 16) | blue_boost_u;
    // Pack grain_size, response flag, opacity into flags per the bit layout
    // documented above. Clamp before quantization so an off-by-one at the
    // boundaries can't bleed into an adjacent bit field.
    let grain_size_q = ((job.grain_size - 0.5) * (127.0 / 3.5))
        .round()
        .clamp(0.0, 127.0) as u32;
    let opacity_q = (job.opacity * 255.0).round().clamp(0.0, 255.0) as u32;
    let flags = (grain_size_q & 0x7F)
        | if job.response_flat { RESPONSE_FLAT_BIT } else { 0 }
        | ((opacity_q & 0xFF) << 8);

    let grid = Grid {
        radius: job.seed,
        channel,
        eps: job.strength,
        flags,
        // See noise.rs: Grid.src carries full source_size so the shader can
        // hash in image space, keeping the grain pattern stable across zoom.
        src: [job.source_size.0, job.source_size.1],
        ..Grid::new(src.size)
    };
    enc.run(
        Group::Common,
        "film_noise_apply",
        &grid,
        src.size,
        &[&src.view],
        Out::F16(&dst.view),
        Bind::default(),
    );
}
