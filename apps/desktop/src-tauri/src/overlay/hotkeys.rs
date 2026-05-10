use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const TOGGLE_SHORTCUT: &str = "CmdOrCtrl+Backslash";

pub fn register_default_hotkey<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    let app_handle = app.clone();
    let shortcut: Shortcut = TOGGLE_SHORTCUT.parse()?;

    app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_overlay_visibility(&app_handle);
        }
    })?;

    log::info!("global shortcut registered: {}", TOGGLE_SHORTCUT);
    Ok(())
}

fn toggle_overlay_visibility<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("toggle requested but main window missing");
        return;
    };

    match window.is_visible() {
        Ok(true) => {
            if let Err(e) = window.hide() {
                log::error!("failed to hide window: {e:?}");
            }
        }
        Ok(false) => {
            if let Err(e) = window.show().and_then(|()| window.set_focus()) {
                log::error!("failed to show window: {e:?}");
            }
        }
        Err(e) => log::error!("is_visible failed: {e:?}"),
    }
}
