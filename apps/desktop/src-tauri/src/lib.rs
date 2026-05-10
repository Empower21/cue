mod audio;
mod config;
mod llm;
mod overlay;
mod session;
mod stt;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(session::SessionState::new())
        .invoke_handler(tauri::generate_handler![
            session::start_capture,
            session::stop_capture,
            session::save_config,
            session::load_config,
        ])
        .setup(|app| {
            let main = app
                .get_webview_window("main")
                .ok_or_else(|| anyhow::anyhow!("main window missing"))?;

            overlay::window::configure_overlay(&main)?;
            overlay::hotkeys::register_default_hotkey(app.handle())?;

            log::info!("cue starting up");
            Ok(())
        })
        .on_window_event(|window, event| overlay::window::handle_window_event(window, event))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
