//! Session lifecycle — start/stop capture and surface events to the frontend.

use crate::audio::{self, AudioCaptureSession, PcmFrame};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::mpsc;

/// State held by Tauri's manage().
pub struct SessionState {
    inner: Arc<Mutex<Option<RunningSession>>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}

struct RunningSession {
    capture: Box<dyn AudioCaptureSession>,
    cancel: tokio::sync::oneshot::Sender<()>,
}

#[derive(Clone, Serialize)]
pub struct AudioSignalEvent {
    pub channel: audio::AudioChannel,
    pub voiced: bool,
    pub timestamp_ms: u64,
}

#[tauri::command]
pub async fn start_capture<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    // Check already-running without holding the lock across an await.
    {
        let guard = state.inner.lock();
        if guard.is_some() {
            return Err("capture already running".into());
        }
    }

    let mut session = audio::default_session().map_err(|e| e.to_string())?;
    let (tx, mut rx) = mpsc::channel::<PcmFrame>(256);
    session.start(tx).await.map_err(|e| e.to_string())?;

    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

    // Forwarder task: PCM frames -> Tauri event for UI signal indicator.
    // STT submission is added in Task 6.
    let app_handle = app.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(frame) = rx.recv() => {
                    let _ = app_handle.emit("audio_signal", AudioSignalEvent {
                        channel: frame.channel,
                        voiced: frame.voiced,
                        timestamp_ms: frame.timestamp_ms,
                    });
                }
                _ = &mut cancel_rx => break,
                else => break,
            }
        }
        log::info!("audio forwarder task exiting");
    });

    {
        let mut guard = state.inner.lock();
        *guard = Some(RunningSession {
            capture: session,
            cancel: cancel_tx,
        });
    }
    log::info!("session started");
    Ok(())
}

#[tauri::command]
pub async fn stop_capture(state: State<'_, SessionState>) -> Result<(), String> {
    let session = {
        let mut guard = state.inner.lock();
        guard.take()
    };
    let Some(mut s) = session else {
        return Ok(());
    };
    let _ = s.cancel.send(());
    s.capture.stop().await.map_err(|e| e.to_string())?;
    log::info!("session stopped");
    Ok(())
}
