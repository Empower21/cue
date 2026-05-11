use tauri::{Runtime, WebviewWindow, Window, WindowEvent};

pub fn configure_overlay<R: Runtime>(window: &WebviewWindow<R>) -> anyhow::Result<()> {
    // Cross-platform: enable content protection so the window is excluded
    // from screen-share on macOS (NSWindow.sharingType = .none) and on
    // Windows (SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)).
    window.set_content_protected(true)?;
    log::info!("content protection enabled (screen-share invisibility)");

    // Always on top, above standard application windows.
    window.set_always_on_top(true)?;

    // Hide from taskbar / dock to reduce visual fingerprint.
    window.set_skip_taskbar(true)?;

    #[cfg(target_os = "macos")]
    apply_macos_collection_behavior(window)?;

    #[cfg(target_os = "windows")]
    apply_windows_extended_style(window)?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_macos_collection_behavior<R: Runtime>(window: &WebviewWindow<R>) -> anyhow::Result<()> {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    let ns_window_ptr = window.ns_window()? as *mut NSWindow;
    if ns_window_ptr.is_null() {
        anyhow::bail!("ns_window pointer was null");
    }

    // Safety: Tauri guarantees the NSWindow is valid for the lifetime of the
    // tauri WebviewWindow. We retain to follow Cocoa ARC conventions.
    let ns_window: Retained<NSWindow> = unsafe { Retained::retain(ns_window_ptr) }
        .ok_or_else(|| anyhow::anyhow!("failed to retain NSWindow"))?;

    let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::IgnoresCycle;

    unsafe {
        ns_window.setCollectionBehavior(behavior);
    }

    log::info!("macOS collection behavior applied");
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_windows_extended_style<R: Runtime>(_window: &WebviewWindow<R>) -> anyhow::Result<()> {
    // WS_EX_TOOLWINDOW was previously applied here, but it breaks caption-drag
    // (WM_NCLBUTTONDOWN/HTCAPTION) on borderless windows because tool windows
    // have non-standard non-client geometry. skipTaskbar in tauri.conf.json
    // already handles taskbar + Alt-Tab hiding on modern Windows.
    log::info!("Windows extended style: WS_EX_TOOLWINDOW intentionally skipped (drag compatibility)");
    Ok(())
}

pub fn handle_window_event<R: Runtime>(_window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        // Foundation behavior: closing the X button hides instead of quitting.
        // Quit explicitly via the system tray (added in Plan 2) or Cmd+Q.
        api.prevent_close();
    }
}
