mod audio;
mod config;
mod documents;
mod llm;
mod overlay;
mod question_detector;
mod screenshot;
mod session;
mod stt;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Default to info-level logs so the user can capture stderr for diagnostics.
    // Override with RUST_LOG=debug for noisier output.
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(session::SessionState::new())
        .invoke_handler(tauri::generate_handler![
            session::start_capture,
            session::stop_capture,
            session::save_config,
            session::load_config,
            session::ask,
            session::ask_with_image,
            documents::read_document,
            screenshot::capture_screen,
            overlay::drag::start_native_drag,
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
