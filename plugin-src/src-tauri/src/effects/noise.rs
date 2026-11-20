// Noise Generation — Blur Noise Plugin for RapidRAW
//
// Clean-room implementation of Photoshop's "Add Noise" *behaviour*
// (Amount / Uniform-or-Gaussian distribution / Monochromatic — see Adobe's
// own UXP API docs, which describe exactly these three knobs). No Photoshop
// code or assets were used; the per-pixel hash is RapidRAW's own existing
// convention (the same Wang-hash style already used by the Grain effect's
// `grain_hash` in shader.wgsl and by motion_blur.wgsl's `grain()`), just
// without Grain's size/roughness clumping — plain per-pixel noise.
//
// Single compute pass, reusing `Group::Common` (see shaders/compute_common.wgsl
// `noise_apply`) — no new shader module/pipeline registration needed.
//
// Preview stability (v0.1.3 P1.1): the shader hashes in IMAGE-space, not
// in preview-viewport-space, so the same pixel of the original image gets
// the same noise sample regardless of UI zoom / target_resolution. Done by
// passing the full `source.size` through Grid.src and letting the shader
// scale id.xy back up before hashing. Pattern matches Lightroom/Capture One.

use crate::render::adjustment_utils::is_effect_enabled;
use crate::render::gpu::compute::{Bind, ComputeEncoder, Grid, Group, Out, Slot};

/// Bit flags packed into `Grid.flags`, read back by `noise_apply` in
/// compute_common.wgsl. Bits 0/1 (KEEP_ZW/RGB_MODE) are already used by other
/// Group::Common passes (box blur / area_down) — these are new, unused bits.
const MONOCHROME_FLAG: u32 = 4;
const GAUSSIAN_FLAG: u32 = 8;

pub struct NoiseJob {
    amount: f32,
    opacity: f32,
    seed: u32,
    monochrome: bool,
    gaussian: bool,
    // Full-source image size (not preview working_size). Needed so the shader
    // can hash in image space — see the module-level doc for why.
    source_size: (u32, u32),
}

/// Reads `noiseEnabled` / `noiseAmount` / `noiseDistribution` / `noiseMonochrome`
/// / `noiseSeed` out of the loose adjustments JSON (same pattern as
/// `gaussian_blur::prepare` / `lens_blur::prepare`).
///
/// `source_size` is the native image resolution; the preview can render at
/// any smaller working_size, but the hash is anchored to source_size so the
/// pattern doesn't "swim" when the user zooms.
pub fn prepare(
    adjustments: &serde_json::Value,
    (w, h): (u32, u32),
    source_size: (u32, u32),
) -> Option<NoiseJob> {
    if !is_effect_enabled(adjustments, "noise", "noiseEnabled") {
        return None;
    }
    if w < 1 || h < 1 {
        return None;
    }
    let amount_percent = adjustments["noiseAmount"].as_f64().unwrap_or(0.0) as f32;
    if amount_percent <= 0.0 {
        return None;
    }
    // Opacity is the second control the user asked for: the noise is
    // generated at `amount` strength, then blended over the original image
    // at `opacity` (0 = original untouched, 1 = full noisy result). Not the
    // same as simply scaling amount — the generated noise clips before the
    // blend, so lowering opacity tames highlights/shadows differently from
    // lowering amount. Defaults to 1.0 so legacy edits (saved with no
    // opacity field in their rrdata sidecar) keep their old look.
    let opacity = (adjustments["noiseOpacity"].as_f64().unwrap_or(100.0) as f32 / 100.0)
        .clamp(0.0, 1.0);
    if opacity <= 0.0 {
        return None;
    }
    // Photoshop's Add Noise dialog allows 0.1-400%; the UI slider this plugin
    // ships caps at 100% for usability, but the backend tolerates more in
    // case a preset or a future UI revision wants it.
    let amount = (amount_percent / 100.0).clamp(0.0, 4.0);
    // Fixed (not time-based) seed so the live preview doesn't flicker frame
    // to frame — exactly the "stabile Vorschau" requirement from PLAN.md.
    let seed = adjustments["noiseSeed"].as_u64().unwrap_or(1) as u32;
    let monochrome = adjustments["noiseMonochrome"].as_bool().unwrap_or(false);
    let gaussian = adjustments["noiseDistribution"].as_str() == Some("gaussian");
    Some(NoiseJob {
        amount,
        opacity,
        seed,
        monochrome,
        gaussian,
        source_size,
    })
}

pub fn encode(enc: &mut ComputeEncoder, job: &NoiseJob, src: &Slot, dst: &Slot) {
    let mut flags = 0u32;
    if job.monochrome {
        flags |= MONOCHROME_FLAG;
    }
    if job.gaussian {
        flags |= GAUSSIAN_FLAG;
    }
    let grid = Grid {
        radius: job.seed,
        // `channel` is unused by noise_apply — repurpose it as the opacity
        // uniform (f32 bitcast to u32; shader unpacks with `bitcast<f32>`).
        // Zero new uniform-struct fields / bind-group entries this way.
        channel: job.opacity.to_bits(),
        eps: job.amount,
        flags,
        // src is unused by the Common group's own entries (box_h/box_v/
        // area_down/gf_*), so we repurpose it to carry source_size. That
        // lets noise_apply compute an image-space hash coordinate without
        // adding any new uniform slot.
        src: [job.source_size.0, job.source_size.1],
        ..Grid::new(src.size)
    };
    enc.run(
        Group::Common,
        "noise_apply",
        &grid,
        src.size,
        &[&src.view],
        Out::F16(&dst.view),
        Bind::default(),
    );
}
