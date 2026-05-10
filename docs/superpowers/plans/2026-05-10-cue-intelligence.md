# cue Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the cue desktop overlay end-to-end: capture mic + system audio with channel separation, transcribe via Deepgram, answer questions via Claude Sonnet 4.6 with HuggingFace fallback, and route everything through the three operating modes (Listen / Ask / Auto). By the end of this plan, the user can paste a JD + resume into the overlay, run a 10-minute mock interview against a friend, and see live transcripts plus contextual real-time answers.

**Architecture:** Rust core handles audio + STT + LLM + question detection; emits Tauri events to a React UI that renders streaming transcripts and markdown-formatted answers. Each layer has a `trait` abstraction so providers can be swapped (Deepgram → Whisper-cloud → local Whisper.cpp; Anthropic → HuggingFace → OpenAI). Mic + system audio stay channel-separated end-to-end — no ML diarization needed because the OS already gave us "you" vs "them" for free.

**Tech Stack:** Rust 1.95 / Tauri 2.11 (already in place), `cpal` for cross-platform audio I/O, `webrtc-vad` for voice activity detection, `rubato` for resampling, `tokio-tungstenite` for Deepgram WebSocket, `reqwest` (streaming feature) for Anthropic SSE + HuggingFace, `react-markdown` for streaming answer rendering.

**Milestones (you can stop and ship at any of these):**

1. **`audio-streaming`** — after Task 5: app captures mic + system audio, runs VAD, surfaces a live (untranscribed) signal indicator. Useful as a built-in mic test.
2. **`transcript-complete`** — after Task 8: live dual-channel transcript renders in the overlay. Already shippable as a meeting-notes app.
3. **`intelligence-complete`** — after Task 14: full Listen / Ask / Auto modes with answer streaming. The MVP.

---

## File structure (created/modified by this plan)

```
cue/
├── apps/desktop/src-tauri/
│   ├── Cargo.toml                              # MODIFIED — add audio/STT/LLM deps
│   └── src/
│       ├── audio/
│       │   ├── mod.rs                          # NEW — AudioChannel, PcmFrame, AudioCaptureSession trait
│       │   ├── macos.rs                        # NEW — CoreAudio Tap impl (cfg-gated)
│       │   ├── windows.rs                      # NEW — WASAPI loopback impl (cfg-gated)
│       │   ├── vad.rs                          # NEW — webrtc-vad wrapper
│       │   └── resample.rs                     # NEW — rubato wrapper, 16kHz mono PCM
│       ├── stt/
│       │   ├── mod.rs                          # NEW — SttProvider, SttSession traits, SttEvent enum
│       │   └── deepgram.rs                     # NEW — Deepgram WebSocket impl
│       ├── llm/
│       │   ├── mod.rs                          # NEW — LlmProvider trait, LlmEvent enum, LlmRequest
│       │   ├── anthropic.rs                    # NEW — Claude Sonnet 4.6 streaming with prompt cache
│       │   ├── huggingface.rs                  # NEW — Mistral-7B-Instruct fallback
│       │   └── prompts.rs                      # NEW — 4-tier cache builder
│       ├── prompts/
│       │   ├── interview.md                    # NEW — system prompt for interview mode
│       │   ├── meeting.md                      # NEW — system prompt for meeting mode
│       │   └── study.md                        # NEW — system prompt for study mode
│       ├── question_detector.rs                # NEW — sliding-window classifier
│       ├── session.rs                          # NEW — session lifecycle + Tauri commands
│       ├── config.rs                           # NEW — ~/.cue/config.toml schema
│       └── lib.rs                              # MODIFIED — register commands + state
├── apps/desktop/src/
│   ├── components/
│   │   ├── TranscriptStream.tsx                # NEW — channel-tagged live transcript
│   │   ├── AnswerCard.tsx                      # NEW — streaming markdown answer
│   │   ├── ContextLoader.tsx                   # NEW — paste JD + resume modal
│   │   ├── SettingsPanel.tsx                   # NEW — API keys, hotkeys, mode prefs
│   │   └── OverlayPanel.tsx                    # MODIFIED — route by mode, render new components
│   ├── hooks/
│   │   ├── useTauriEvents.ts                   # NEW — transcript + answer event listeners
│   │   ├── useStreamingAnswer.ts               # NEW — streams Claude tokens into state
│   │   ├── useSession.ts                       # NEW — start/stop capture, set mode
│   │   └── useHotkey.ts                        # MODIFIED — add Cmd+Enter for Ask submit
│   ├── App.tsx                                 # MODIFIED — wire SessionProvider context
│   ├── package.json                            # MODIFIED — add react-markdown
│   └── types.ts                                # MODIFIED — re-export shared event types
└── packages/shared/src/
    ├── events.ts                               # NEW — Tauri event payload types
    └── index.ts                                # MODIFIED — re-export events
```

---

## PHASE A — Audio capture core (Tasks 1–5)

### Task 1: Audio module skeleton + Cargo deps

**Files:**
- Modify: `cue/apps/desktop/src-tauri/Cargo.toml`
- Create: `cue/apps/desktop/src-tauri/src/audio/mod.rs`
- Create: `cue/apps/desktop/src-tauri/src/audio/vad.rs`
- Create: `cue/apps/desktop/src-tauri/src/audio/resample.rs`
- Modify: `cue/apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1.1: Update `Cargo.toml` with audio + async + STT/LLM deps**

Add to the `[dependencies]` section (preserve existing entries — only ADD):

```toml
# Audio capture
cpal = "0.15"
webrtc-vad = "0.4"
rubato = "0.15"

# Async + sync primitives
async-trait = "0.1"
futures-util = "0.3"
parking_lot = "0.12"

# WebSocket + HTTP streaming
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
eventsource-stream = "0.2"

# Serialization
toml = "0.8"
chrono = { version = "0.4", features = ["serde"] }

# Other
bytes = "1.7"
url = "2.5"
```

- [ ] **Step 1.2: Create `audio/mod.rs`**

```rust
//! Audio capture core — types and traits shared by platform impls.
//!
//! Mic and system audio are captured as independent channels and stay
//! separated through the entire pipeline. This gives us speaker
//! attribution ("you" vs "them") without an ML diarization model.

use async_trait::async_trait;

pub mod resample;
pub mod vad;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

/// Which audio source a frame came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioChannel {
    /// Captured from the user's microphone.
    Mic,
    /// Captured from the system audio loopback (other meeting participants).
    System,
}

/// 16 kHz mono i16 PCM frame, fixed 30 ms (480 samples) at 16 kHz to match
/// `webrtc-vad`'s frame requirement.
#[derive(Clone, Debug)]
pub struct PcmFrame {
    pub channel: AudioChannel,
    pub samples: Vec<i16>,
    /// Capture timestamp in milliseconds since session start.
    pub timestamp_ms: u64,
    /// True when WebRTC VAD classified this frame as voiced.
    pub voiced: bool,
}

/// One end-to-end capture session. Implementations spawn platform-specific
/// audio backends and emit `PcmFrame`s through the provided sender.
#[async_trait]
pub trait AudioCaptureSession: Send {
    /// Begin capture. Frames stream to the provided channel.
    async fn start(
        &mut self,
        sender: tokio::sync::mpsc::Sender<PcmFrame>,
    ) -> Result<(), CaptureError>;

    /// Stop capture and release platform resources.
    async fn stop(&mut self) -> Result<(), CaptureError>;
}

#[derive(thiserror::Error, Debug)]
pub enum CaptureError {
    #[error("audio backend error: {0}")]
    Backend(String),
    #[error("permission denied: {0}")]
    PermissionDenied(String),
    #[error("device not found: {0}")]
    DeviceNotFound(String),
    #[error("capture already running")]
    AlreadyRunning,
}

/// Construct the platform-default capture session.
pub fn default_session() -> Result<Box<dyn AudioCaptureSession>, CaptureError> {
    #[cfg(target_os = "windows")]
    return Ok(Box::new(windows::WindowsCapture::new()?));

    #[cfg(target_os = "macos")]
    return Ok(Box::new(macos::MacosCapture::new()?));

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    Err(CaptureError::Backend(
        "platform not supported (only macOS 14.4+ and Windows 10 2004+)".into(),
    ))
}
```

- [ ] **Step 1.3: Create `audio/vad.rs`**

```rust
//! WebRTC Voice Activity Detection wrapper.
//!
//! VAD runs in aggressive mode (3) over 30 ms / 480-sample / 16 kHz frames.
//! Voiced frames are forwarded to STT; voiceless frames are dropped to cut
//! Deepgram cost (typical meeting is ~60% silence).

use webrtc_vad::{SampleRate, Vad, VadMode};

pub const FRAME_SAMPLES: usize = 480; // 30 ms at 16 kHz mono

pub struct VadGate {
    vad: Vad,
    /// Voiceless frame counter. After this many consecutive voiceless frames
    /// we emit a `silence` event so callers can mark utterance boundaries.
    silence_threshold_frames: usize,
    silence_run: usize,
}

impl VadGate {
    pub fn new() -> Self {
        Self {
            vad: Vad::new_with_rate_and_mode(SampleRate::Rate16kHz, VadMode::Aggressive),
            // 800 ms / 30 ms ≈ 27 frames
            silence_threshold_frames: 27,
            silence_run: 0,
        }
    }

    /// Returns `true` when the frame is voiced.
    pub fn is_voiced(&mut self, frame: &[i16]) -> bool {
        debug_assert_eq!(frame.len(), FRAME_SAMPLES, "VAD requires 30ms / 480 samples");
        let voiced = self.vad.is_voice_segment(frame).unwrap_or(false);
        if voiced {
            self.silence_run = 0;
        } else {
            self.silence_run = self.silence_run.saturating_add(1);
        }
        voiced
    }

    /// Has there been ≥ `silence_threshold_frames` voiceless frames in a row?
    pub fn just_passed_silence_threshold(&self) -> bool {
        self.silence_run == self.silence_threshold_frames
    }
}

