//! Screen capture for "answer what's on my screen" flow.
//!
//! Uses xcap (cross-platform: Windows / macOS / Linux). The cue overlay is
//! marked WDA_EXCLUDEFROMCAPTURE on Windows and content-protected on macOS,
//! so OS-level capture APIs do not include the overlay in the screenshot —
//! the user gets the screen behind their assistant.
//!
//! Two commands:
//!   - list_capture_sources: enumerate monitors + open windows so the user can
//!     pick what to capture (mirrors the browser's getDisplayMedia picker).
//!   - capture_screen(source_id): capture the specified monitor or window.
//!     A None / missing source falls back to the primary monitor.

use base64::Engine;
use image::{ImageBuffer, Rgba};
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
    /// Pixel width/height (monitors only — windows can change size, we report
    /// last-known dimensions for the picker).
    pub width: u32,
    pub height: u32,
    /// True for the primary monitor; false for everything else.
    pub primary: bool,
}

#[tauri::command]
pub async fn list_capture_sources() -> Result<Vec<CaptureSource>, String> {
    tokio::task::spawn_blocking(enumerate)
        .await
        .map_err(|e| format!("task join: {e}"))?
        .map_err(|e| e.to_string())
}

fn enumerate() -> anyhow::Result<Vec<CaptureSource>> {
    let mut sources = Vec::new();

    // Monitors first — these are the most common picks (Entire Screen / Screen 2).
    for m in Monitor::all()? {
        // xcap 0.0.14: id(), name(), width(), height() return primitives,
        // is_primary() returns bool.
        let id = m.id().to_string();
        let name = m.name().to_string();
        let label = if m.is_primary() {
            format!("Primary monitor — {name} ({}×{})", m.width(), m.height())
        } else {
            format!("Monitor — {name} ({}×{})", m.width(), m.height())
        };
        sources.push(CaptureSource {
            id: format!("monitor:{id}"),
            kind: "monitor".into(),
            label,
            width: m.width(),
            height: m.height(),
            primary: m.is_primary(),
        });
    }

    // Then windows. Filter out empty titles, our own cue window, and obvious
    // system surfaces that aren't useful pick targets.
    for w in Window::all()? {
        let title = w.title().to_string();
        if title.is_empty() {
            continue;
        }
        if w.is_minimized() {
            continue;
        }
        // Hide cue's own window — capturing yourself is rarely what you want.
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
        sources.push(CaptureSource {
            id: format!("window:{id}"),
            kind: "window".into(),
            label,
            width: w.width(),
            height: w.height(),
            primary: false,
        });
    }

    Ok(sources)
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

fn capture_primary_monitor() -> anyhow::Result<image::RgbaImage> {
    let monitors = Monitor::all()?;
    let target = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| Monitor::all().ok().and_then(|m| m.into_iter().next()))
        .ok_or_else(|| anyhow::anyhow!("no monitor available"))?;
    Ok(target.capture_image()?)
}

fn capture_monitor_by_id(id: &str) -> anyhow::Result<image::RgbaImage> {
    let target = Monitor::all()?
        .into_iter()
        .find(|m| m.id().to_string() == id)
        .ok_or_else(|| anyhow::anyhow!("monitor id {id} not found"))?;
    Ok(target.capture_image()?)
}

fn capture_window_by_id(id: &str) -> anyhow::Result<image::RgbaImage> {
    let target = Window::all()?
        .into_iter()
        .find(|w| w.id().to_string() == id)
        .ok_or_else(|| anyhow::anyhow!("window id {id} not found"))?;
    // Some windows return errors on capture (DRM-protected content, hidden
    // windows). Surface that as a clean message.
    target
        .capture_image()
        .map_err(|e| anyhow::anyhow!("window capture failed: {e}"))
}
