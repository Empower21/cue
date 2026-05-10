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
