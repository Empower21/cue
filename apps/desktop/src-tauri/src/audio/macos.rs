//! macOS audio capture via ScreenCaptureKit's CoreAudio Tap (Sonoma 14.4+).
//!
//! ScreenCaptureKit exposes both screen and system-audio capture. We use the
//! audio path only — no display capture. `SCStream` still needs an
//! `SCContentFilter` pointing at a display, but we register only an
//! `SCStreamOutputType::Audio` handler so no video frames are ever decoded.
//! The user grants "Screen Recording" permission in System Settings → Privacy &
//! Security on first run; that same entitlement covers the CoreAudio Tap.
//!
//! Mic capture uses the standard `cpal` default input device (same as Windows),
//! keeping the two channels fully independent.
//!
//! # API version note
//!
//! The plan referenced `screencapturekit = "0.3"` with a hypothetical
//! `SCStream::start_audio_only` surface.  The crate shipped as `2.0.0`; the
//! closest public API is `SCStream::new(&filter, &config)` + closure-based
//! `add_output_handler`.  This file uses the 2.0 API.  The trait surface in
//! `audio/mod.rs` is unchanged.

use crate::audio::{
    resample::MonoResampler,
    vad::{VadGate, FRAME_SAMPLES},
    AudioCaptureSession, AudioChannel, CaptureError, PcmFrame,
};
use async_trait::async_trait;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use screencapturekit::cm::{CMSampleBuffer, SCFrameStatus};
use screencapturekit::prelude::*;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc::Sender;

// ---------------------------------------------------------------------------
// Helper: extract interleaved f32 samples from a CMSampleBuffer audio frame.
//
// ScreenCaptureKit delivers PCM float-32 little-endian in the audio buffer
// list.  Each AudioBuffer holds the raw bytes; we reinterpret them as f32.
// ---------------------------------------------------------------------------
fn extract_f32(sample: &CMSampleBuffer) -> Vec<f32> {
    let Some(abl) = sample.audio_buffer_list() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for buf in abl.iter() {
        let bytes = buf.data();
        if bytes.is_empty() {
            continue;
        }
        // Safety: CMSampleBuffer guarantees 4-byte aligned f32 PCM data.
        // We require the byte count to be a multiple of 4.
        let n_floats = bytes.len() / std::mem::size_of::<f32>();
        let mut floats = Vec::with_capacity(n_floats);
        for chunk in bytes.chunks_exact(std::mem::size_of::<f32>()) {
            floats.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
        }
        out.append(&mut floats);
    }
    out
}

// ---------------------------------------------------------------------------
// SCStreamOutputTrait impl that fans f32 audio into our pipeline.
// We box the mutable shared state behind Arc<Mutex<…>> so the trait object
// can be moved into the SCStream callback (which requires 'static + Send).
// ---------------------------------------------------------------------------
struct SystemAudioHandler {
    resampler: Arc<Mutex<MonoResampler>>,
    vad: Arc<Mutex<VadGate>>,
    pending: Arc<Mutex<Vec<i16>>>,
    sender: Sender<PcmFrame>,
    started_at: Instant,
}

