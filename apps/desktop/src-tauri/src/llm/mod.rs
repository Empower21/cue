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
