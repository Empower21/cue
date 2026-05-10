// Stub — implemented in Task 2
//
// Minimal type definitions so `audio/mod.rs` compiles on Windows.
// The real WASAPI implementation will replace this in Task 2.

use crate::audio::{AudioCaptureSession, CaptureError, PcmFrame};
use async_trait::async_trait;

pub struct WindowsCapture;

impl WindowsCapture {
    pub fn new() -> Result<Self, CaptureError> {
        Err(CaptureError::Backend(
            "WASAPI capture not yet implemented — Task 2 pending".into(),
        ))
    }
}

#[async_trait]
impl AudioCaptureSession for WindowsCapture {
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