impl SCStreamOutputTrait for SystemAudioHandler {
    fn did_output_sample_buffer(
        &self,
        sample: CMSampleBuffer,
        output_type: SCStreamOutputType,
    ) {
        if output_type != SCStreamOutputType::Audio {
            return;
        }
        let f32_samples = extract_f32(&sample);
        if f32_samples.is_empty() {
            return;
        }

        // Resample 48 kHz stereo → 16 kHz mono i16
        let mut pcm = self.resampler.lock().push(&f32_samples, 2);
        let mut buf = self.pending.lock();
        buf.append(&mut pcm);
        while buf.len() >= FRAME_SAMPLES {
            let frame: Vec<i16> = buf.drain(..FRAME_SAMPLES).collect();
            let voiced = self.vad.lock().is_voiced(&frame);
            let _ = self.sender.try_send(PcmFrame {
                channel: AudioChannel::System,
                samples: frame,
                timestamp_ms: self.started_at.elapsed().as_millis() as u64,
                voiced,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// MacosCapture — the public struct implementing AudioCaptureSession.
// ---------------------------------------------------------------------------

/// Audio capture session for macOS.
///
/// - Mic: `cpal` default input device (same cross-platform path as Windows).
/// - System audio: `SCStream` with a CoreAudio Tap registered on the primary
///   display filter (audio-only handler; no video decoded).
pub struct MacosCapture {
    mic_stream: Option<cpal::Stream>,
    /// `SCStream` is `Send` but not `Clone`; we keep it live for the session
    /// duration and call `stop_capture` on drop.
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

// SAFETY: cpal::Stream is marked `!Send` via `PhantomData<*mut ()>` as a
// conservative cross-platform marker, and CPAL's CoreAudio path also boxes
// a !Send property-listener closure. In practice both objects are accessed
// only from within the async start/stop methods on a single task — never
// concurrently — and Tokio guarantees the future's execution is serialized
// per task. Same justification as `WindowsCapture` in audio/windows.rs.
unsafe impl Send for MacosCapture {}

#[async_trait]
impl AudioCaptureSession for MacosCapture {
    async fn start(&mut self, sender: Sender<PcmFrame>) -> Result<(), CaptureError> {
        if self.mic_stream.is_some() || self.sc_stream.is_some() {
            return Err(CaptureError::AlreadyRunning);
        }
        let started = Instant::now();
        self.started_at = Some(started);

        // ── Microphone via cpal ───────────────────────────────────────────
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
                    let mut pcm =
                        mic_resampler.lock().push(data, mic_input_channels);
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

        // ── System audio via ScreenCaptureKit ─────────────────────────────
        // We need a display to build the content filter even though we only
        // register an Audio output handler (no video frames are decoded).
        let content = SCShareableContent::get()
            .map_err(|e| CaptureError::PermissionDenied(format!("SCShareableContent: {e}")))?;
        let display = content
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| CaptureError::DeviceNotFound("no display found for SCStream filter".into()))?;

        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();

        // Request 48 kHz stereo — SCStream's native audio format.
        // We down-mix + resample to 16 kHz mono in the handler.
        let config = SCStreamConfiguration::new()
            .with_captures_audio(true)
            .with_sample_rate(48_000)
            .with_channel_count(2);

        let handler = SystemAudioHandler {
            resampler: Arc::new(Mutex::new(
                MonoResampler::new(48_000, 2)
                    .map_err(|e| CaptureError::Backend(format!("system resampler: {e}")))?,
            )),
            vad: Arc::new(Mutex::new(VadGate::new())),
            pending: Arc::new(Mutex::new(Vec::with_capacity(FRAME_SAMPLES * 4))),
            sender,
            started_at: started,
        };

        let mut sc_stream = screencapturekit::stream::SCStream::new(&filter, &config);
        sc_stream.add_output_handler(handler, SCStreamOutputType::Audio);
        sc_stream
            .start_capture()
            .map_err(|e| CaptureError::PermissionDenied(format!("SCStream start_capture: {e}")))?;

        self.sc_stream = Some(sc_stream);

        log::info!("CoreAudio Tap capture started (mic via cpal + system via SCStream)");
        Ok(())
    }

    async fn stop(&mut self) -> Result<(), CaptureError> {
        // Drop mic stream first — its callbacks reference arcs that may also
        // be held by system audio; dropping mic first avoids any ordering
        // issue.
        if let Some(s) = self.mic_stream.take() {
            drop(s);
        }
        if let Some(s) = self.sc_stream.take() {
            s.stop_capture()
                .map_err(|e| CaptureError::Backend(format!("SCStream stop_capture: {e}")))?;
        }
        self.started_at = None;
        log::info!("CoreAudio Tap capture stopped");
        Ok(())
    }
}
