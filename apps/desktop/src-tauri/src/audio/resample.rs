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
            Box::new(samples.chunks_exact(ch).map(move |frame| {
                frame.iter().sum::<f32>() / ch as f32
            }))
        };
        self.pending_in.extend(mono_iter);

        let mut out = Vec::new();
        loop {
            // Re-query the required block size each iteration — rubato's
            // contract allows it to vary between process() calls.
            let chunk = self.inner.input_frames_next();
            if chunk == 0 || self.pending_in.len() < chunk {
                break;
            }
            let block: Vec<f32> = self.pending_in.drain(..chunk).collect();
            // Never panic here: this runs on cpal's realtime audio callback
            // thread, where an unwind aborts the whole process. Dropping one
            // frame on a rare resampler error is inaudible; crashing is not.
            match self.inner.process(&[block], None) {
                Ok(resampled) => out.extend(
                    resampled[0]
                        .iter()
                        .map(|&s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16),
                ),
                Err(e) => {
                    log::warn!("resampler block failed (frame dropped): {e}");
                    break;
                }
            }
        }
        out
    }
}
