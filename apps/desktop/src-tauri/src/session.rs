//! Session lifecycle — start/stop capture, drive STT, emit transcript events.

use crate::audio::{self, AudioCaptureSession, AudioChannel, PcmFrame};
use crate::config;
use crate::llm::TranscriptTurn;
use crate::stt::{self, SttConfig, SttEvent, SttProvider};
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
    /// Guards the async gap in `start_capture` between the "already running"
    /// check and the state write. Without it, two concurrent start calls both
    /// pass the check, open duplicate Deepgram sessions + audio streams, and
    /// the loser's session leaks unreachable.
    starting: Arc<std::sync::atomic::AtomicBool>,
    /// In-flight `ask`/`ask_with_image` slot. Generation-counted: a finished
    /// task only clears the slot if it still OWNS it. The old design cleared
    /// unconditionally, so a slow task finishing late could wipe a NEWER
    /// task's abort handle — after which nothing could abort that newer
    /// stream and a third ask would produce two concurrent token streams
    /// (interleaved garbage in one answer card).
    active_ask: Arc<Mutex<AskSlot>>,
}

#[derive(Default)]
pub struct AskSlot {
    gen: u64,
    handle: Option<tokio::task::AbortHandle>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
            starting: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            active_ask: Arc::new(Mutex::new(AskSlot::default())),
        }
    }

    /// Abort any in-flight ask BEFORE spawning the replacement, and claim a
    /// new generation. Aborting first (rather than after spawn, as before)
    /// closes the window where old and new tasks streamed concurrently.
    pub fn begin_ask(&self) -> u64 {
        let mut slot = self.active_ask.lock();
        if let Some(prev) = slot.handle.take() {
            prev.abort();
        }
        slot.gen += 1;
        slot.gen
    }

    /// Store the freshly spawned task's abort handle — unless a newer ask
    /// already claimed the slot, in which case this task is stale: abort it.
    pub fn store_ask(&self, gen: u64, handle: tokio::task::AbortHandle) {
        let mut slot = self.active_ask.lock();
        if slot.gen == gen {
            slot.handle = Some(handle);
        } else {
            handle.abort();
        }
    }
}

