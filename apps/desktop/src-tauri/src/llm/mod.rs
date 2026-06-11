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
    /// Writing sample for voice/tone matching. Lives in L2 cache tier alongside
    /// the rest of user context, so it costs nothing per re-ask.
    pub voice_sample: Option<String>,
    /// BCP-47 language tag. When Some, the model is instructed to respond in
    /// this language; the live trigger / transcript still arrives in whatever
    /// language STT produced.
    pub language: Option<String>,
    pub transcript_window: Vec<TranscriptTurn>,
    /// Adaptive memory: recent Q&As from past sessions (oldest first). Lets
    /// the model stay consistent across uses instead of starting cold — see
    /// crate::memory.
    pub memory: Vec<MemoryTurn>,
    pub trigger: String,
    /// Base64-encoded PNG (no data: prefix). When present, the Anthropic
    /// provider sends a multimodal message and the trigger becomes the prompt
    /// applied to the image (e.g. "Solve this coding problem on my screen.").
    pub image_b64: Option<String>,
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

/// One remembered Q&A from a past session (adaptive memory).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryTurn {
    pub q: String,
    pub a: String,
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