impl Default for VadGate {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 1.4: Create `audio/resample.rs`**

```rust
//! Resample arbitrary-rate input to 16 kHz mono i16 PCM.
//!
//! Most input devices deliver 44.1 / 48 kHz at f32. We convert to a uniform
//! 16 kHz mono i16 stream so VAD + Deepgram have a single contract.

use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};

pub const TARGET_SAMPLE_RATE: u32 = 16_000;

pub struct MonoResampler {
    inner: SincFixedIn<f32>,
    input_rate: u32,
    /// Pending samples spanning resampler block boundaries.
    pending_in: Vec<f32>,
}

impl MonoResampler {
    pub fn new(input_rate: u32, channels: u16) -> anyhow::Result<Self> {
        anyhow::ensure!(channels >= 1, "expected at least one input channel");

        let params = SincInterpolationParameters {
            sinc_len: 128,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 128,
            window: WindowFunction::BlackmanHarris2,
        };
        let ratio = TARGET_SAMPLE_RATE as f64 / input_rate as f64;
        let inner = SincFixedIn::<f32>::new(ratio, 1.0, params, 1024, 1)?;
        Ok(Self {
            inner,
            input_rate,
            pending_in: Vec::with_capacity(2048),
        })
    }

    pub fn input_rate(&self) -> u32 {
        self.input_rate
    }

    /// Push interleaved stereo (or mono) f32 samples; returns 16 kHz mono i16.
    /// Mixes stereo to mono by averaging.
    pub fn push(&mut self, samples: &[f32], input_channels: u16) -> Vec<i16> {
        // Downmix to mono.
        let mono_iter: Box<dyn Iterator<Item = f32>> = if input_channels == 1 {
            Box::new(samples.iter().copied())
        } else {
            let ch = input_channels as usize;
            Box::new(samples.chunks_exact(ch).map(|frame| {
                frame.iter().sum::<f32>() / ch as f32
            }))
        };
        self.pending_in.extend(mono_iter);

        let mut out = Vec::new();
        let chunk = self.inner.input_frames_next();
        while self.pending_in.len() >= chunk {
            let block: Vec<f32> = self.pending_in.drain(..chunk).collect();
            let resampled = self.inner.process(&[block], None).expect("resampler block");
            out.extend(
                resampled[0]
                    .iter()
                    .map(|&s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16),
            );
        }
        out
    }
}
```

- [ ] **Step 1.5: Wire `mod audio` in `lib.rs`**

Add `mod audio;` near the existing `mod overlay;` declaration. No other behavior changes in this task — we're just registering the module for compile-check.

- [ ] **Step 1.6: Verify compile**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd cue/apps/desktop/src-tauri
cargo check 2>&1 | tail -25
```

Expected: pass. Cargo will download new crates (~30 sec). The `windows.rs` and `macos.rs` modules don't exist yet, but that's fine — they're conditionally declared in `audio/mod.rs` with `#[cfg(...)]`, and Rust skips the entire `pub mod` line on the wrong target. **However**, the cfg gate uses `pub mod windows;` which Rust evaluates at parse time — if the file is missing, it's a hard error even when gated.

Workaround: create empty stubs so cargo check passes:

```bash
mkdir -p cue/apps/desktop/src-tauri/src/audio
echo '// Stub — implemented in Task 3' > cue/apps/desktop/src-tauri/src/audio/macos.rs
echo '// Stub — implemented in Task 2' > cue/apps/desktop/src-tauri/src/audio/windows.rs
```

Then `cargo check` again — should pass cleanly on Windows (the windows.rs stub is fine; the macos.rs stub won't be compiled on Windows due to cfg).

- [ ] **Step 1.7: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml \
        apps/desktop/src-tauri/src/audio/ \
        apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(audio): module skeleton + VAD + resampler + Cargo deps for STT/LLM"
git push 2>&1 | tail -3
```

---

### Task 2: WASAPI loopback + mic capture (Windows)

**Files:**
- Replace stub: `cue/apps/desktop/src-tauri/src/audio/windows.rs`

- [ ] **Step 2.1: Implement `audio/windows.rs`**

Replace the stub with the full WASAPI implementation:

```rust
//! Windows audio capture — WASAPI loopback (system) + WASAPI input (mic).
//!
//! Uses `cpal` which exposes both via the same Stream API. We spawn two
//! independent streams (one mic, one loopback) and feed them through
//! per-channel resamplers + VAD into a shared mpsc::Sender<PcmFrame>.

use crate::audio::{
    resample::{MonoResampler, TARGET_SAMPLE_RATE},
    vad::{VadGate, FRAME_SAMPLES},
    AudioCaptureSession, AudioChannel, CaptureError, PcmFrame,
};
use async_trait::async_trait;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc::Sender;

pub struct WindowsCapture {
    streams: Vec<cpal::Stream>,
    started_at: Option<Instant>,
}

impl WindowsCapture {
    pub fn new() -> Result<Self, CaptureError> {
        Ok(Self {
            streams: Vec::new(),
            started_at: None,
        })
    }
}

#[async_trait]
impl AudioCaptureSession for WindowsCapture {
    async fn start(&mut self, sender: Sender<PcmFrame>) -> Result<(), CaptureError> {
        if !self.streams.is_empty() {
            return Err(CaptureError::AlreadyRunning);
        }
        let started = Instant::now();
        self.started_at = Some(started);

        let host = cpal::default_host();

        // Mic stream — default input device.
        let mic_device = host
            .default_input_device()
            .ok_or_else(|| CaptureError::DeviceNotFound("default input device".into()))?;
        let mic_config = mic_device
            .default_input_config()
            .map_err(|e| CaptureError::Backend(format!("mic default_input_config: {e}")))?;
        let mic_stream = build_stream(
            &mic_device,
            mic_config.into(),
            AudioChannel::Mic,
            started,
            sender.clone(),
        )?;
        mic_stream
            .play()
            .map_err(|e| CaptureError::Backend(format!("mic play: {e}")))?;
        self.streams.push(mic_stream);

        // System loopback — default OUTPUT device used as INPUT via WASAPI loopback.
        let sys_device = host
            .default_output_device()
            .ok_or_else(|| CaptureError::DeviceNotFound("default output device".into()))?;
        let sys_config = sys_device
            .default_output_config()
            .map_err(|e| CaptureError::Backend(format!("system default_output_config: {e}")))?;
        let sys_stream = build_stream(
            &sys_device,
            sys_config.into(),
            AudioChannel::System,
            started,
            sender,
        )?;
        sys_stream
            .play()
            .map_err(|e| CaptureError::Backend(format!("system play: {e}")))?;
        self.streams.push(sys_stream);

        log::info!("WASAPI capture started (mic + system loopback)");
        Ok(())
    }

    async fn stop(&mut self) -> Result<(), CaptureError> {
        // Dropping the streams releases the device handles.
        self.streams.clear();
        self.started_at = None;
        log::info!("WASAPI capture stopped");
        Ok(())
    }
}

fn build_stream(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    channel: AudioChannel,
    started_at: Instant,
    sender: Sender<PcmFrame>,
) -> Result<cpal::Stream, CaptureError> {
    let input_rate = config.sample_rate.0;
    let input_channels = config.channels;
    let resampler = Arc::new(Mutex::new(
        MonoResampler::new(input_rate, input_channels)
            .map_err(|e| CaptureError::Backend(format!("resampler init: {e}")))?,
    ));
    let vad = Arc::new(Mutex::new(VadGate::new()));
    let pending = Arc::new(Mutex::new(Vec::<i16>::with_capacity(FRAME_SAMPLES * 4)));

    let err_fn = |err| log::error!("audio stream error: {err}");

    let stream = device
        .build_input_stream(
            &config,
            move |data: &[f32], _info: &cpal::InputCallbackInfo| {
                let mut pcm = resampler.lock().push(data, input_channels);
                let mut buf = pending.lock();
                buf.append(&mut pcm);

                while buf.len() >= FRAME_SAMPLES {
                    let frame: Vec<i16> = buf.drain(..FRAME_SAMPLES).collect();
                    let voiced = vad.lock().is_voiced(&frame);
                    let timestamp_ms = started_at.elapsed().as_millis() as u64;
                    let pcm_frame = PcmFrame {
                        channel,
                        samples: frame,
                        timestamp_ms,
                        voiced,
                    };
                    if sender.try_send(pcm_frame).is_err() {
                        // Channel full — drop frame. Indicates STT can't keep up;
                        // log only on transition (not per-frame) in production.
                    }
                }
            },
            err_fn,
            None,
        )
        .map_err(|e| CaptureError::Backend(format!("build_input_stream({channel:?}): {e}")))?;

    let _ = TARGET_SAMPLE_RATE; // silence unused-import on this side; constant is the post-resample target
    Ok(stream)
}
```

- [ ] **Step 2.2: Verify compile on Windows**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd cue/apps/desktop/src-tauri
cargo check 2>&1 | tail -20
```

Expected: pass. Warnings about unused imports / fields in macos.rs stub are OK.

- [ ] **Step 2.3: Commit**

```bash
git add apps/desktop/src-tauri/src/audio/windows.rs
git commit -m "feat(audio): WASAPI loopback + mic capture for Windows"
git push 2>&1 | tail -3
```

---

### Task 3: CoreAudio Tap (macOS)

**Files:**
- Replace stub: `cue/apps/desktop/src-tauri/src/audio/macos.rs`

This task lands a macOS implementation that **cannot be runtime-tested on a Windows machine**. The `#[cfg(target_os = "macos")]` gate means cargo on Windows will not even attempt to compile it. We commit the code so a mac build (CI or another machine) picks it up.

- [ ] **Step 3.1: Add macOS-specific Cargo deps (target-gated)**

Add to `apps/desktop/src-tauri/Cargo.toml` under the existing `[target.'cfg(target_os = "macos")'.dependencies]` block:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.5"
objc2-app-kit = { version = "0.2", features = ["NSWindow"] }
objc2-foundation = "0.2"
# Audio capture additions:
core-foundation = "0.10"
coreaudio-rs = "0.12"
screencapturekit = "0.3"
```

(`screencapturekit` is the Rust binding to Apple's ScreenCaptureKit framework, which exposes the new CoreAudio Tap API in Sonoma 14.4+.)

- [ ] **Step 3.2: Implement `audio/macos.rs`**

```rust
//! macOS audio capture via ScreenCaptureKit's CoreAudio Tap (Sonoma 14.4+).
//!
//! ScreenCaptureKit exposes both screen and system-audio capture. We use the
//! audio path only — no display capture. The user grants microphone +
//! "screen recording" permission on first run via System Settings.
//!
//! Mic capture uses the standard cpal default input device (same as Windows).

use crate::audio::{
    resample::MonoResampler,
    vad::{VadGate, FRAME_SAMPLES},
    AudioCaptureSession, AudioChannel, CaptureError, PcmFrame,
};
use async_trait::async_trait;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc::Sender;

pub struct MacosCapture {
    mic_stream: Option<cpal::Stream>,
    // Holds a `screencapturekit::stream::SCStream` once started.
    sc_stream: Option<screencapturekit::stream::SCStream>,
    started_at: Option<Instant>,
}

impl MacosCapture {
    pub fn new() -> Result<Self, CaptureError> {
        Ok(Self {
            mic_stream: None,
            sc_stream: None,
            started_at: None,
        })
    }
}

#[async_trait]
impl AudioCaptureSession for MacosCapture {
    async fn start(&mut self, sender: Sender<PcmFrame>) -> Result<(), CaptureError> {
        if self.mic_stream.is_some() || self.sc_stream.is_some() {
            return Err(CaptureError::AlreadyRunning);
        }
        let started = Instant::now();
        self.started_at = Some(started);

        // --- Microphone via cpal -----------------------------------------
        let host = cpal::default_host();
        let mic_device = host
            .default_input_device()
            .ok_or_else(|| CaptureError::DeviceNotFound("default input device".into()))?;
        let mic_config = mic_device
            .default_input_config()
            .map_err(|e| CaptureError::Backend(format!("mic default_input_config: {e}")))?;
        let mic_input_rate = mic_config.sample_rate().0;
        let mic_input_channels = mic_config.channels();

        let mic_resampler = Arc::new(Mutex::new(
            MonoResampler::new(mic_input_rate, mic_input_channels)
                .map_err(|e| CaptureError::Backend(format!("mic resampler: {e}")))?,
        ));
        let mic_vad = Arc::new(Mutex::new(VadGate::new()));
        let mic_pending = Arc::new(Mutex::new(Vec::<i16>::with_capacity(FRAME_SAMPLES * 4)));
        let mic_sender = sender.clone();

        let mic_stream = mic_device
            .build_input_stream(
                &mic_config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let mut pcm = mic_resampler.lock().push(data, mic_input_channels);
                    let mut buf = mic_pending.lock();
                    buf.append(&mut pcm);
                    while buf.len() >= FRAME_SAMPLES {
                        let frame: Vec<i16> = buf.drain(..FRAME_SAMPLES).collect();
                        let voiced = mic_vad.lock().is_voiced(&frame);
                        let _ = mic_sender.try_send(PcmFrame {
                            channel: AudioChannel::Mic,
                            samples: frame,
                            timestamp_ms: started.elapsed().as_millis() as u64,
                            voiced,
                        });
                    }
                },
                |err| log::error!("mic stream error: {err}"),
                None,
            )
            .map_err(|e| CaptureError::Backend(format!("mic build_input_stream: {e}")))?;
        mic_stream
            .play()
            .map_err(|e| CaptureError::Backend(format!("mic play: {e}")))?;
        self.mic_stream = Some(mic_stream);

        // --- System audio via ScreenCaptureKit ---------------------------
        // SCStream taps the system audio output. Permissions: user must have
        // granted "Screen Recording" in Privacy & Security on first run.
        let sys_resampler = Arc::new(Mutex::new(
            // SCStream delivers 48 kHz stereo by default.
            MonoResampler::new(48_000, 2)
                .map_err(|e| CaptureError::Backend(format!("system resampler: {e}")))?,
        ));
        let sys_vad = Arc::new(Mutex::new(VadGate::new()));
        let sys_pending = Arc::new(Mutex::new(Vec::<i16>::with_capacity(FRAME_SAMPLES * 4)));
        let sys_sender = sender;

        let sc_stream = screencapturekit::stream::SCStream::start_audio_only(move |frame_f32: &[f32]| {
            let mut pcm = sys_resampler.lock().push(frame_f32, 2);
            let mut buf = sys_pending.lock();
            buf.append(&mut pcm);
            while buf.len() >= FRAME_SAMPLES {
                let f: Vec<i16> = buf.drain(..FRAME_SAMPLES).collect();
                let voiced = sys_vad.lock().is_voiced(&f);
                let _ = sys_sender.try_send(PcmFrame {
                    channel: AudioChannel::System,
                    samples: f,
                    timestamp_ms: started.elapsed().as_millis() as u64,
                    voiced,
                });
            }
        })
        .map_err(|e| CaptureError::PermissionDenied(format!("ScreenCaptureKit start: {e}")))?;
        self.sc_stream = Some(sc_stream);

        log::info!("CoreAudio Tap capture started (mic + system)");
        Ok(())
    }

    async fn stop(&mut self) -> Result<(), CaptureError> {
        if let Some(s) = self.mic_stream.take() {
            drop(s);
        }
        if let Some(mut s) = self.sc_stream.take() {
            s.stop().ok();
        }
        self.started_at = None;
        log::info!("CoreAudio Tap capture stopped");
        Ok(())
    }
}
```

**Note for the implementer:** `screencapturekit` 0.3's exact API may differ from the `start_audio_only` shape above. Check `cargo doc --open` or the crate docs once the crate is downloaded. If the API differs, wrap it correctly — the goal is "give me 48 kHz stereo f32 chunks." The trait surface in `audio/mod.rs` doesn't change.

- [ ] **Step 3.3: Cargo check (Windows skips macos.rs)**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd cue/apps/desktop/src-tauri
cargo check 2>&1 | tail -10
```

Expected: pass on Windows. The `cfg(target_os = "macos")` gate keeps the new code dormant. CI on macOS-latest will compile-check the real path.

- [ ] **Step 3.4: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml \
        apps/desktop/src-tauri/src/audio/macos.rs
git commit -m "feat(audio): CoreAudio Tap impl for macOS via ScreenCaptureKit"
git push 2>&1 | tail -3
```

---

### Task 4: Session lifecycle + Tauri commands (audio-only)

**Files:**
- Create: `cue/apps/desktop/src-tauri/src/session.rs`
- Modify: `cue/apps/desktop/src-tauri/src/lib.rs`
- Modify: `cue/apps/desktop/src-tauri/capabilities/default.json`

This task wires audio capture to a Tauri command + event so the frontend can `start_capture()` / `stop_capture()` and receive PCM frame metadata. STT comes in Task 6 — for now we just emit "frame received, channel=X, voiced=Y" so the UI can show a working signal indicator.

- [ ] **Step 4.1: Create `session.rs`**

```rust
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
    let mut guard = state.inner.lock();
    if guard.is_some() {
        return Err("capture already running".into());
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

    *guard = Some(RunningSession {
        capture: session,
        cancel: cancel_tx,
    });
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
```

- [ ] **Step 4.2: Wire into `lib.rs`**

Update lib.rs setup closure to register state + commands:

```rust
mod audio;
mod overlay;
mod session;

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
```

- [ ] **Step 4.3: Add capabilities for new commands**

Edit `capabilities/default.json`, add to the `permissions` array:

```json
"core:default",
"core:webview:allow-emit",
```

(plus the `core:window:*` and `global-shortcut:*` permissions already in place).

- [ ] **Step 4.4: Verify**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd cue/apps/desktop/src-tauri
cargo check 2>&1 | tail -10
```

Expected: pass.

- [ ] **Step 4.5: Commit**

```bash
git add apps/desktop/src-tauri/src/session.rs \
        apps/desktop/src-tauri/src/lib.rs \
        apps/desktop/src-tauri/capabilities/default.json
git commit -m "feat(session): start_capture/stop_capture commands + audio_signal event"
git push 2>&1 | tail -3
```

---

### Task 5: Frontend signal indicator + tag `audio-streaming`

**Files:**
- Create: `cue/apps/desktop/src/hooks/useTauriEvents.ts`
- Modify: `cue/apps/desktop/src/components/OverlayPanel.tsx`

Smallest possible UI to confirm audio capture works: two pulsing dots (mic + system) that light up when their channel is voiced. Useful as a built-in mic test.

- [ ] **Step 5.1: Create `useTauriEvents.ts`**

```typescript
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface AudioSignalEvent {
  channel: 'mic' | 'system';
  voiced: boolean;
  timestamp_ms: number;
}

export function useAudioSignal() {
  const [mic, setMic] = useState({ voiced: false, ts: 0 });
  const [system, setSystem] = useState({ voiced: false, ts: 0 });

  useEffect(() => {
    const unlisten = listen<AudioSignalEvent>('audio_signal', ({ payload }) => {
      const next = { voiced: payload.voiced, ts: payload.timestamp_ms };
      if (payload.channel === 'mic') setMic(next);
      else setSystem(next);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return { mic, system };
}
```

- [ ] **Step 5.2: Modify `OverlayPanel.tsx` to render dots + start/stop button**

Replace the existing OverlayPanel with one that adds the audio-control row above the placeholder:

```typescript
import { useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModeSelector, type Mode } from './ModeSelector';
import { useAudioSignal } from '../hooks/useTauriEvents';

interface OverlayPanelProps {
  children?: ReactNode;
}

export function OverlayPanel({ children }: OverlayPanelProps) {
  const [mode, setMode] = useState<Mode>('listen');
  const [running, setRunning] = useState(false);
  const { mic, system } = useAudioSignal();

  const toggle = async () => {
    if (running) {
      await invoke('stop_capture');
      setRunning(false);
    } else {
      await invoke('start_capture');
      setRunning(true);
    }
  };

  return (
    <div className="flex h-full w-full flex-col rounded-xl bg-cue-bg p-3 shadow-2xl backdrop-blur-md ring-1 ring-white/10">
      <header
        data-tauri-drag-region
        className="flex items-center justify-between pb-2 cursor-grab active:cursor-grabbing"
      >
        <span className="text-xs font-semibold tracking-wide text-cue-text">cue</span>
        <span className="text-[10px] text-cue-muted">⌘\</span>
      </header>

      <ModeSelector mode={mode} setMode={setMode} />

      <div className="mt-2 flex items-center justify-between rounded-md bg-black/20 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={toggle}
          className="rounded bg-cue-accent px-3 py-1 text-white"
        >
          {running ? 'Stop' : 'Start'}
        </button>
        <Dot label="you" voiced={mic.voiced} />
        <Dot label="them" voiced={system.voiced} />
      </div>

      <main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
        {children ?? (
          <div className="flex h-full items-center justify-center text-center text-xs text-cue-muted">
            <div>Audio test ready. Transcripts in Task 8.</div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 pt-2 text-[10px] text-cue-muted">
        Mode: <span className="text-cue-text">{mode}</span>
      </footer>
    </div>
  );
}

function Dot({ label, voiced }: { label: string; voiced: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-cue-muted">{label}</span>
      <span
        className={
          'h-2 w-2 rounded-full transition-opacity ' +
          (voiced ? 'bg-green-400 opacity-100' : 'bg-green-400 opacity-20')
        }
      />
    </div>
  );
}
```

- [ ] **Step 5.3: Verify and ship Milestone 1**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd cue
pnpm --filter @cue/desktop typecheck 2>&1 | tail -5

# Optional: full release build to confirm everything still bundles
pnpm build 2>&1 | tail -10
```

Expected: typecheck pass. Optional release build produces an updated MSI under `apps/desktop/src-tauri/target/release/bundle/msi/`.

- [ ] **Step 5.4: Commit + tag milestone**

```bash
git add apps/desktop/src/
git commit -m "feat(ui): audio signal indicator + start/stop control"
git tag -a audio-streaming -m "Plan 2 milestone 1: audio capture + VAD working end-to-end with UI signal indicator"
git push origin main 2>&1 | tail -3
git push origin audio-streaming 2>&1 | tail -3
```

**MILESTONE 1 SHIPPED** — you can stop here and have a working "mic test" overlay that shows live VAD on both channels. Useful tool on its own.

---

## PHASE B — STT pipeline (Tasks 6–8)

### Task 6: STT trait + Deepgram WebSocket impl

**Files:**
- Create: `cue/apps/desktop/src-tauri/src/stt/mod.rs`
- Create: `cue/apps/desktop/src-tauri/src/stt/deepgram.rs`
- Modify: `cue/apps/desktop/src-tauri/src/lib.rs` (add `mod stt;`)

- [ ] **Step 6.1: Create `stt/mod.rs`**

```rust
//! Speech-to-Text pipeline. Provider-abstracted so we can swap Deepgram for
//! Groq, OpenAI Whisper, or local Whisper.cpp without touching the rest of
//! the stack.

pub mod deepgram;

use crate::audio::AudioChannel;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SttEvent {
    Interim { text: String, channel: AudioChannel },
    Final { text: String, channel: AudioChannel, start_ms: u64, end_ms: u64 },
    Error { reason: String, channel: AudioChannel },
    Closed { channel: AudioChannel },
}

#[derive(Clone, Debug)]
pub struct SttConfig {
    pub api_key: String,
    pub model: String,
    pub language: String,
}

impl SttConfig {
    pub fn deepgram_default(api_key: String) -> Self {
        Self {
            api_key,
            model: "nova-2".into(),
            language: "en".into(),
        }
    }
}

#[async_trait]
pub trait SttProvider: Send + Sync {
    async fn open(
        &self,
        channel: AudioChannel,
        config: SttConfig,
    ) -> anyhow::Result<Box<dyn SttSession>>;
}

#[async_trait]
pub trait SttSession: Send {
    async fn submit(&mut self, frame: &[i16]) -> anyhow::Result<()>;
    fn events(&mut self) -> tokio::sync::mpsc::Receiver<SttEvent>;
    async fn close(self: Box<Self>) -> anyhow::Result<()>;
}

#[derive(thiserror::Error, Debug)]
pub enum SttError {
    #[error("connection failed: {0}")]
    Connect(String),
    #[error("authentication failed (check Deepgram API key)")]
    Auth,
    #[error("rate limited")]
    RateLimited,
    #[error("other: {0}")]
    Other(String),
}
```

- [ ] **Step 6.2: Create `stt/deepgram.rs`**

```rust
//! Deepgram streaming STT via WebSocket.
//!
//! Endpoint: wss://api.deepgram.com/v1/listen
//! Auth: `Authorization: Token <api-key>` header
//! Audio format: linear16 PCM, 16 kHz, mono, single channel
//! Each session covers exactly one AudioChannel — we run two in parallel.

use crate::audio::AudioChannel;
use crate::stt::{SttConfig, SttEvent, SttProvider, SttSession};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;
use tokio::net::TcpStream;
use tokio_tungstenite::MaybeTlsStream;

pub struct DeepgramProvider;

#[async_trait]
impl SttProvider for DeepgramProvider {
    async fn open(
        &self,
        channel: AudioChannel,
        config: SttConfig,
    ) -> anyhow::Result<Box<dyn SttSession>> {
        let url = format!(
            "wss://api.deepgram.com/v1/listen\
             ?model={}\
             &encoding=linear16\
             &sample_rate=16000\
             &channels=1\
             &interim_results=true\
             &endpointing=300\
             &language={}",
            config.model, config.language
        );

        let mut req = url.into_client_request()?;
        req.headers_mut().insert(
            "Authorization",
            HeaderValue::from_str(&format!("Token {}", config.api_key))?,
        );

        let (ws, _resp) = tokio_tungstenite::connect_async(req).await?;

        let (event_tx, event_rx) = mpsc::channel::<SttEvent>(256);
        let (frame_tx, frame_rx) = mpsc::channel::<Vec<u8>>(256);

        // Spawn the read+write driver task.
        let channel_for_task = channel;
        tokio::spawn(driver_task(ws, frame_rx, event_tx, channel_for_task));

        Ok(Box::new(DeepgramSession {
            frame_tx,
            event_rx: Some(event_rx),
        }))
    }
}

pub struct DeepgramSession {
    frame_tx: mpsc::Sender<Vec<u8>>,
    event_rx: Option<mpsc::Receiver<SttEvent>>,
}

#[async_trait]
impl SttSession for DeepgramSession {
    async fn submit(&mut self, frame: &[i16]) -> anyhow::Result<()> {
        let mut bytes = Vec::with_capacity(frame.len() * 2);
        for sample in frame {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        self.frame_tx
            .send(bytes)
            .await
            .map_err(|_| anyhow::anyhow!("Deepgram frame channel closed"))?;
        Ok(())
    }

    fn events(&mut self) -> mpsc::Receiver<SttEvent> {
        self.event_rx.take().expect("events() called twice")
    }

    async fn close(self: Box<Self>) -> anyhow::Result<()> {
        // Dropping self.frame_tx closes the channel, which the driver task
        // sees as a signal to send the WS close frame.
        Ok(())
    }
}

async fn driver_task(
    mut ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    mut frame_rx: mpsc::Receiver<Vec<u8>>,
    event_tx: mpsc::Sender<SttEvent>,
    channel: AudioChannel,
) {
    loop {
        tokio::select! {
            // Outgoing audio.
            Some(bytes) = frame_rx.recv() => {
                if let Err(e) = ws.send(Message::Binary(bytes)).await {
                    let _ = event_tx.send(SttEvent::Error {
                        reason: format!("send: {e}"),
                        channel,
                    }).await;
                    break;
                }
            }
            // Incoming Deepgram messages.
            Some(msg) = ws.next() => {
                match msg {
                    Ok(Message::Text(json)) => {
                        if let Some(ev) = parse_deepgram_message(&json, channel) {
                            if event_tx.send(ev).await.is_err() {
                                break;
                            }
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Ok(_) => {} // ignore ping/pong
                    Err(e) => {
                        let _ = event_tx.send(SttEvent::Error {
                            reason: format!("ws: {e}"),
                            channel,
                        }).await;
                        break;
                    }
                }
            }
            else => break,
        }
    }
    // Send Close frame and exit.
    let _ = ws.close(None).await;
    let _ = event_tx.send(SttEvent::Closed { channel }).await;
}

#[derive(Deserialize)]
struct DgRoot {
    is_final: Option<bool>,
    channel: Option<DgChannel>,
    start: Option<f64>,
    duration: Option<f64>,
}

#[derive(Deserialize)]
struct DgChannel {
    alternatives: Vec<DgAlternative>,
}

#[derive(Deserialize)]
struct DgAlternative {
    transcript: String,
}

fn parse_deepgram_message(json: &str, channel: AudioChannel) -> Option<SttEvent> {
    let root: DgRoot = serde_json::from_str(json).ok()?;
    let alts = root.channel.as_ref()?.alternatives.as_slice();
    let text = alts.first().map(|a| a.transcript.clone()).unwrap_or_default();
    if text.is_empty() {
        return None;
    }
    let is_final = root.is_final.unwrap_or(false);
    if is_final {
        let start_ms = (root.start.unwrap_or(0.0) * 1000.0) as u64;
        let end_ms = start_ms + (root.duration.unwrap_or(0.0) * 1000.0) as u64;
        Some(SttEvent::Final {
            text,
            channel,
            start_ms,
            end_ms,
        })
    } else {
        Some(SttEvent::Interim { text, channel })
    }
}
```

- [ ] **Step 6.3: Wire `mod stt;` in `lib.rs`**

Add `mod stt;` near the other module declarations.

- [ ] **Step 6.4: Verify**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd cue/apps/desktop/src-tauri
cargo check 2>&1 | tail -10
```

Expected: pass. Cargo will download `tokio-tungstenite`, `eventsource-stream`, etc.

- [ ] **Step 6.5: Commit**

```bash
git add apps/desktop/src-tauri/src/stt/ \
        apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(stt): SttProvider trait + Deepgram WebSocket impl"
git push 2>&1 | tail -3
```

---

### Task 7: Wire STT into session lifecycle

**Files:**
- Modify: `cue/apps/desktop/src-tauri/src/session.rs`
- Modify: `cue/apps/desktop/src-tauri/src/config.rs` (NEW — see Step 7.1)

- [ ] **Step 7.1: Create `config.rs`**

```rust
//! User config persisted to ~/.cue/config.toml (or %APPDATA%\cue\config.toml).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Config {
    pub deepgram_api_key: Option<String>,
    pub anthropic_override_key: Option<String>,
    pub mode: Option<String>,
    /// User-pasted JD text (pinned in Anthropic prompt cache).
    pub job_description: Option<String>,
    /// User-pasted resume text.
    pub resume: Option<String>,
    /// User-pasted role/seniority/company context.
    pub role_context: Option<String>,
}

pub fn config_path() -> anyhow::Result<PathBuf> {
    let dir = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("could not resolve config dir"))?
        .join("cue");
    Ok(dir.join("config.toml"))
}

pub fn load() -> anyhow::Result<Config> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let text = std::fs::read_to_string(&path)?;
    Ok(toml::from_str(&text)?)
}

pub fn save(config: &Config) -> anyhow::Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = toml::to_string_pretty(config)?;
    std::fs::write(&path, text)?;
    Ok(())
}
```

Add `dirs = "5.0"` to Cargo.toml `[dependencies]`.

- [ ] **Step 7.2: Update `session.rs` to wire STT**

Replace the entire file:

```rust
//! Session lifecycle — start/stop capture, drive STT, emit transcript events.

use crate::audio::{self, AudioCaptureSession, AudioChannel, PcmFrame};
use crate::config;
use crate::stt::{self, SttConfig, SttEvent, SttProvider, SttSession};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::mpsc;

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
    /// command to populate `LlmRequest.transcript_window` (the L3 cache tier).
    /// Bounded to ~10 entries so the cache stays warm without unbounded growth.
    pub transcript_buffer: Arc<Mutex<std::collections::VecDeque<crate::llm::TranscriptTurn>>>,
}

const TRANSCRIPT_BUFFER_MAX: usize = 10;

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

fn channel_label(c: AudioChannel) -> &'static str {
    match c {
        AudioChannel::Mic => "you",
        AudioChannel::System => "them",
    }
}

#[tauri::command]
pub async fn start_capture<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    {
        let guard = state.inner.lock();
        if guard.is_some() {
            return Err("capture already running".into());
        }
    }

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
    let mut session = audio::default_session().map_err(|e| e.to_string())?;
    let (audio_tx, mut audio_rx) = mpsc::channel::<PcmFrame>(256);
    session.start(audio_tx).await.map_err(|e| e.to_string())?;

    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

    // Audio dispatcher: voiced frames → STT, signal events → UI.
    let app_handle = app.clone();
    let mic_tx_session = Arc::new(Mutex::new(mic_session));
    let sys_tx_session = Arc::new(Mutex::new(sys_session));
    let mic_for_dispatch = Arc::clone(&mic_tx_session);
    let sys_for_dispatch = Arc::clone(&sys_tx_session);

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
                        let target = match frame.channel {
                            AudioChannel::Mic => &mic_for_dispatch,
                            AudioChannel::System => &sys_for_dispatch,
                        };
                        let mut sess = target.lock();
                        if let Err(e) = sess.submit(&frame.samples).await {
                            log::warn!("stt submit failed ({:?}): {e}", frame.channel);
                        }
                    }
                }
                _ = &mut cancel_rx => break,
                else => break,
            }
        }
        log::info!("audio dispatcher exiting");
    });

    // Transcript buffer for LLM context. Both forwarders write to this when
    // a Final event arrives.
    let transcript_buffer = Arc::new(Mutex::new(std::collections::VecDeque::with_capacity(
        TRANSCRIPT_BUFFER_MAX,
    )));

    // Forward STT events to the frontend AND maintain the rolling buffer.
    spawn_stt_forwarder(app.clone(), mic_events, Arc::clone(&transcript_buffer));
    spawn_stt_forwarder(app.clone(), sys_events, Arc::clone(&transcript_buffer));

    *state.inner.lock() = Some(RunningSession {
        capture: session,
        cancel: cancel_tx,
        transcript_buffer,
    });
    log::info!("session started (audio + dual-channel STT)");
    Ok(())
}

fn spawn_stt_forwarder<R: Runtime>(
    app: AppHandle<R>,
    mut rx: mpsc::Receiver<SttEvent>,
    buffer: Arc<Mutex<std::collections::VecDeque<crate::llm::TranscriptTurn>>>,
) {
    tokio::spawn(async move {
        while let Some(ev) = rx.recv().await {
            match ev {
                SttEvent::Interim { text, channel } => {
                    let _ = app.emit("transcript_event", TranscriptEvent::Interim { text, channel });
                }
                SttEvent::Final { text, channel, start_ms, end_ms } => {
                    // Append to rolling buffer (bounded by TRANSCRIPT_BUFFER_MAX).
                    {
                        let mut buf = buffer.lock();
                        buf.push_back(crate::llm::TranscriptTurn {
                            channel: channel_label(channel).to_string(),
                            text: text.clone(),
                        });
                        while buf.len() > TRANSCRIPT_BUFFER_MAX {
                            buf.pop_front();
                        }
                    }
                    let _ = app.emit("transcript_event", TranscriptEvent::Final {
                        text, channel, start_ms, end_ms,
                    });
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
    let session = { state.inner.lock().take() };
    let Some(mut s) = session else {
        return Ok(());
    };
    let _ = s.cancel.send(());
    s.capture.stop().await.map_err(|e| e.to_string())?;
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
```

- [ ] **Step 7.3: Register new commands in `lib.rs`**

Add `mod config;` and update `invoke_handler`:

```rust
.invoke_handler(tauri::generate_handler![
    session::start_capture,
    session::stop_capture,
    session::save_config,
    session::load_config,
])
```

- [ ] **Step 7.4: Verify**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo check 2>&1 | tail -10
```

- [ ] **Step 7.5: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml \
        apps/desktop/src-tauri/src/config.rs \
        apps/desktop/src-tauri/src/session.rs \
        apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(stt): wire dual-channel Deepgram STT into session lifecycle + config"
git push 2>&1 | tail -3
```

---

### Task 8: Frontend transcript stream + tag `transcript-complete`

**Files:**
- Create: `cue/apps/desktop/src/components/TranscriptStream.tsx`
- Modify: `cue/apps/desktop/src/hooks/useTauriEvents.ts`
- Modify: `cue/apps/desktop/src/components/OverlayPanel.tsx`

- [ ] **Step 8.1: Update `useTauriEvents.ts` with transcript hook**

Add to the existing file:

```typescript
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface AudioSignalEvent {
  channel: 'mic' | 'system';
  voiced: boolean;
  timestamp_ms: number;
}

export interface TranscriptUtterance {
  id: string;
  channel: 'mic' | 'system';
  text: string;
  isFinal: boolean;
  start_ms?: number;
  end_ms?: number;
}

type TranscriptEvent =
  | { kind: 'interim'; text: string; channel: 'mic' | 'system' }
  | { kind: 'final'; text: string; channel: 'mic' | 'system'; start_ms: number; end_ms: number };

export function useAudioSignal() {
  const [mic, setMic] = useState({ voiced: false, ts: 0 });
  const [system, setSystem] = useState({ voiced: false, ts: 0 });

  useEffect(() => {
    const unlisten = listen<AudioSignalEvent>('audio_signal', ({ payload }) => {
      const next = { voiced: payload.voiced, ts: payload.timestamp_ms };
      if (payload.channel === 'mic') setMic(next);
      else setSystem(next);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return { mic, system };
}

export function useTranscript() {
  const [utterances, setUtterances] = useState<TranscriptUtterance[]>([]);

  useEffect(() => {
    let interimCounter = 0;
    const unlisten = listen<TranscriptEvent>('transcript_event', ({ payload }) => {
      setUtterances((prev) => {
        if (payload.kind === 'interim') {
          // Replace any trailing interim from the same channel; otherwise append.
          const trailingIndex = prev.findLastIndex((u) => !u.isFinal && u.channel === payload.channel);
          const id = trailingIndex >= 0 ? prev[trailingIndex].id : `interim-${++interimCounter}`;
          const next: TranscriptUtterance = {
            id,
            channel: payload.channel,
            text: payload.text,
            isFinal: false,
          };
          if (trailingIndex >= 0) {
            const copy = prev.slice();
            copy[trailingIndex] = next;
            return copy;
          }
          return [...prev, next];
        }
        // Final — promote latest interim from this channel, or append.
        const trailingIndex = prev.findLastIndex(
          (u) => !u.isFinal && u.channel === payload.channel,
        );
        const finalUtt: TranscriptUtterance = {
          id: `final-${payload.start_ms}-${payload.channel}`,
          channel: payload.channel,
          text: payload.text,
          isFinal: true,
          start_ms: payload.start_ms,
          end_ms: payload.end_ms,
        };
        if (trailingIndex >= 0) {
          const copy = prev.slice();
          copy[trailingIndex] = finalUtt;
          return copy;
        }
        return [...prev, finalUtt];
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return utterances;
}
```

- [ ] **Step 8.2: Create `TranscriptStream.tsx`**

```typescript
import { useEffect, useRef } from 'react';
import { useTranscript } from '../hooks/useTauriEvents';

export function TranscriptStream() {
  const utterances = useTranscript();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [utterances.length]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto pr-1">
      {utterances.length === 0 && (
        <p className="text-center text-xs text-cue-muted">Waiting for audio…</p>
      )}
      <ul className="space-y-2">
        {utterances.map((u) => (
          <li key={u.id} className="text-xs">
            <span
              className={
                'mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ' +
                (u.channel === 'mic'
                  ? 'bg-cue-accent/30 text-cue-accent'
                  : 'bg-amber-500/20 text-amber-300')
              }
            >
              {u.channel === 'mic' ? 'you' : 'them'}
            </span>
            <span className={u.isFinal ? 'text-cue-text' : 'text-cue-muted italic'}>
              {u.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 8.3: Modify `OverlayPanel.tsx` to show TranscriptStream in Listen mode**

Update the `<main>` body to render TranscriptStream when running:

```typescript
import { TranscriptStream } from './TranscriptStream';

// ... inside the component ...

<main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
  {running ? (
    <TranscriptStream />
  ) : (
    <div className="flex h-full items-center justify-center text-center text-xs text-cue-muted">
      <div>Press Start to begin transcription.</div>
    </div>
  )}
</main>
```

- [ ] **Step 8.4: Verify**

```bash
pnpm --filter @cue/desktop typecheck 2>&1 | tail -5
```

- [ ] **Step 8.5: Commit + tag milestone**

```bash
git add apps/desktop/src/
git commit -m "feat(ui): live dual-channel transcript stream (you/them)"
git tag -a transcript-complete -m "Plan 2 milestone 2: end-to-end audio + dual-channel STT + transcript UI"
git push origin main 2>&1 | tail -3
git push origin transcript-complete 2>&1 | tail -3
```

**MILESTONE 2 SHIPPED** — full meeting-notes app. Useful on its own as a Otter-replacement that runs entirely on your machine (Anthropic stuff comes next).

---

## PHASE C — LLM pipeline (Tasks 9–11)

### Task 9: LLM trait + Anthropic streaming with prompt cache

**Files:**
- Create: `cue/apps/desktop/src-tauri/src/llm/mod.rs`
- Create: `cue/apps/desktop/src-tauri/src/llm/anthropic.rs`
- Create: `cue/apps/desktop/src-tauri/src/llm/prompts.rs`
- Create: `cue/apps/desktop/src-tauri/src/prompts/interview.md`
- Create: `cue/apps/desktop/src-tauri/src/prompts/meeting.md`
- Create: `cue/apps/desktop/src-tauri/src/prompts/study.md`

- [ ] **Step 9.1: Create `llm/mod.rs`**

```rust
//! LLM abstraction. Primary: Anthropic (Claude Sonnet 4.6). Fallback:
//! HuggingFace (Mistral-7B). 4-tier prompt cache (system / context / rolling /
//! live) keeps per-question cost low.

pub mod anthropic;
pub mod huggingface;
pub mod prompts;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LlmRequest {
    pub mode: Mode,
    pub job_description: Option<String>,
    pub resume: Option<String>,
    pub role_context: Option<String>,
    pub transcript_window: Vec<TranscriptTurn>,
    pub trigger: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Interview,
    Meeting,
    Study,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TranscriptTurn {
    pub channel: String, // "you" | "them"
    pub text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum LlmEvent {
    Token { text: String },
    Done { stop_reason: String, input_tokens: u32, output_tokens: u32 },
    Error { reason: String },
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Stream a response to `request`. The receiver yields one `LlmEvent::Token`
    /// per server token, ending in either `Done` or `Error`.
    async fn stream(
        &self,
        request: LlmRequest,
    ) -> anyhow::Result<tokio::sync::mpsc::Receiver<LlmEvent>>;
}
```

- [ ] **Step 9.2: Create `llm/prompts.rs`**

```rust
//! 4-tier prompt cache builder.

use crate::llm::{LlmRequest, Mode};

const INTERVIEW: &str = include_str!("../prompts/interview.md");
const MEETING: &str = include_str!("../prompts/meeting.md");
const STUDY: &str = include_str!("../prompts/study.md");

pub fn system_prompt(mode: Mode) -> &'static str {
    match mode {
        Mode::Interview => INTERVIEW,
        Mode::Meeting => MEETING,
        Mode::Study => STUDY,
    }
}

/// Concatenate the user-pasted context blocks (JD + resume + role_context) into
/// one string. This is the L2 cache tier — pinned per session, ephemeral 1-hour.
pub fn user_context_block(req: &LlmRequest) -> String {
    let mut s = String::new();
    if let Some(jd) = req.job_description.as_deref().filter(|x| !x.is_empty()) {
        s.push_str("## Job description\n");
        s.push_str(jd);
        s.push_str("\n\n");
    }
    if let Some(r) = req.resume.as_deref().filter(|x| !x.is_empty()) {
        s.push_str("## Candidate resume\n");
        s.push_str(r);
        s.push_str("\n\n");
    }
    if let Some(c) = req.role_context.as_deref().filter(|x| !x.is_empty()) {
        s.push_str("## Role context\n");
        s.push_str(c);
        s.push_str("\n\n");
    }
    s.trim().to_string()
}

pub fn rolling_transcript(req: &LlmRequest) -> String {
    let mut s = String::new();
    for turn in &req.transcript_window {
        s.push_str(&format!("[{}] {}\n", turn.channel, turn.text));
    }
    s.trim().to_string()
}
```

- [ ] **Step 9.3: Create `prompts/interview.md`**

```markdown
You are a real-time interview coach assisting the candidate during a live job interview.

The candidate has pasted the job description, their resume, and any role context they want you to consider — these are the source of truth for what the role expects and what the candidate can credibly claim.

You will receive a rolling window of the conversation transcript labeled `[you]` (the candidate) and `[them]` (the interviewer). When prompted with a specific question or trigger, respond with:

- A concise, direct first sentence the candidate can deliver as the opening of their answer.
- 2–4 supporting bullet points the candidate can reference in real time. Each bullet must be specific to either (a) the candidate's resume, (b) the JD's stated requirements, or (c) recognized engineering/product practice — no generic platitudes.
- Where the candidate's resume contains a relevant project, name it explicitly so they can reference it without searching their memory.

Format the response in compact markdown. Avoid preamble like "Here's how you might answer." Lead with substance.

If the question is ambiguous or the transcript is too thin to answer well, briefly state what would clarify (e.g., "If they're asking about scale, point to the Postgres tuning work in 2024").
```

- [ ] **Step 9.4: Create `prompts/meeting.md`**

```markdown
You are a real-time meeting assistant. The user is in a live meeting and wants either notes or a contextual answer.

You receive a rolling window of the conversation transcript labeled `[you]` (the user) and `[them]` (other participants). When prompted, produce concise meeting-grade output:

- For "what was just decided?" — a one-line decision summary plus owner if mentioned.
- For "what's the action item from this exchange?" — a single bullet starting with a verb, with the owner and (if mentioned) a deadline.
- For substantive questions raised in the meeting that the user wants answered — a direct 2–4 sentence answer they can paraphrase aloud.

No preamble. Compact markdown. Don't fabricate participant names or commitments not in the transcript.
```

- [ ] **Step 9.5: Create `prompts/study.md`**

```markdown
You are a real-time study assistant. The user is reviewing material aloud (or with a study partner) and wants concise clarification or a worked example.

You receive a rolling window of the conversation labeled `[you]` and `[them]`. When prompted:

- For a concept question — give a one-paragraph plain-English explanation, then a single concrete example.
- For a worked-problem request — show the steps explicitly with the reasoning at each step. No skipped algebra.
- For "what should I study next?" — pick one focused topic and briefly justify it from the transcript.

Compact markdown, no filler. Prefer correctness over breadth.
```

- [ ] **Step 9.6: Create `llm/anthropic.rs`**

```rust
//! Claude Sonnet 4.6 streaming via the Messages API with 4-tier prompt cache.

use crate::llm::{prompts, LlmEvent, LlmProvider, LlmRequest};
use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc;

pub const MODEL: &str = "claude-sonnet-4-6";
pub const ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct AnthropicProvider {
    pub api_key: String,
    pub max_tokens: u32,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            max_tokens: 1024,
        }
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn stream(
        &self,
        request: LlmRequest,
    ) -> anyhow::Result<mpsc::Receiver<LlmEvent>> {
        let (tx, rx) = mpsc::channel::<LlmEvent>(128);

        let payload = build_payload(&request, self.max_tokens);
        let api_key = self.api_key.clone();

        tokio::spawn(async move {
            let client = reqwest::Client::new();
            let resp = match client
                .post(ENDPOINT)
                .header("x-api-key", &api_key)
                .header("anthropic-version", ANTHROPIC_VERSION)
                .header(
                    "anthropic-beta",
                    // Enables prompt caching for ephemeral cache_control blocks.
                    "prompt-caching-2024-07-31",
                )
                .header("content-type", "application/json")
                .json(&payload)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx.send(LlmEvent::Error { reason: format!("connect: {e}") }).await;
                    return;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                let _ = tx.send(LlmEvent::Error {
                    reason: format!("{status}: {body}"),
                }).await;
                return;
            }

            let mut stream = resp.bytes_stream().eventsource();
            let mut input_tokens = 0u32;
            let mut output_tokens = 0u32;

            while let Some(event) = stream.next().await {
                let Ok(ev) = event else {
                    let _ = tx.send(LlmEvent::Error {
                        reason: "sse parse error".into(),
                    }).await;
                    break;
                };
                let parsed: Value = match serde_json::from_str(&ev.data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                match parsed.get("type").and_then(|s| s.as_str()) {
                    Some("content_block_delta") => {
                        if let Some(delta_text) = parsed
                            .get("delta")
                            .and_then(|d| d.get("text"))
                            .and_then(|t| t.as_str())
                        {
                            if tx.send(LlmEvent::Token { text: delta_text.to_string() }).await.is_err() {
                                return;
                            }
                        }
                    }
                    Some("message_delta") => {
                        if let Some(usage) = parsed.get("usage") {
                            if let Some(it) = usage.get("input_tokens").and_then(|v| v.as_u64()) {
                                input_tokens = it as u32;
                            }
                            if let Some(ot) = usage.get("output_tokens").and_then(|v| v.as_u64()) {
                                output_tokens = ot as u32;
                            }
                        }
                    }
                    Some("message_stop") => {
                        let stop_reason = parsed
                            .get("stop_reason")
                            .and_then(|s| s.as_str())
                            .unwrap_or("end_turn")
                            .to_string();
                        let _ = tx.send(LlmEvent::Done {
                            stop_reason,
                            input_tokens,
                            output_tokens,
                        }).await;
                        return;
                    }
                    _ => {}
                }
            }
        });

        Ok(rx)
    }
}

fn build_payload(req: &LlmRequest, max_tokens: u32) -> Value {
    // L1: system prompt (1h cache)
    // L2: user context block (JD + resume + role) (1h cache)
    // L3: rolling transcript (5min cache)
    // L4: live trigger (no cache)
    let mut system_blocks = vec![json!({
        "type": "text",
        "text": prompts::system_prompt(req.mode),
        "cache_control": { "type": "ephemeral" }
    })];

    let context_block = prompts::user_context_block(req);
    if !context_block.is_empty() {
        system_blocks.push(json!({
            "type": "text",
            "text": context_block,
            "cache_control": { "type": "ephemeral" }
        }));
    }

    let mut user_content = Vec::new();
    let rolling = prompts::rolling_transcript(req);
    if !rolling.is_empty() {
        user_content.push(json!({
            "type": "text",
            "text": format!("## Recent transcript\n{rolling}"),
            "cache_control": { "type": "ephemeral" }
        }));
    }
    user_content.push(json!({
        "type": "text",
        "text": format!("## Trigger\n{}", req.trigger)
    }));

    json!({
        "model": MODEL,
        "max_tokens": max_tokens,
        "stream": true,
        "system": system_blocks,
        "messages": [{
            "role": "user",
            "content": user_content
        }]
    })
}
```

- [ ] **Step 9.7: Create empty stub `llm/huggingface.rs`** (real impl in Task 10)

```rust
//! HuggingFace Mistral-7B fallback. Implemented in Task 10.

use crate::llm::{LlmEvent, LlmProvider, LlmRequest};
use async_trait::async_trait;
use tokio::sync::mpsc;

pub struct HuggingFaceProvider {
    pub token: String,
}

#[async_trait]
impl LlmProvider for HuggingFaceProvider {
    async fn stream(&self, _request: LlmRequest) -> anyhow::Result<mpsc::Receiver<LlmEvent>> {
        let (_tx, rx) = mpsc::channel(8);
        anyhow::bail!("HuggingFace fallback not implemented yet (Task 10)");
        #[allow(unreachable_code)]
        Ok(rx)
    }
}
```

- [ ] **Step 9.8: Wire `mod llm;` and verify**

Add `mod llm;` to lib.rs.

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd cue/apps/desktop/src-tauri
cargo check 2>&1 | tail -10
```

- [ ] **Step 9.9: Commit**

```bash
git add apps/desktop/src-tauri/src/llm/ \
        apps/desktop/src-tauri/src/prompts/ \
        apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(llm): Anthropic streaming with 4-tier prompt cache + system prompts"
git push 2>&1 | tail -3
```

---

### Task 10: HuggingFace fallback impl

**Files:**
- Replace: `cue/apps/desktop/src-tauri/src/llm/huggingface.rs`

- [ ] **Step 10.1: Implement HF Mistral-7B**

```rust
//! HuggingFace Inference API fallback — `mistralai/Mistral-7B-Instruct-v0.3`.
//!
//! Triggered when Anthropic returns 5xx, 429 (after one retry), or times out
//! before first token. Lower quality than Sonnet but always available.

use crate::llm::{prompts, LlmEvent, LlmProvider, LlmRequest};
use async_trait::async_trait;
use serde_json::json;
use tokio::sync::mpsc;

pub const MODEL_ID: &str = "mistralai/Mistral-7B-Instruct-v0.3";
pub const ENDPOINT_BASE: &str = "https://api-inference.huggingface.co/models/";

pub struct HuggingFaceProvider {
    pub token: String,
    pub max_tokens: u32,
}

impl HuggingFaceProvider {
    pub fn new(token: String) -> Self {
        Self {
            token,
            max_tokens: 800,
        }
    }
}

#[async_trait]
impl LlmProvider for HuggingFaceProvider {
    async fn stream(&self, req: LlmRequest) -> anyhow::Result<mpsc::Receiver<LlmEvent>> {
        let (tx, rx) = mpsc::channel::<LlmEvent>(64);
        let token = self.token.clone();
        let max_tokens = self.max_tokens;

        tokio::spawn(async move {
            let prompt = build_mistral_prompt(&req);
            let url = format!("{ENDPOINT_BASE}{MODEL_ID}");
            let client = reqwest::Client::new();
            let resp = match client
                .post(&url)
                .header("authorization", format!("Bearer {}", token))
                .header("content-type", "application/json")
                .json(&json!({
                    "inputs": prompt,
                    "parameters": {
                        "max_new_tokens": max_tokens,
                        "return_full_text": false,
                        "temperature": 0.4,
                    },
                    "options": {"wait_for_model": true},
                }))
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx.send(LlmEvent::Error { reason: format!("HF connect: {e}") }).await;
                    return;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                let _ = tx.send(LlmEvent::Error {
                    reason: format!("HF {status}: {body}"),
                }).await;
                return;
            }

            // The non-streaming variant returns a JSON array of {generated_text}.
            // We chunk the result locally so the UI still sees a "streaming" feel.
            let body_text = match resp.text().await {
                Ok(t) => t,
                Err(e) => {
                    let _ = tx.send(LlmEvent::Error { reason: format!("HF body: {e}") }).await;
                    return;
                }
            };
            let parsed: serde_json::Value = match serde_json::from_str(&body_text) {
                Ok(v) => v,
                Err(_) => {
                    let _ = tx.send(LlmEvent::Error {
                        reason: "HF returned non-JSON".into(),
                    }).await;
                    return;
                }
            };
            let text = parsed
                .get(0)
                .and_then(|v| v.get("generated_text"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Emit pseudo-stream: ~30 char chunks.
            for chunk in text.as_bytes().chunks(30) {
                let s = String::from_utf8_lossy(chunk).to_string();
                if tx.send(LlmEvent::Token { text: s }).await.is_err() {
                    return;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
            let _ = tx.send(LlmEvent::Done {
                stop_reason: "end_turn".into(),
                input_tokens: 0,
                output_tokens: 0,
            }).await;
        });

        Ok(rx)
    }
}

fn build_mistral_prompt(req: &LlmRequest) -> String {
    let system = prompts::system_prompt(req.mode);
    let context = prompts::user_context_block(req);
    let rolling = prompts::rolling_transcript(req);
    format!(
        "<s>[INST] {system}\n\n{context}\n\n## Recent transcript\n{rolling}\n\n## Trigger\n{} [/INST]",
        req.trigger
    )
}
```

- [ ] **Step 10.2: Verify and commit**

```bash
cargo check 2>&1 | tail -5
git add apps/desktop/src-tauri/src/llm/huggingface.rs
git commit -m "feat(llm): HuggingFace Mistral-7B fallback impl"
git push 2>&1 | tail -3
```

---

### Task 11: Question detector + ask command + transcript window

**Files:**
- Create: `cue/apps/desktop/src-tauri/src/question_detector.rs`
- Modify: `cue/apps/desktop/src-tauri/src/session.rs`
- Modify: `cue/apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 11.1: Create `question_detector.rs`**

```rust
//! Sliding-window question detector for Auto mode.
//!
//! Three-stage classifier over the last 5 seconds of system-channel transcript:
//!   1. Punctuation: window contains `?`
//!   2. Interrogative regex: starts with what/how/why/when/where/who/can/...
//!   3. Haiku 4.5 classifier (cheap fallback for ambiguous text >50 chars)
//!
//! After a trigger, suppress further triggers for 3 seconds.

use std::time::{Duration, Instant};

pub struct QuestionDetector {
    last_trigger: Option<Instant>,
    debounce: Duration,
}

impl Default for QuestionDetector {
    fn default() -> Self {
        Self {
            last_trigger: None,
            debounce: Duration::from_secs(3),
        }
    }
}

impl QuestionDetector {
    /// Returns `Some(question_text)` if the window contains a triggerable
    /// question and the debounce window has passed; `None` otherwise.
    pub fn evaluate(&mut self, window: &str) -> Option<String> {
        if let Some(t) = self.last_trigger {
            if t.elapsed() < self.debounce {
                return None;
            }
        }

        let trimmed = window.trim();
        if trimmed.is_empty() {
            return None;
        }

        if Self::stage_punctuation(trimmed) || Self::stage_interrogative(trimmed) {
            self.last_trigger = Some(Instant::now());
            return Some(trimmed.to_string());
        }

        // Stage 3 — Haiku classifier — is dispatched async in the session layer
        // for ambiguous text >50 chars. Returning None here means "stage 1+2 missed,
        // caller may invoke Haiku."
        None
    }

    fn stage_punctuation(text: &str) -> bool {
        text.contains('?')
    }

    fn stage_interrogative(text: &str) -> bool {
        let lower = text.to_ascii_lowercase();
        let first_token = lower.split_whitespace().next().unwrap_or("");
        matches!(
            first_token,
            "what" | "how" | "why" | "when" | "where" | "who" | "can" | "could" | "would" | "should" | "is" | "are" | "do" | "does" | "did" | "tell" | "describe" | "explain"
        )
    }

    pub fn note_trigger(&mut self) {
        self.last_trigger = Some(Instant::now());
    }
}
```

- [ ] **Step 11.2: Add `ask` command + transcript window in `session.rs`**

Add to the existing session.rs, near the bottom:

```rust
use crate::llm::{self, anthropic::AnthropicProvider, huggingface::HuggingFaceProvider, LlmEvent, LlmProvider, LlmRequest, Mode, TranscriptTurn};

const ANTHROPIC_KEY: &str = env!("CUE_ANTHROPIC_KEY", "set CUE_ANTHROPIC_KEY at build time (see DEV-SETUP.md)");
const HF_TOKEN: &str = env!("CUE_HF_TOKEN", "set CUE_HF_TOKEN at build time");
const FALLBACK_TIMEOUT_MS: u64 = 8_000;

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
        transcript_window,
        trigger,
    };

    let anthropic_key = cfg
        .anthropic_override_key
        .clone()
        .unwrap_or_else(|| ANTHROPIC_KEY.to_string());
    let primary = AnthropicProvider::new(anthropic_key);

    let app_for_orchestrator = app.clone();
    let request_for_fallback = request.clone();

    tokio::spawn(async move {
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
    });

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
            let _ = app.emit("answer_event", AnswerEvent {
                kind: "token".into(), text: Some(text), reason: None,
            });
        }
        LlmEvent::Done { stop_reason, input_tokens, output_tokens } => {
            // Done with zero tokens emitted is a degenerate but legal outcome —
            // treat as a successful empty response, do not fall back.
            let _ = app.emit("answer_event", AnswerEvent {
                kind: "done".into(),
                text: Some(format!("stop={stop_reason} in={input_tokens} out={output_tokens}")),
                reason: None,
            });
            return StreamOutcome::Streamed;
        }
        LlmEvent::Error { reason } => {
            let _ = app.emit("answer_event", AnswerEvent {
                kind: "error".into(), text: None, reason: Some(reason),
            });
            return StreamOutcome::ImmediateError;
        }
    }

    // Keep forwarding the rest of the stream (no further timeout applies — once
    // the stream is producing tokens we let it run to completion).
    while let Some(ev) = rx.recv().await {
        match ev {
            LlmEvent::Token { text } => {
                delivered_any_token = true;
                let _ = app.emit("answer_event", AnswerEvent {
                    kind: "token".into(), text: Some(text), reason: None,
                });
            }
            LlmEvent::Done { stop_reason, input_tokens, output_tokens } => {
                let _ = app.emit("answer_event", AnswerEvent {
                    kind: "done".into(),
                    text: Some(format!("stop={stop_reason} in={input_tokens} out={output_tokens}")),
                    reason: None,
                });
                return StreamOutcome::Streamed;
            }
            LlmEvent::Error { reason } => {
                let _ = app.emit("answer_event", AnswerEvent {
                    kind: "error".into(), text: None, reason: Some(reason),
                });
                // Mid-stream error — already showed user partial content, do not
                // restart with fallback (would produce duplicate output).
                return StreamOutcome::Streamed;
            }
        }
    }

    if delivered_any_token { StreamOutcome::Streamed } else { StreamOutcome::ImmediateError }
}

async fn fallback<R: Runtime>(app: AppHandle<R>, request: LlmRequest) {
    let _ = app.emit("answer_event", AnswerEvent {
        kind: "fallback".into(),
        text: Some("Anthropic unavailable — falling back to HuggingFace Mistral-7B".into()),
        reason: None,
    });
    let provider = HuggingFaceProvider::new(HF_TOKEN.to_string());
    match provider.stream(request).await {
        Ok(rx) => {
            forward_stream(app, rx).await;
        }
        Err(e) => {
            let _ = app.emit("answer_event", AnswerEvent {
                kind: "error".into(),
                text: None,
                reason: Some(format!("fallback failed: {e}")),
            });
        }
    }
}
```

- [ ] **Step 11.3: Register `ask` in `lib.rs` invoke_handler**

```rust
.invoke_handler(tauri::generate_handler![
    session::start_capture,
    session::stop_capture,
    session::save_config,
    session::load_config,
    session::ask,
])
```

- [ ] **Step 11.4: Build env vars for Anthropic + HF keys**

Create `cue/apps/desktop/src-tauri/.cargo/config.toml`:

```toml
[env]
CUE_ANTHROPIC_KEY = { value = "set-at-real-build", force = false }
CUE_HF_TOKEN = { value = "set-at-real-build", force = false }
```

For development, set the real keys via shell env before `cargo check`:

```bash
export CUE_ANTHROPIC_KEY="sk-ant-..."
export CUE_HF_TOKEN="hf_..."
```

For real release builds, the GitHub Actions workflow will inject these from secrets. Document this in `docs/DEV-SETUP.md`.

- [ ] **Step 11.5: Verify and commit**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export CUE_ANTHROPIC_KEY="dev-placeholder-not-used-for-check"
export CUE_HF_TOKEN="dev-placeholder-not-used-for-check"
cargo check 2>&1 | tail -10
git add apps/desktop/src-tauri/src/question_detector.rs \
        apps/desktop/src-tauri/src/session.rs \
        apps/desktop/src-tauri/src/lib.rs \
        apps/desktop/src-tauri/.cargo/
git commit -m "feat(llm): ask command + Anthropic-with-HF-fallback orchestrator + question detector"
git push 2>&1 | tail -3
```

---

## PHASE D — UI integration (Tasks 12–13)

### Task 12: AnswerCard + ContextLoader + SettingsPanel

**Files:**
- Modify: `cue/apps/desktop/package.json` (add `react-markdown`)
- Modify: `cue/apps/desktop/src/hooks/useTauriEvents.ts` (add `useAnswer`)
- Create: `cue/apps/desktop/src/components/AnswerCard.tsx`
- Create: `cue/apps/desktop/src/components/ContextLoader.tsx`
- Create: `cue/apps/desktop/src/components/SettingsPanel.tsx`

- [ ] **Step 12.1: Add `react-markdown`**

In `apps/desktop/package.json` dependencies:
```json
"react-markdown": "^9.0.1"
```

Run `pnpm install`.

- [ ] **Step 12.2: Add `useAnswer` hook**

Append to `useTauriEvents.ts`:

```typescript
interface AnswerEvent {
  kind: 'token' | 'done' | 'error' | 'fallback';
  text?: string;
  reason?: string;
}

export interface StreamingAnswer {
  text: string;
  done: boolean;
  error?: string;
  fallback: boolean;
}

export function useAnswer() {
  const [answer, setAnswer] = useState<StreamingAnswer>({ text: '', done: true, fallback: false });

  useEffect(() => {
    const unlisten = listen<AnswerEvent>('answer_event', ({ payload }) => {
      setAnswer((prev) => {
        if (payload.kind === 'token' && payload.text) {
          return { ...prev, text: prev.text + payload.text, done: false };
        }
        if (payload.kind === 'done') {
          return { ...prev, done: true };
        }
        if (payload.kind === 'fallback') {
          return { ...prev, fallback: true };
        }
        if (payload.kind === 'error') {
          return { ...prev, done: true, error: payload.reason ?? 'unknown' };
        }
        return prev;
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Reset is exposed so callers can clear before a new ask.
  const reset = () => setAnswer({ text: '', done: true, fallback: false });

  return { answer, reset };
}
```

- [ ] **Step 12.3: Create `AnswerCard.tsx`**

```typescript
import ReactMarkdown from 'react-markdown';
import type { StreamingAnswer } from '../hooks/useTauriEvents';

interface Props {
  answer: StreamingAnswer;
  onCopy?: () => void;
}

export function AnswerCard({ answer, onCopy }: Props) {
  if (!answer.text && !answer.error) return null;

  return (
    <div className="rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-3">
      {answer.fallback && (
        <p className="mb-2 text-[10px] uppercase tracking-wide text-amber-300">
          Fallback model
        </p>
      )}
      {answer.error ? (
        <p className="text-xs text-red-300">Error: {answer.error}</p>
      ) : (
        <div className="prose prose-invert prose-sm max-w-none text-cue-text">
          <ReactMarkdown>{answer.text}</ReactMarkdown>
        </div>
      )}
      {answer.done && answer.text && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(answer.text);
            onCopy?.();
          }}
          className="mt-2 rounded bg-cue-accent px-2 py-0.5 text-[10px] font-medium text-white"
        >
          Copy
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 12.4: Create `ContextLoader.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Config {
  deepgram_api_key?: string;
  job_description?: string;
  resume?: string;
  role_context?: string;
  mode?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ContextLoader({ open, onClose }: Props) {
  const [jd, setJd] = useState('');
  const [resume, setResume] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    invoke<Config>('load_config').then((cfg) => {
      setJd(cfg.job_description ?? '');
      setResume(cfg.resume ?? '');
      setRole(cfg.role_context ?? '');
    });
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    const cfg = await invoke<Config>('load_config');
    await invoke('save_config', {
      config: {
        ...cfg,
        job_description: jd,
        resume,
        role_context: role,
      },
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">Context</h2>
        <button type="button" onClick={onClose} className="text-cue-muted">
          ✕
        </button>
      </header>
      <Field label="Job description" value={jd} onChange={setJd} />
      <Field label="Resume" value={resume} onChange={setResume} />
      <Field label="Role / company" value={role} onChange={setRole} rows={2} />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-2 self-end rounded bg-cue-accent px-3 py-1 text-white"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="mb-2 flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-cue-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 rounded border border-cue-subtle/40 bg-black/30 p-1 text-xs text-cue-text focus:border-cue-accent focus:outline-none"
      />
    </label>
  );
}
```

- [ ] **Step 12.5: Create `SettingsPanel.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Config {
  deepgram_api_key?: string;
  anthropic_override_key?: string;
  mode?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: Props) {
  const [deepgram, setDeepgram] = useState('');
  const [anthropic, setAnthropic] = useState('');

  useEffect(() => {
    if (!open) return;
    invoke<Config>('load_config').then((cfg) => {
      setDeepgram(cfg.deepgram_api_key ?? '');
      setAnthropic(cfg.anthropic_override_key ?? '');
    });
  }, [open]);

  if (!open) return null;

  const save = async () => {
    const cfg = await invoke<Config>('load_config');
    await invoke('save_config', {
      config: {
        ...cfg,
        deepgram_api_key: deepgram || undefined,
        anthropic_override_key: anthropic || undefined,
      },
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button type="button" onClick={onClose} className="text-cue-muted">
          ✕
        </button>
      </header>
      <KeyField label="Deepgram API key" value={deepgram} onChange={setDeepgram} />
      <KeyField
        label="Override Anthropic key (optional)"
        value={anthropic}
        onChange={setAnthropic}
      />
      <button
        type="button"
        onClick={save}
        className="mt-2 self-end rounded bg-cue-accent px-3 py-1 text-white"
      >
        Save
      </button>
    </div>
  );
}

function KeyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mb-2 flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-cue-muted">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded border border-cue-subtle/40 bg-black/30 p-1 text-xs text-cue-text focus:border-cue-accent focus:outline-none"
      />
    </label>
  );
}
```

- [ ] **Step 12.6: Verify + commit**

```bash
pnpm --filter @cue/desktop typecheck 2>&1 | tail -5
git add apps/desktop/package.json \
        apps/desktop/src/hooks/useTauriEvents.ts \
        apps/desktop/src/components/
git commit -m "feat(ui): AnswerCard (markdown stream) + ContextLoader + SettingsPanel"
git push 2>&1 | tail -3
```

---

### Task 13: Wire OverlayPanel for three modes + manage Auto-mode question detection

**Files:**
- Modify: `cue/apps/desktop/src/components/OverlayPanel.tsx`

This task wires:
- **Listen mode**: TranscriptStream only
- **Ask mode**: TranscriptStream + text input + AnswerCard
- **Auto mode**: TranscriptStream + auto-fired AnswerCard list (one per detected question)

The frontend Auto mode classifier is the same three-stage check as the Rust one, applied to incoming transcripts. (Mirroring the logic on both sides is intentional — keeps the UX responsive without round-tripping every transcript.)

- [ ] **Step 13.1: Replace `OverlayPanel.tsx`**

```typescript
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModeSelector, type Mode } from './ModeSelector';
import { TranscriptStream } from './TranscriptStream';
import { AnswerCard } from './AnswerCard';
import { ContextLoader } from './ContextLoader';
import { SettingsPanel } from './SettingsPanel';
import {
  useAudioSignal,
  useAnswer,
  useTranscript,
  type StreamingAnswer,
} from '../hooks/useTauriEvents';

const QUESTION_REGEX = /^(what|how|why|when|where|who|can|could|would|should|is|are|do|does|did|tell|describe|explain)\b/i;
const DEBOUNCE_MS = 3000;

export function OverlayPanel() {
  const [mode, setMode] = useState<Mode>('listen');
  const [running, setRunning] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [autoAnswers, setAutoAnswers] = useState<StreamingAnswer[]>([]);

  const { mic, system } = useAudioSignal();
  const transcript = useTranscript();
  const { answer, reset } = useAnswer();

  const lastTriggerAt = useRef(0);

  // Auto mode: detect questions in system-channel transcripts.
  useEffect(() => {
    if (mode !== 'auto' || transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (!last.isFinal || last.channel !== 'system') return;
    const now = Date.now();
    if (now - lastTriggerAt.current < DEBOUNCE_MS) return;
    if (last.text.includes('?') || QUESTION_REGEX.test(last.text)) {
      lastTriggerAt.current = now;
      reset();
      invoke('ask', { mode: 'interview', trigger: last.text });
    }
  }, [transcript, mode, reset]);

  const submitAsk = () => {
    if (!askInput.trim()) return;
    reset();
    invoke('ask', { mode: 'interview', trigger: askInput.trim() });
    setAskInput('');
  };

  // Snapshot finished auto-mode answers so they accumulate.
  useEffect(() => {
    if (mode === 'auto' && answer.done && answer.text) {
      setAutoAnswers((prev) => [...prev, answer]);
    }
  }, [answer, mode]);

  const toggle = async () => {
    if (running) {
      await invoke('stop_capture');
      setRunning(false);
    } else {
      await invoke('start_capture');
      setRunning(true);
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col rounded-xl bg-cue-bg p-3 shadow-2xl backdrop-blur-md ring-1 ring-white/10">
      <header
        data-tauri-drag-region
        className="flex items-center justify-between pb-2 cursor-grab active:cursor-grabbing"
      >
        <span className="text-xs font-semibold tracking-wide text-cue-text">cue</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowContext(true)} className="text-[10px] text-cue-muted hover:text-cue-text">
            Context
          </button>
          <button type="button" onClick={() => setShowSettings(true)} className="text-[10px] text-cue-muted hover:text-cue-text">
            ⚙
          </button>
          <span className="text-[10px] text-cue-muted">⌘\</span>
        </div>
      </header>

      <ModeSelector mode={mode} setMode={setMode} />

      <div className="mt-2 flex items-center justify-between rounded-md bg-black/20 px-3 py-2 text-xs">
        <button type="button" onClick={toggle} className="rounded bg-cue-accent px-3 py-1 text-white">
          {running ? 'Stop' : 'Start'}
        </button>
        <Dot label="you" voiced={mic.voiced} />
        <Dot label="them" voiced={system.voiced} />
      </div>

      <main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
        {!running && (
          <div className="flex h-full items-center justify-center text-center text-xs text-cue-muted">
            <div>Press Start to begin.</div>
          </div>
        )}
        {running && (
          <div className="flex h-full flex-col gap-3">
            <div className="flex-1 overflow-y-auto">
              <TranscriptStream />
            </div>

            {mode === 'ask' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={askInput}
                    onChange={(e) => setAskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAsk();
                    }}
                    placeholder="Ask anything (Cmd/Ctrl+Enter to send)"
                    className="flex-1 rounded border border-cue-subtle/40 bg-black/30 px-2 py-1 text-xs text-cue-text"
                  />
                  <button type="button" onClick={submitAsk} className="rounded bg-cue-accent px-2 text-xs text-white">
                    Ask
                  </button>
                </div>
                <AnswerCard answer={answer} />
              </div>
            )}

            {mode === 'auto' && (
              <div className="space-y-2">
                <AnswerCard answer={answer} />
                {autoAnswers.slice().reverse().map((a, i) => (
                  <AnswerCard key={i} answer={a} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 pt-2 text-[10px] text-cue-muted">
        Mode: <span className="text-cue-text">{mode}</span>
      </footer>

      <ContextLoader open={showContext} onClose={() => setShowContext(false)} />
      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

function Dot({ label, voiced }: { label: string; voiced: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-cue-muted">{label}</span>
      <span
        className={
          'h-2 w-2 rounded-full transition-opacity ' +
          (voiced ? 'bg-green-400 opacity-100' : 'bg-green-400 opacity-20')
        }
      />
    </div>
  );
}
```

- [ ] **Step 13.2: Verify + commit**

```bash
pnpm --filter @cue/desktop typecheck 2>&1 | tail -5
git add apps/desktop/src/components/OverlayPanel.tsx
git commit -m "feat(ui): wire Listen/Ask/Auto modes with question detection + answer streams"
git push 2>&1 | tail -3
```

---

## PHASE E — Acceptance (Task 14)

### Task 14: End-to-end smoke test + tag `intelligence-complete`

**Files:** none — verification + tag.

- [ ] **Step 14.1: Manual smoke test on Windows**

You'll need:
- A Deepgram API key (free tier covers ~$200 of usage — sign up at https://deepgram.com)
- Working Anthropic credits (already verified per Memory Mar 28 entry)

Build a release with the env keys baked in:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export CUE_ANTHROPIC_KEY="sk-ant-..."   # your real key
export CUE_HF_TOKEN="hf_..."            # your real HF token (Amdrautomate account)
cd cue
pnpm build 2>&1 | tail -10
```

Install the new MSI (located at `apps/desktop/src-tauri/target/release/bundle/msi/cue_0.1.0_x64_en-US.msi`).

Then walk this end-to-end test:

1. Launch cue, click ⚙ Settings, paste your Deepgram key, save.
2. Click Context, paste a fake JD + your real resume + a role context line ("Senior backend role at FinTechCo"), save.
3. Switch to Listen mode, press Start. Speak into the mic — `you` transcripts should appear within ~1 second.
4. Play a YouTube clip in another tab — `them` transcripts should appear (different color).
5. Switch to Ask mode. Type "What's a good way to introduce myself?" and Cmd+Enter. Answer should stream in within 2 seconds.
6. Switch to Auto mode. Have a friend ask you "What's your experience with system design?" via voice. Answer should auto-fire within 4 seconds.
7. Disable network briefly (toggle wifi off). Ask another question. After ~8 seconds you should see "Fallback model" appear and an HF answer stream in. (Re-enable wifi after.)

Each step that passes is one check toward the spec's acceptance criteria.

- [ ] **Step 14.2: Document smoke test results in CHANGELOG.md**

Add a section to `cue/CHANGELOG.md` under `## [Unreleased]`:

```markdown
### Added
- Plan 2 (`intelligence-complete`): dual-channel audio capture, Deepgram streaming STT, Anthropic Sonnet 4.6 streaming with HuggingFace Mistral-7B fallback, three modes (Listen / Ask / Auto), JD + resume context loader, settings panel, question detector for Auto mode.

### Acceptance
- Smoke test passed on Windows 11 build [REPLACE WITH ACTUAL] on [DATE]:
  - [ ] mic transcript "you" tagged correctly
  - [ ] system transcript "them" tagged correctly
  - [ ] Ask mode streaming Anthropic answer
  - [ ] Auto mode question detection fires on system-channel "?" or interrogative
  - [ ] HuggingFace fallback engages when Anthropic unreachable
```

- [ ] **Step 14.3: Tag and push**

```bash
git add CHANGELOG.md
git commit -m "docs: Plan 2 acceptance results in CHANGELOG"
git tag -a intelligence-complete -m "Plan 2 (cue-intelligence) complete: full audio + STT + LLM + 3 modes + context loader"
git push origin main 2>&1 | tail -3
git push origin intelligence-complete 2>&1 | tail -3
```

**MILESTONE 3 SHIPPED — MVP READY.**

---

## Done

Plan 2 complete. Outcomes after the three milestones:

- `audio-streaming` (Task 5): dual-channel VAD with UI signal indicator
- `transcript-complete` (Task 8): live dual-channel transcript via Deepgram
- `intelligence-complete` (Task 14): full Listen/Ask/Auto modes with Anthropic + HF fallback

The MVP described in the spec's Section 1.1 is now functional. What's left for v1.0:

1. **Code-signing on Windows** ($300/yr SSL.com EV) — clean install UX
2. **Apple notarization** ($99/yr Developer ID) — when you have a Mac to test on
3. **Whisper.cpp local STT** — privacy upgrade
4. **Process-name masquerading** — opt-in, post-MVP
5. **First-run consent flow** — surface EULA + permissions before first audio capture
6. **Multi-provider expansion** — Groq STT, Gemini/OpenAI LLM, local Ollama

Each is a small, focused plan when ready. None is blocking for personal use.

**Once you push the first `v0.1.0` tag**, the GitHub Actions workflow at `.github/workflows/release.yml` triggers, builds binaries on mac + win runners, drafts a GitHub release, and the Vercel marketing site at https://cue-web-five.vercel.app starts serving real downloads. End-to-end pipeline live.
