//! Native window drag command. Bypasses Tauri's start_dragging() to use the
//! raw Win32 caption-drag protocol (ReleaseCapture + WM_NCLBUTTONDOWN/HTCAPTION),
//! which is the standard idiom for borderless apps on Windows.

#[tauri::command]
pub fn start_native_drag<R: tauri::Runtime>(window: tauri::WebviewWindow<R>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
        use windows::Win32::UI::Input::KeyboardAndMouse::ReleaseCapture;
        use windows::Win32::UI::WindowsAndMessaging::{
            SendMessageW, HTCAPTION, WM_NCLBUTTONDOWN,
        };

        let raw = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = HWND(raw.0 as *mut _);
        if hwnd.0.is_null() {
            return Err("null hwnd".into());
        }

        // The classic borderless-drag dance. ReleaseCapture() drops any current
        // mouse capture (held by WebView2 after the mousedown), then we tell
        // Windows the user pressed on the (virtual) caption — Windows runs its
        // own modal move loop until the user releases the mouse button.
        unsafe {
            let _ = ReleaseCapture();
            SendMessageW(hwnd, WM_NCLBUTTONDOWN, WPARAM(HTCAPTION as usize), LPARAM(0));
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        window.start_dragging().map_err(|e| e.to_string())
    }
}
