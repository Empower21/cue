// Stub — implemented in Task 3
//
// Minimal type definitions so `audio/mod.rs` compiles on macOS.
// The real CoreAudio Tap implementation will replace this in Task 3.

use crate::audio::{AudioCaptureSession, CaptureError, PcmFrame};
use async_trait::async_trait;

pub struct MacosCapture;

impl MacosCapture {
    pub fn new() -> Result<Self, CaptureError> {
        Err(CaptureError::Backend(
            "CoreAudio Tap capture not yet implemented — Task 3 pending".into(),
        ))
    }
}

#[async_trait]
impl AudioCaptureSession for MacosCapture {
    async fn start(
        &mut self,
        _sender: tokio::sync::mpsc::Sender<PcmFrame>,
    ) -> Result<(), CaptureError> {
        Err(CaptureError::Backend("not implemented".into()))
    }

    async fn stop(&mut self) -> Result<(), CaptureError> {
        Ok(())
    }
}
