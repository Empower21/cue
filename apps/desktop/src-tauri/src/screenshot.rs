//! Screen capture for "answer the coding problem on my screen" flow.
//!
//! Uses xcap (cross-platform: Windows / macOS / Linux). The cue overlay is
//! marked WDA_EXCLUDEFROMCAPTURE on Windows and content-protected on macOS,
//! so OS-level capture APIs do not include the overlay in the screenshot —
//! the user gets the screen behind their assistant.

use base64::Engine;
use image::{ImageBuffer, Rgba};
use xcap::Monitor;

/// Returns a base64-encoded PNG of the primary monitor. The image is
/// downscaled if it exceeds `max_edge` on either dimension to keep the
/// Anthropic upload reasonable (vision pricing is per token, ~1 token per
/// 750 pixels at full res).
#[tauri::command]
pub async fn capture_screen() -> Result<String, String> {
    tokio::task::spawn_blocking(|| capture(1600))
        .await
        .map_err(|e| format!("task join: {e}"))?
        .map_err(|e| e.to_string())
}

fn capture(max_edge: u32) -> anyhow::Result<String> {
    let monitors = Monitor::all()?;
    // xcap 0.0.14: is_primary() returns bool directly (not Result).
    let primary = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| Monitor::all().ok().and_then(|m| m.into_iter().next()))
        .ok_or_else(|| anyhow::anyhow!("no monitor available"))?;

    let rgba = primary.capture_image()?;
    let (w, h) = (rgba.width(), rgba.height());
    let resized = if w.max(h) > max_edge {
        let scale = max_edge as f32 / w.max(h) as f32;
        let nw = (w as f32 * scale) as u32;
        let nh = (h as f32 * scale) as u32;
        let buffer: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_raw(w, h, rgba.into_raw()).ok_or_else(|| {
                anyhow::anyhow!("xcap returned unexpected buffer dimensions")
            })?;
        image::imageops::resize(&buffer, nw, nh, image::imageops::FilterType::Triangle)
    } else {
        ImageBuffer::from_raw(w, h, rgba.into_raw())
            .ok_or_else(|| anyhow::anyhow!("xcap returned unexpected buffer dimensions"))?
    };

    let mut png_bytes: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_bytes);
    image::DynamicImage::ImageRgba8(resized)
        .write_to(&mut cursor, image::ImageFormat::Png)?;

    Ok(base64::engine::general_purpose::STANDARD.encode(&png_bytes))
}
