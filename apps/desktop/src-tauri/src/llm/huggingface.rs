//! HuggingFace Mistral-7B fallback. Implemented in Task 10.

use crate::llm::{LlmEvent, LlmProvider, LlmRequest};
use async_trait::async_trait;
use tokio::sync::mpsc;

pub struct HuggingFaceProvider {
    pub token: String,
}

#[async_trait]
impl LlmProvider for HuggingFaceProvider {
    async fn stream(&self, _request: LlmRequest) -> anyhow::Result<mpsc::Receiver<LlmEvent>> {
        let (_tx, rx) = mpsc::channel(8);
        anyhow::bail!("HuggingFace fallback not implemented yet (Task 10)");
        #[allow(unreachable_code)]
        Ok(rx)
    }
}