/// Called by the ask task itself on natural completion. Clears the slot only
/// if this task's generation still owns it.
fn finish_ask(slot: &Mutex<AskSlot>, gen: u64) {
    let mut s = slot.lock();
    if s.gen == gen {
        s.handle = None;
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
    /// Every task spawned for this session (dispatcher, STT pumps,
    /// forwarders). Aborted in stop_capture so a stop→start cycle can never
    /// leave ghost tasks emitting transcript events into the new session.
    tasks: Vec<tokio::task::JoinHandle<()>>,
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
    use std::sync::atomic::{AtomicBool, Ordering};
    // Claim the "starting" flag FIRST — this closes the TOCTOU gap where two
    // concurrent start calls both see inner==None, then both open Deepgram
    // sessions + audio streams and race to the state write (loser leaks).
    if state.starting.swap(true, Ordering::SeqCst) {
        return Err("capture already starting".into());
    }
    // RAII: clear the flag on every exit path (error or success). On success
    // `inner` is Some before the guard drops, so the is_some() check below
    // takes over as the gate.
    struct ClearOnDrop(Arc<AtomicBool>);
    impl Drop for ClearOnDrop {
        fn drop(&mut self) {
            self.0.store(false, Ordering::SeqCst);
        }
    }
    let _starting_guard = ClearOnDrop(Arc::clone(&state.starting));

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
        .clone()
        .ok_or_else(|| "Deepgram API key not set in Settings".to_string())?;
    let lang = cfg.language.clone().unwrap_or_else(|| "en".into());

    // Open two STT sessions, one per channel.
    let provider = stt::deepgram::DeepgramProvider;
    let mut mic_session = provider
        .open(
            AudioChannel::Mic,
            SttConfig::deepgram_default(api_key.clone()).with_language(&lang),
        )
        .await
        .map_err(|e| e.to_string())?;
    let mut sys_session = provider
        .open(
            AudioChannel::System,
            SttConfig::deepgram_default(api_key).with_language(&lang),
        )
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
    let dispatcher_task = tokio::spawn(async move {
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
    // On submit error (Deepgram channel closed), break out so we don't flood
    // the log; the WebSocket is dead and won't recover within this pump.
    let mic_pump_task = tokio::spawn(async move {
        while let Some(samples) = mic_frame_rx.recv().await {
            if let Err(e) = mic_session.submit(&samples).await {
                log::warn!("mic stt submit failed, closing pump: {e}");
                break;
            }
        }
        log::info!("mic STT pump exiting");
    });
    let sys_pump_task = tokio::spawn(async move {
        while let Some(samples) = sys_frame_rx.recv().await {
            if let Err(e) = sys_session.submit(&samples).await {
                log::warn!("sys stt submit failed, closing pump: {e}");
                break;
            }
        }
        log::info!("sys STT pump exiting");
    });

    // Transcript buffer for LLM context (L3 cache tier). Both forwarders
    // write to this when a Final event arrives.
    let transcript_buffer: Arc<Mutex<VecDeque<TranscriptTurn>>> =
        Arc::new(Mutex::new(VecDeque::with_capacity(TRANSCRIPT_BUFFER_MAX)));

    // Forward STT events to the frontend AND maintain the rolling buffer.
    let mic_fwd_task =
        spawn_stt_forwarder(app.clone(), mic_events, Arc::clone(&transcript_buffer));
    let sys_fwd_task =
        spawn_stt_forwarder(app.clone(), sys_events, Arc::clone(&transcript_buffer));

    // Store into state — lock is acquired and immediately released (no await after).
    {
        let mut guard = state.inner.lock();
        *guard = Some(RunningSession {
            capture,
            cancel: cancel_tx,
            transcript_buffer,
            tasks: vec![
                dispatcher_task,
                mic_pump_task,
                sys_pump_task,
                mic_fwd_task,
                sys_fwd_task,
            ],
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
) -> tokio::task::JoinHandle<()> {
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
    })
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
    let stop_result = s.capture.stop().await.map_err(|e| e.to_string());
    // Belt and braces: the cancel→drop cascade tears the tasks down on its
    // own, but abort() makes it immediate so a quick stop→start can never
    // race ghost tasks from the old session into the new transcript.
    for task in s.tasks {
        task.abort();
    }
    stop_result?;
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

// ---------------------------------------------------------------------------
// T11: ask command + Anthropic-with-HF-fallback orchestrator
// ---------------------------------------------------------------------------

use crate::llm::{
    anthropic::AnthropicProvider, huggingface::HuggingFaceProvider, LlmEvent, LlmProvider,
    LlmRequest, Mode,
};

// Compile-time defaults (option_env! = None if unset, no build failure). This
// lets us ship MSI binaries WITHOUT baking any key — public redistribution-safe.
// At runtime we look in this order:
//   1. ~/.cue/config.toml override (the user's own paste from Settings)
//   2. process env var (ANTHROPIC_API_KEY / HUGGINGFACE_TOKEN — local dev)
//   3. option_env! bake-in (CUE_ANTHROPIC_KEY / CUE_HF_TOKEN — deployer opt-in)
//   4. empty string → API call returns 401 → UI surfaces "key needed" error
const BUILD_ANTHROPIC_KEY: Option<&str> = option_env!("CUE_ANTHROPIC_KEY");
const BUILD_HF_TOKEN: Option<&str> = option_env!("CUE_HF_TOKEN");

fn resolve_anthropic_key(cfg_override: Option<&str>) -> String {
    cfg_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok().filter(|s| !s.is_empty()))
        .or_else(|| BUILD_ANTHROPIC_KEY.filter(|s| !s.is_empty()).map(ToString::to_string))
        .unwrap_or_default()
}

fn resolve_hf_token() -> String {
    std::env::var("HUGGINGFACE_TOKEN")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| BUILD_HF_TOKEN.filter(|s| !s.is_empty()).map(ToString::to_string))
        .unwrap_or_default()
}

/// First-token timeout for the text `ask` path. Anthropic usually sends within
/// 2-4s; if 8s pass with nothing the request is almost certainly stuck.
const FALLBACK_TIMEOUT_MS: u64 = 8_000;
/// Vision calls (`ask_with_image`) need a longer leash — the model spends real
/// time tokenising the image before producing the first text token. 20s is the
/// empirical threshold where "still working" becomes "genuinely stuck".
const VISION_FALLBACK_TIMEOUT_MS: u64 = 20_000;

#[derive(Clone, Serialize)]
pub struct AnswerEvent {
    pub kind: String, // "token" | "done" | "error" | "fallback"
    pub text: Option<String>,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn ask<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SessionState>,
    mode: String,
    trigger: String,
) -> Result<(), String> {
    let cfg = config::load().map_err(|e| e.to_string())?;
    let mode_enum = match mode.as_str() {
        "interview" => Mode::Interview,
        "study" => Mode::Study,
        _ => Mode::Meeting,
    };

    // Read the rolling transcript buffer (last ~10 turns) for L3 cache tier.
    // Lock is scoped into a non-async block — never held across an .await.
    let transcript_window: Vec<TranscriptTurn> = {
        match state.inner.lock().as_ref() {
            Some(s) => s.transcript_buffer.lock().iter().cloned().collect(),
            None => Vec::new(),
        }
    }; // both guards dropped here

    let request = LlmRequest {
        mode: mode_enum,
        job_description: cfg.job_description.clone(),
        resume: cfg.resume.clone(),
        role_context: cfg.role_context.clone(),
        voice_sample: cfg.voice_sample.clone(),
        language: cfg.language.clone(),
        transcript_window,
        trigger,
        image_b64: None,
    };

    let anthropic_key = resolve_anthropic_key(cfg.anthropic_override_key.as_deref());
    if anthropic_key.is_empty() {
        let _ = app.emit(
            "answer_event",
            AnswerEvent {
                kind: "error".into(),
                text: None,
                reason: Some(
                    "Anthropic API key not configured — open Settings (⚙) and paste your sk-ant-... key, or set ANTHROPIC_API_KEY in your shell env.".into(),
                ),
            },
        );
        return Ok(());
    }
    let primary = AnthropicProvider::new(anthropic_key);

    let app_for_orchestrator = app.clone();
    let request_for_fallback = request.clone();
    let active_for_clear = state.active_ask.clone();

    // Abort the previous ask BEFORE spawning the new one — the old order
    // (spawn, then replace) left a window where both tasks streamed tokens
    // into the same answer card.
    let ask_gen = state.begin_ask();

    let join = tokio::spawn(async move {
        match primary.stream(request).await {
            Ok(rx) => {
                let outcome = forward_stream_with_first_token_timeout(
                    app_for_orchestrator.clone(),
                    rx,
                    std::time::Duration::from_millis(FALLBACK_TIMEOUT_MS),
                )
                .await;
                if matches!(outcome, StreamOutcome::Timeout | StreamOutcome::ImmediateError) {
                    fallback(app_for_orchestrator, request_for_fallback).await;
                }
            }
            Err(e) => {
                log::warn!("Anthropic stream() returned err: {e}");
                fallback(app_for_orchestrator, request_for_fallback).await;
            }
        }
        // Task finished naturally — release the slot, but ONLY if we still
        // own it (a newer ask may have claimed it while we were finishing).
        finish_ask(&active_for_clear, ask_gen);
    });

    state.store_ask(ask_gen, join.abort_handle());

    Ok(())
}

/// What happened to the primary stream — used to decide if we fall back.
enum StreamOutcome {
    /// Stream produced at least one token, then ended (Done or Error).
    /// Whether it ended cleanly or not, we do NOT fall back — we already
    /// served the user something.
    Streamed,
    /// No token arrived within the timeout. Fall back.
    Timeout,
    /// Stream errored before delivering any tokens. Fall back.
    ImmediateError,
}

async fn forward_stream_with_first_token_timeout<R: Runtime>(
    app: AppHandle<R>,
    mut rx: mpsc::Receiver<LlmEvent>,
    first_token_timeout: std::time::Duration,
) -> StreamOutcome {
    // Wait for the first event with a timeout. If we don't see ANY event
    // (token, error, done) within the window, treat as timeout and fall back.
    let first = match tokio::time::timeout(first_token_timeout, rx.recv()).await {
        Ok(Some(ev)) => ev,
        Ok(None) => return StreamOutcome::ImmediateError, // channel closed without events
        Err(_) => return StreamOutcome::Timeout,
    };

    // Handle the first event. If it's an error before any token, fall back.
    let mut delivered_any_token = false;
    match first {
        LlmEvent::Token { text } => {
            delivered_any_token = true;
            let _ = app.emit(
                "answer_event",
                AnswerEvent { kind: "token".into(), text: Some(text), reason: None },
            );
        }
        LlmEvent::Done { stop_reason, input_tokens, output_tokens } => {
            // Done with zero tokens emitted is a degenerate but legal outcome —
            // treat as a successful empty response, do not fall back.
            let _ = app.emit(
                "answer_event",
                AnswerEvent {
                    kind: "done".into(),
                    text: Some(format!(
                        "stop={stop_reason} in={input_tokens} out={output_tokens}"
                    )),
                    reason: None,
                },
            );
            return StreamOutcome::Streamed;
        }
        LlmEvent::Error { reason } => {
            let _ = app.emit(
                "answer_event",
                AnswerEvent { kind: "error".into(), text: None, reason: Some(reason) },
            );
            return StreamOutcome::ImmediateError;
        }
    }

    // Keep forwarding the rest of the stream (no further timeout applies — once
    // the stream is producing tokens we let it run to completion).
    while let Some(ev) = rx.recv().await {
        match ev {
            LlmEvent::Token { text } => {
                delivered_any_token = true;
                let _ = app.emit(
                    "answer_event",
                    AnswerEvent { kind: "token".into(), text: Some(text), reason: None },
                );
            }
            LlmEvent::Done { stop_reason, input_tokens, output_tokens } => {
                let _ = app.emit(
                    "answer_event",
                    AnswerEvent {
                        kind: "done".into(),
                        text: Some(format!(
                            "stop={stop_reason} in={input_tokens} out={output_tokens}"
                        )),
                        reason: None,
                    },
                );
                return StreamOutcome::Streamed;
            }
            LlmEvent::Error { reason } => {
                let _ = app.emit(
                    "answer_event",
                    AnswerEvent { kind: "error".into(), text: None, reason: Some(reason) },
                );
                // Mid-stream error — already showed user partial content, do not
                // restart with fallback (would produce duplicate output).
                return StreamOutcome::Streamed;
            }
        }
    }

    if delivered_any_token { StreamOutcome::Streamed } else { StreamOutcome::ImmediateError }
}

/// Forward every remaining event from `rx` to the frontend verbatim.
async fn forward_stream<R: Runtime>(app: AppHandle<R>, mut rx: mpsc::Receiver<LlmEvent>) {
    while let Some(ev) = rx.recv().await {
        match ev {
            LlmEvent::Token { text } => {
                let _ = app.emit(
                    "answer_event",
                    AnswerEvent { kind: "token".into(), text: Some(text), reason: None },
                );
            }
            LlmEvent::Done { stop_reason, input_tokens, output_tokens } => {
                let _ = app.emit(
                    "answer_event",
                    AnswerEvent {
                        kind: "done".into(),
                        text: Some(format!(
                            "stop={stop_reason} in={input_tokens} out={output_tokens}"
                        )),
                        reason: None,
                    },
                );
                return;
            }
            LlmEvent::Error { reason } => {
                let _ = app.emit(
                    "answer_event",
                    AnswerEvent { kind: "error".into(), text: None, reason: Some(reason) },
                );
                return;
            }
        }
    }
}

/// Screenshot-driven vision request. Mirrors `ask` but ships an image_b64 to
/// Anthropic. Falls back to Mistral text-only with a note that the screenshot
/// could not be analysed (HF Mistral has no vision).
#[tauri::command]
pub async fn ask_with_image<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SessionState>,
    mode: String,
    trigger: String,
    image_b64: String,
) -> Result<(), String> {
    let cfg = config::load().map_err(|e| e.to_string())?;
    let mode_enum = match mode.as_str() {
        "interview" => Mode::Interview,
        "study" => Mode::Study,
        _ => Mode::Meeting,
    };

    let transcript_window: Vec<TranscriptTurn> = {
        match state.inner.lock().as_ref() {
            Some(s) => s.transcript_buffer.lock().iter().cloned().collect(),
            None => Vec::new(),
        }
    };

    let request = LlmRequest {
        mode: mode_enum,
        job_description: cfg.job_description.clone(),
        resume: cfg.resume.clone(),
        role_context: cfg.role_context.clone(),
        voice_sample: cfg.voice_sample.clone(),
        language: cfg.language.clone(),
        transcript_window,
        trigger,
        image_b64: Some(image_b64),
    };

    let anthropic_key = resolve_anthropic_key(cfg.anthropic_override_key.as_deref());
    if anthropic_key.is_empty() {
        let _ = app.emit(
            "answer_event",
            AnswerEvent {
                kind: "error".into(),
                text: None,
                reason: Some(
                    "Anthropic API key not configured — open Settings (⚙) and paste your sk-ant-... key. Vision requires a real key (the HuggingFace fallback can't read images).".into(),
                ),
            },
        );
        return Ok(());
    }
    let primary = AnthropicProvider::new(anthropic_key);

    let app_for_orchestrator = app.clone();
    let request_for_fallback = request.clone();
    let active_for_clear = state.active_ask.clone();

    // Same abort-before-spawn ordering as `ask` — see comment there.
    let ask_gen = state.begin_ask();

    let join = tokio::spawn(async move {
        match primary.stream(request).await {
            Ok(rx) => {
                let outcome = forward_stream_with_first_token_timeout(
                    app_for_orchestrator.clone(),
                    rx,
                    // Vision tokenisation is slow — use the longer timeout so
                    // a working vision call isn't aborted just because it
                    // didn't beat the text-mode 8s budget.
                    std::time::Duration::from_millis(VISION_FALLBACK_TIMEOUT_MS),
                )
                .await;
                if matches!(outcome, StreamOutcome::Timeout | StreamOutcome::ImmediateError) {
                    let mut fallback_req = request_for_fallback;
                    fallback_req.image_b64 = None;
                    fallback_req.trigger = format!(
                        "(Screenshot could not be analysed by the fallback model — answer based on transcript only.) {}",
                        fallback_req.trigger
                    );
                    fallback(app_for_orchestrator, fallback_req).await;
                }
            }
            Err(e) => {
                log::warn!("Anthropic vision stream() returned err: {e}");
                let _ = app_for_orchestrator.emit(
                    "answer_event",
                    AnswerEvent {
                        kind: "error".into(),
                        text: None,
                        reason: Some(format!("Vision call failed: {e}")),
                    },
                );
            }
        }
        finish_ask(&active_for_clear, ask_gen);
    });

    state.store_ask(ask_gen, join.abort_handle());

    Ok(())
}

async fn fallback<R: Runtime>(app: AppHandle<R>, request: LlmRequest) {
    let _ = app.emit(
        "answer_event",
        AnswerEvent {
            kind: "fallback".into(),
            text: Some("Anthropic unavailable — falling back to HuggingFace Mistral-7B".into()),
            reason: None,
        },
    );
    let hf_token = resolve_hf_token();
    if hf_token.is_empty() {
        let _ = app.emit(
            "answer_event",
            AnswerEvent {
                kind: "error".into(),
                text: None,
                reason: Some(
                    "Anthropic stalled and no HuggingFace fallback token is configured. Set HUGGINGFACE_TOKEN in your env, or just rely on Anthropic for now.".into(),
                ),
            },
        );
        return;
    }
    let provider = HuggingFaceProvider::new(hf_token);
    match provider.stream(request).await {
        Ok(rx) => {
            forward_stream(app, rx).await;
        }
        Err(e) => {
            let _ = app.emit(
                "answer_event",
                AnswerEvent {
                    kind: "error".into(),
                    text: None,
                    reason: Some(format!("fallback failed: {e}")),
                },
            );
        }
    }
}
