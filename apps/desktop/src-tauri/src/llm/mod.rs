//! LLM abstraction. Full implementation lands in T9.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TranscriptTurn {
    pub channel: String, // "you" | "them"
    pub text: String,
}
