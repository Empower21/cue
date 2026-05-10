//! Session lifecycle — start/stop capture, drive STT, emit transcript events.

use crate::audio::{self, AudioCaptureSession, AudioChannel, PcmFrame};
use crate::config;
use crate::llm::TranscriptTurn;
use crate::stt::{self, SttConfig, SttEvent, SttProvider, SttSession};
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::mpsc;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

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
    /// Rolling buffer of recent finalized transcript turns. Read by the `ask`
    /// command (added in T11) to populate `LlmRequest.transcript_window`.
    /// Bounded to TRANSCRIPT_BUFFER_MAX entries so the cache stays warm without
    /// unbounded growth.
    pub transcript_buffer: Arc<Mutex<VecDeque<TranscriptTurn>>>,
}

const TRANSCRIPT_BUFFER_MAX: usize = 10;

// ---------------------------------------------------------------------------
// Tauri event types
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
pub struct AudioSignalEvent {
    pub channel: AudioChannel,
    pub voiced: bool,
    pub timestamp_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum TranscriptEvent {
    Interim { text: String, channel: AudioChannel },
    Final { text: String, channel: AudioChannel, start_ms: u64, end_ms: u64 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn channel_label(c: AudioChannel) -> &'static str {
    match c {
        AudioChannel::Mic => "you",
        AudioChannel::System => "them",
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_capture<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    // Check already-running without holding the lock across any await.
    {
        let guard = state.inner.lock();
        if guard.is_some() {
            return Err("capture already running".into());
        }
    } // guard dropped here

    let cfg = config::load().map_err(|e| e.to_string())?;
    let api_key = cfg
        .deepgram_api_key
        .ok_or_else(|| "Deepgram API key not set in Settings".to_string())?;

    // Open two STT sessions, one per channel.
    let provider = stt::deepgram::DeepgramProvider;
    let mut mic_session = provider
        .open(AudioChannel::Mic, SttConfig::deepgram_default(api_key.clone()))
        .await
        .map_err(|e| e.to_string())?;
    let mut sys_session = provider
        .open(AudioChannel::System, SttConfig::deepgram_default(api_key))
        .await
        .map_err(|e| e.to_string())?;

    let mic_events = mic_session.events();
    let sys_events = sys_session.events();

    // Start audio capture.
    let mut capture = audio::default_session().map_err(|e| e.to_string())?;
    let (audio_tx, mut audio_rx) = mpsc::channel::<PcmFrame>(256);
    capture.start(audio_tx).await.map_err(|e| e.to_string())?;

    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

    // Use per-channel mpsc senders to hand voiced frames to STT sessions.
    // This avoids holding any lock across the async submit() call.
    let (mic_frame_tx, mut mic_frame_rx) = mpsc::channel::<Vec<i16>>(256);
    let (sys_frame_tx, mut sys_frame_rx) = mpsc::channel::<Vec<i16>>(256);

    // Audio dispatcher: voiced frames → per-channel sender, signal events → UI.
    // No mutex is held across any await point here.
    let app_handle = app.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(frame) = audio_rx.recv() => {
                    let _ = app_handle.emit("audio_signal", AudioSignalEvent {
                        channel: frame.channel,
                        voiced: frame.voiced,
                        timestamp_ms: frame.timestamp_ms,
                    });
                    if frame.voiced {
                        let tx = match frame.channel {
                            AudioChannel::Mic => &mic_frame_tx,
                            AudioChannel::System => &sys_frame_tx,
                        };
                        // try_send — drop frame if channel is full (back-pressure).
                        let _ = tx.try_send(frame.samples);
                    }
                }
                _ = &mut cancel_rx => break,
                else => break,
            }
        }
        log::info!("audio dispatcher exiting");
    });

    // Per-channel STT pumps: receive raw PCM and call submit() — no lock held.
    tokio::spawn(async move {
        while let Some(samples) = mic_frame_rx.recv().await {
            if let Err(e) = mic_session.submit(&samples).await {
                log::warn!("mic stt submit failed: {e}");
            }
        }
        log::info!("mic STT pump exiting");
    });
    tokio::spawn(async move {
        while let Some(samples) = sys_frame_rx.recv().await {
            if let Err(e) = sys_session.submit(&samples).await {
                log::warn!("sys stt submit failed: {e}");
            }
        }
        log::info!("sys STT pump exiting");
    });

    // Transcript buffer for LLM context (L3 cache tier). Both forwarders
    // write to this when a Final event arrives.
    let transcript_buffer: Arc<Mutex<VecDeque<TranscriptTurn>>> =
        Arc::new(Mutex::new(VecDeque::with_capacity(TRANSCRIPT_BUFFER_MAX)));

    // Forward STT events to the frontend AND maintain the rolling buffer.
    spawn_stt_forwarder(app.clone(), mic_events, Arc::clone(&transcript_buffer));
    spawn_stt_forwarder(app.clone(), sys_events, Arc::clone(&transcript_buffer));

    // Store into state — lock is acquired and immediately released (no await after).
    {
        let mut guard = state.inner.lock();
        *guard = Some(RunningSession {
            capture,
            cancel: cancel_tx,
            transcript_buffer,
        });
    } // guard dropped here

    log::info!("session started (audio + dual-channel STT)");
    Ok(())
}

/// Spawns a task that forwards STT events to the Tauri frontend and maintains
/// the rolling transcript buffer. This function itself is not async — the
/// parking_lot lock is never held across an await.
fn spawn_stt_forwarder<R: Runtime>(
    app: AppHandle<R>,
    mut rx: mpsc::Receiver<SttEvent>,
    buffer: Arc<Mutex<VecDeque<TranscriptTurn>>>,
) {
    tokio::spawn(async move {
        while let Some(ev) = rx.recv().await {
            match ev {
                SttEvent::Interim { text, channel } => {
                    let _ = app.emit("transcript_event", TranscriptEvent::Interim { text, channel });
                }
                SttEvent::Final { text, channel, start_ms, end_ms } => {
                    // Append to rolling buffer. Lock is scoped so it's dropped
                    // before the following emit (which is not async but let's
                    // keep the pattern consistent).
                    {
                        let mut buf = buffer.lock();
                        buf.push_back(TranscriptTurn {
                            channel: channel_label(channel).to_string(),
                            text: text.clone(),
                        });
                        while buf.len() > TRANSCRIPT_BUFFER_MAX {
                            buf.pop_front();
                        }
                    } // buf guard dropped here — before any further work
                    let _ = app.emit(
                        "transcript_event",
                        TranscriptEvent::Final { text, channel, start_ms, end_ms },
                    );
                }
                SttEvent::Error { reason, channel } => {
                    log::warn!("stt error ({:?}): {reason}", channel);
                }
                SttEvent::Closed { channel } => {
                    log::info!("stt closed ({:?})", channel);
                    break;
                }
            }
        }
    });
}

#[tauri::command]
pub async fn stop_capture(state: State<'_, SessionState>) -> Result<(), String> {
    // Take the session without holding the lock across the async stop() call.
    let session = {
        let mut guard = state.inner.lock();
        guard.take()
    }; // guard dropped here

    let Some(mut s) = session else {
        return Ok(());
    };
    let _ = s.cancel.send(());
    s.capture.stop().await.map_err(|e| e.to_string())?;
    log::info!("session stopped");
    Ok(())
}

#[tauri::command]
pub async fn save_config(config: config::Config) -> Result<(), String> {
    config::save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_config() -> Result<config::Config, String> {
    config::load().map_err(|e| e.to_string())
}
