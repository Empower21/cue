//! HuggingFace Inference API fallback — `mistralai/Mistral-7B-Instruct-v0.3`.
//!
//! Triggered when Anthropic returns 5xx, 429 (after one retry), or times out
//! before first token. Lower quality than Sonnet but always available.

use crate::llm::{prompts, LlmEvent, LlmProvider, LlmRequest};
use async_trait::async_trait;
use serde_json::json;
use tokio::sync::mpsc;

pub const MODEL_ID: &str = "mistralai/Mistral-7B-Instruct-v0.3";
pub const ENDPOINT_BASE: &str = "https://api-inference.huggingface.co/models/";

pub struct HuggingFaceProvider {
    pub token: String,
    pub max_tokens: u32,
}

impl HuggingFaceProvider {
    pub fn new(token: String) -> Self {
        Self {
            token,
            max_tokens: 800,
        }
    }
}

#[async_trait]
impl LlmProvider for HuggingFaceProvider {
    async fn stream(&self, req: LlmRequest) -> anyhow::Result<mpsc::Receiver<LlmEvent>> {
        let (tx, rx) = mpsc::channel::<LlmEvent>(64);
        let token = self.token.clone();
        let max_tokens = self.max_tokens;

        tokio::spawn(async move {
            let prompt = build_mistral_prompt(&req);
            let url = format!("{ENDPOINT_BASE}{MODEL_ID}");
            let client = reqwest::Client::new();
            let resp = match client
                .post(&url)
                .header("authorization", format!("Bearer {}", token))
                .header("content-type", "application/json")
                .json(&json!({
                    "inputs": prompt,
                    "parameters": {
                        "max_new_tokens": max_tokens,
                        "return_full_text": false,
                        "temperature": 0.4,
                    },
                    "options": {"wait_for_model": true},
                }))
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx.send(LlmEvent::Error { reason: format!("HF connect: {e}") }).await;
                    return;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                let _ = tx.send(LlmEvent::Error {
                    reason: format!("HF {status}: {body}"),
                }).await;
                return;
            }

            // The non-streaming variant returns a JSON array of {generated_text}.
            // We chunk the result locally so the UI still sees a "streaming" feel.
            let body_text = match resp.text().await {
                Ok(t) => t,
                Err(e) => {
                    let _ = tx.send(LlmEvent::Error { reason: format!("HF body: {e}") }).await;
                    return;
                }
            };
            let parsed: serde_json::Value = match serde_json::from_str(&body_text) {
                Ok(v) => v,
                Err(_) => {
                    let _ = tx.send(LlmEvent::Error {
                        reason: "HF returned non-JSON".into(),
                    }).await;
                    return;
                }
            };
            let text = parsed
                .get(0)
                .and_then(|v| v.get("generated_text"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Emit pseudo-stream: ~30 char chunks.
            for chunk in text.as_bytes().chunks(30) {
                let s = String::from_utf8_lossy(chunk).to_string();
                if tx.send(LlmEvent::Token { text: s }).await.is_err() {
                    return;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
            let _ = tx.send(LlmEvent::Done {
                stop_reason: "end_turn".into(),
                input_tokens: 0,
                output_tokens: 0,
            }).await;
        });

        Ok(rx)
    }
}

fn build_mistral_prompt(req: &LlmRequest) -> String {
    let system = prompts::system_prompt(req.mode);
    let context = prompts::user_context_block(req);
    let rolling = prompts::rolling_transcript(req);
    format!(
        "<s>[INST] {system}\n\n{context}\n\n## Recent transcript\n{rolling}\n\n## Trigger\n{} [/INST]",
        req.trigger
    )
}
