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
