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

    /// Has there been >= `silence_threshold_frames` voiceless frames in a row?
    pub fn just_passed_silence_threshold(&self) -> bool {
        self.silence_run == self.silence_threshold_frames
    }
}

impl Default for VadGate {
    fn default() -> Self {
        Self::new()
    }
}
