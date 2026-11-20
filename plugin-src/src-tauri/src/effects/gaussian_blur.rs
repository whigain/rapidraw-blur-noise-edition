// Gaussian Blur — Blur Noise Plugin for RapidRAW
//
// Clean-room implementation: no Photoshop code, assets or binaries were used.
// Only the publicly documented, decades-old concept ("weighted average over a
// bell curve", per Adobe's own help pages) was reimplemented, on top of
// RapidRAW's own existing GPU primitives. See ../../../../PLAN.md.
//
// Reuses `ComputeEncoder::run` with the already-registered `Group::Common`
// "box_h"/"box_v" entries (see shaders/compute_common.wgsl) instead of a new
// shader: three alternating horizontal/vertical box-blur passes approximate a
// true Gaussian blur closely (Kovesi, "Fast Almost-Gaussian Filtering", 1995)
// and this primitive is already battle-tested inside RapidRAW (Lens Blur's
// guided filter, Fog's bloom all use it via `ComputeEncoder::blur`).
//
// Not pixel-identical to Photoshop's own Gaussian Blur (no reference images
// were compared — see PLAN.md "Rechtliches"), but behaviourally equivalent:
// a radius in pixels, clamp-to-edge border handling (inherited from
// `box_pass` in compute_common.wgsl), separable two-pass convolution.

use crate::render::adjustment_utils::is_effect_enabled;
use crate::render::gpu::compute::{Bind, ComputeEncoder, Grid, Group, Out, Slot, Tex};

const MAX_RADIUS_PX: f32 = 300.0;
const BOX_PASSES: u32 = 3;

pub struct GaussianBlurJob {
    radius: u32,
}

/// Reads `gaussianBlurEnabled` / `gaussianBlurRadius` straight out of the loose
/// adjustments JSON — same pattern as `effects::lens_blur::prepare`. No strict
/// Rust struct is needed on this path (see PLAN.md "Architektur-Erkenntnisse",
/// point 2): the export pipeline already threads the whole `serde_json::Value`
/// through, so a brand-new field here needs no change to any other struct.
pub fn prepare(adjustments: &serde_json::Value, (w, h): (u32, u32)) -> Option<GaussianBlurJob> {
    if !is_effect_enabled(adjustments, "gaussianBlur", "gaussianBlurEnabled") {
        return None;
    }
    if w < 2 || h < 2 {
        return None;
    }
    let ui_radius = adjustments["gaussianBlurRadius"].as_f64().unwrap_or(0.0) as f32;
    if ui_radius <= 0.0 {
        return None;
    }
    let radius = ui_radius.round().clamp(1.0, MAX_RADIUS_PX) as u32;
    Some(GaussianBlurJob { radius })
}

pub fn encode(enc: &mut ComputeEncoder, job: &GaussianBlurJob, src: &Slot, dst: &Slot) {
    let size = src.size;
    let grid = Grid {
        radius: job.radius,
        ..Grid::new(size)
    };
    let f32_fmt = wgpu::TextureFormat::Rgba32Float;

    // box_h/box_v (Group::Common, shaders/compute_common.wgsl) always
    // `textureStore` into the `out_f32` binding, no matter which `Out`
    // variant a call site asks for — so every pass here must target an
    // Rgba32Float scratch texture. `dst` is Rgba16Float (IMAGE_FORMAT) and
    // cannot receive a box_v write directly (binding/format mismatch, wgpu
    // silently leaves it at its cleared/black state in a release build
    // instead of a loud validation error). `blit_f16` does the one needed
    // f32 -> f16 conversion as an explicit final step.
    let mut prev: Option<Tex> = None;
    for _ in 0..BOX_PASSES {
        let h_out = enc.texture("Gaussian Blur H", size, f32_fmt);
        enc.run(
            Group::Common,
            "box_h",
            &grid,
            size,
            &[prev.as_ref().map_or(&src.view, |t| &t.view)],
            Out::F32(&h_out.view),
            Bind::default(),
        );

        let v_out = enc.texture("Gaussian Blur V", size, f32_fmt);
        enc.run(
            Group::Common,
            "box_v",
            &grid,
            size,
            &[&h_out.view],
            Out::F32(&v_out.view),
            Bind::default(),
        );
        prev = Some(v_out);
    }

    let final_tex = prev.expect("BOX_PASSES > 0");
    enc.run(
        Group::Common,
        "blit_f16",
        &grid,
        size,
        &[&final_tex.view],
        Out::F16(&dst.view),
        Bind::default(),
    );
}
