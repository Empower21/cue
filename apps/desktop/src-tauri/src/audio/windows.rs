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

// SAFETY: cpal::Stream on Windows uses `PhantomData<*mut ()>` as a
// conservative !Send marker for ASIO compatibility, but WASAPI streams are
// internally thread-safe. We only access `self.streams` from within the
// async start/stop methods (never concurrently), so sending
// WindowsCapture across threads is safe in this usage pattern.
unsafe impl Send for WindowsCapture {}

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
