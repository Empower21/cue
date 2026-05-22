//! Screen capture for "answer what's on my screen" flow.
//!
//! Uses xcap (cross-platform: Windows / macOS / Linux). The cue overlay is
//! marked WDA_EXCLUDEFROMCAPTURE on Windows and content-protected on macOS,
//! so OS-level capture APIs do not include the overlay in the screenshot —
//! the user gets the screen behind their assistant.
//!
//! Two commands:
//!   - list_capture_sources: enumerate monitors + open windows AND capture a
//!     small live thumbnail of each, so the user can visually pick what to
//!     capture (mirrors what Chrome's getDisplayMedia picker shows).
//!   - capture_screen(source_id): capture the chosen source at full
//!     resolution and return as base64 PNG.

use base64::Engine;
use image::{ImageBuffer, Rgba, RgbaImage};
use serde::Serialize;
use xcap::{Monitor, Window};

/// A capturable surface — either a monitor or an open window. Source IDs use
/// a typed prefix so the capture function can route without ambiguity.
#[derive(Debug, Serialize)]
pub struct CaptureSource {
    /// "monitor:{id}" or "window:{id}". Treat as opaque on the JS side.
    pub id: String,
    /// "monitor" | "window" — for UI grouping.
    pub kind: String,
    /// Human-readable display name.
    pub label: String,
    /// Pixel width/height at last enumeration. Useful for sorting and as a
    /// proxy for "is this big enough to be worth showing".
    pub width: u32,
    pub height: u32,
    /// True for the primary monitor; false for everything else.
    pub primary: bool,
    /// Base64-encoded PNG of a small live preview. None when capture failed
    /// (e.g., DRM-protected window) — the UI shows a placeholder tile but
    /// still lets the user pick the source.
    pub thumbnail_b64: Option<String>,
}

/// Max edge of the picker thumbnails. 220 keeps the picker readable in cue's
/// 380px-wide window while still being recognisable at a glance.
const THUMBNAIL_MAX_EDGE: u32 = 220;
/// Min window dimension worth showing. Skip taskbar buttons, system tray
/// surfaces, and other tiny windows that just clutter the picker.
const MIN_WINDOW_DIM: u32 = 200;

#[tauri::command]
pub async fn list_capture_sources() -> Result<Vec<CaptureSource>, String> {
    tokio::task::spawn_blocking(enumerate_with_thumbnails)
        .await
        .map_err(|e| format!("task join: {e}"))?
        .map_err(|e| e.to_string())
}

fn enumerate_with_thumbnails() -> anyhow::Result<Vec<CaptureSource>> {
    let mut sources = Vec::new();

    // Monitors first — these are the most common picks.
    for m in Monitor::all()? {
        let id = m.id().to_string();
        let name = m.name().to_string();
        let w = m.width();
        let h = m.height();
        let primary = m.is_primary();
        let label = if primary {
            format!("Entire screen — {name} ({w}×{h})")
        } else {
            format!("Monitor — {name} ({w}×{h})")
        };
        let thumbnail_b64 = m
            .capture_image()
            .ok()
            .and_then(|img| encode_thumbnail(img, THUMBNAIL_MAX_EDGE).ok());
        sources.push(CaptureSource {
            id: format!("monitor:{id}"),
            kind: "monitor".into(),
            label,
            width: w,
            height: h,
            primary,
            thumbnail_b64,
        });
    }

    // Then windows. Filter out empty titles, minimized, tiny, and cue itself.
    for w in Window::all()? {
        let title = w.title().to_string();
        if title.is_empty() {
            continue;
        }
        if w.is_minimized() {
            continue;
        }
        let ww = w.width();
        let wh = w.height();
        if ww < MIN_WINDOW_DIM || wh < MIN_WINDOW_DIM {
            continue;
        }
        let app = w.app_name().to_string();
        if app.eq_ignore_ascii_case("cue") || title.eq_ignore_ascii_case("cue") {
            continue;
        }
        let id = w.id().to_string();
        let label = if app.is_empty() {
            title.clone()
        } else {
            format!("{title} — {app}")
        };
        let thumbnail_b64 = w
            .capture_image()
            .ok()
            .and_then(|img| encode_thumbnail(img, THUMBNAIL_MAX_EDGE).ok());
        sources.push(CaptureSource {
            id: format!("window:{id}"),
            kind: "window".into(),
            label,
            width: ww,
            height: wh,
            primary: false,
            thumbnail_b64,
        });
    }

    Ok(sources)
}

fn encode_thumbnail(rgba: RgbaImage, max_edge: u32) -> anyhow::Result<String> {
    let (w, h) = (rgba.width(), rgba.height());
    let resized = if w.max(h) > max_edge {
        let scale = max_edge as f32 / w.max(h) as f32;
        let nw = (w as f32 * scale).max(1.0) as u32;
        let nh = (h as f32 * scale).max(1.0) as u32;
        image::imageops::resize(&rgba, nw, nh, image::imageops::FilterType::Triangle)
    } else {
        rgba
    };
    let mut png_bytes: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_bytes);
    image::DynamicImage::ImageRgba8(resized)
        .write_to(&mut cursor, image::ImageFormat::Png)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&png_bytes))
}

/// Returns a base64-encoded PNG of the requested source (or the primary
/// monitor when source_id is None/missing). Image is downscaled if the long
/// edge exceeds 1600px — keeps Anthropic upload size reasonable.
#[tauri::command]
pub async fn capture_screen(source_id: Option<String>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || capture(1600, source_id))
        .await
        .map_err(|e| format!("task join: {e}"))?
        .map_err(|e| e.to_string())
}

fn capture(max_edge: u32, source_id: Option<String>) -> anyhow::Result<String> {
    let rgba = match source_id.as_deref() {
        Some(id) if id.starts_with("monitor:") => capture_monitor_by_id(&id["monitor:".len()..])?,
        Some(id) if id.starts_with("window:") => capture_window_by_id(&id["window:".len()..])?,
        _ => capture_primary_monitor()?,
    };

    let (w, h) = (rgba.width(), rgba.height());
    let resized = if w.max(h) > max_edge {
        let scale = max_edge as f32 / w.max(h) as f32;
        let nw = (w as f32 * scale) as u32;
        let nh = (h as f32 * scale) as u32;
        let buffer: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_raw(w, h, rgba.into_raw())
                .ok_or_else(|| anyhow::anyhow!("xcap returned unexpected buffer dimensions"))?;
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

fn capture_primary_monitor() -> anyhow::Result<RgbaImage> {
    let monitors = Monitor::all()?;
    let target = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| Monitor::all().ok().and_then(|m| m.into_iter().next()))
        .ok_or_else(|| anyhow::anyhow!("no monitor available"))?;
    Ok(target.capture_image()?)
}

fn capture_monitor_by_id(id: &str) -> anyhow::Result<RgbaImage> {
    let target = Monitor::all()?
        .into_iter()
        .find(|m| m.id().to_string() == id)
        .ok_or_else(|| anyhow::anyhow!("monitor id {id} not found"))?;
    Ok(target.capture_image()?)
}

fn capture_window_by_id(id: &str) -> anyhow::Result<RgbaImage> {
    let target = Window::all()?
        .into_iter()
        .find(|w| w.id().to_string() == id)
        .ok_or_else(|| anyhow::anyhow!("window id {id} not found"))?;
    target
        .capture_image()
        .map_err(|e| anyhow::anyhow!("window capture failed: {e}"))
}
