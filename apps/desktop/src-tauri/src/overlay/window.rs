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
fn apply_windows_extended_style<R: Runtime>(window: &WebviewWindow<R>) -> anyhow::Result<()> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
    };

    let hwnd = HWND(window.hwnd()?.0 as *mut _);
    if hwnd.0.is_null() {
        anyhow::bail!("hwnd was null");
    }

    // WS_EX_TOOLWINDOW removes the window from the taskbar and Alt-Tab.
    // (skip_taskbar already does this on most builds; we set it explicitly
    // for older Windows 10 versions where Tauri's flag is unreliable.)
    unsafe {
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current | WS_EX_TOOLWINDOW.0 as isize);
    }

    log::info!("Windows extended style applied (WS_EX_TOOLWINDOW)");
    Ok(())
}

pub fn handle_window_event<R: Runtime>(_window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        // Foundation behavior: closing the X button hides instead of quitting.
        // Quit explicitly via the system tray (added in Plan 2) or Cmd+Q.
        api.prevent_close();
    }
}
