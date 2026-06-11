//! Claude Opus 4.8 streaming via the Messages API with 4-tier prompt cache.

use crate::llm::{prompts, LlmEvent, LlmProvider, LlmRequest};
use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use serde_json::{json, Value};
use tokio::sync::mpsc;

pub const MODEL: &str = "claude-opus-4-8";
pub const ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct AnthropicProvider {
    pub api_key: String,
    pub max_tokens: u32,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            max_tokens: 1024,
        }
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn stream(
        &self,
        request: LlmRequest,
    ) -> anyhow::Result<mpsc::Receiver<LlmEvent>> {
        let (tx, rx) = mpsc::channel::<LlmEvent>(128);

        let payload = build_payload(&request, self.max_tokens);
        let api_key = self.api_key.clone();

        tokio::spawn(async move {
            let client = reqwest::Client::new();
            let resp = match client
                .post(ENDPOINT)
                .header("x-api-key", &api_key)
                .header("anthropic-version", ANTHROPIC_VERSION)
                .header(
                    "anthropic-beta",
                    // Enables prompt caching for ephemeral cache_control blocks.
                    "prompt-caching-2024-07-31",
                )
                .header("content-type", "application/json")
                .json(&payload)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    let _ = tx.send(LlmEvent::Error { reason: format!("connect: {e}") }).await;
                    return;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                let _ = tx.send(LlmEvent::Error {
                    reason: format!("{status}: {body}"),
                }).await;
                return;
            }

            let mut stream = resp.bytes_stream().eventsource();
            let mut input_tokens = 0u32;
            let mut output_tokens = 0u32;
            // stop_reason arrives in the `message_delta` event (under
            // delta.stop_reason) — `message_stop` is just {"type":"message_stop"}.
            // Likewise input_tokens lives in `message_start`, not message_delta.
            let mut stop_reason = String::from("end_turn");

            while let Some(event) = stream.next().await {
                let Ok(ev) = event else {
                    let _ = tx.send(LlmEvent::Error {
                        reason: "sse parse error".into(),
                    }).await;
                    break;
                };
                let parsed: Value = match serde_json::from_str(&ev.data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                match parsed.get("type").and_then(|s| s.as_str()) {
                    Some("content_block_delta") => {
                        if let Some(delta_text) = parsed
                            .get("delta")
                            .and_then(|d| d.get("text"))
                            .and_then(|t| t.as_str())
                        {
                            if tx.send(LlmEvent::Token { text: delta_text.to_string() }).await.is_err() {
                                return;
                            }
                        }
                    }
                    Some("message_start") => {
                        if let Some(it) = parsed
                            .pointer("/message/usage/input_tokens")
                            .and_then(|v| v.as_u64())
                        {
                            input_tokens = it as u32;
                        }
                    }
                    Some("message_delta") => {
                        if let Some(sr) = parsed
                            .pointer("/delta/stop_reason")
                            .and_then(|s| s.as_str())
                        {
                            stop_reason = sr.to_string();
                        }
                        if let Some(usage) = parsed.get("usage") {
                            if let Some(it) = usage.get("input_tokens").and_then(|v| v.as_u64()) {
                                input_tokens = it as u32;
                            }
                            if let Some(ot) = usage.get("output_tokens").and_then(|v| v.as_u64()) {
                                output_tokens = ot as u32;
                            }
                        }
                    }
                    Some("message_stop") => {
                        let _ = tx.send(LlmEvent::Done {
                            stop_reason,
                            input_tokens,
                            output_tokens,
                        }).await;
                        return;
                    }
                    _ => {}
                }
            }
        });

        Ok(rx)
    }
}

fn build_payload(req: &LlmRequest, max_tokens: u32) -> Value {
    // L1: system prompt + language directive (1h cache)
    // L2: user context block (JD + resume + role + voice_sample) (1h cache)
    // L3: rolling transcript (5min cache)
    // L4: live trigger (+ optional image) (no cache)
    let mut sys_text = prompts::system_prompt(req.mode).to_string();
    let lang = prompts::language_directive(req);
    if !lang.is_empty() {
        sys_text.push_str("\n\n");
        sys_text.push_str(&lang);
    }
    let mut system_blocks = vec![json!({
        "type": "text",
        "text": sys_text,
        "cache_control": { "type": "ephemeral" }
    })];

    let context_block = prompts::user_context_block(req);
    if !context_block.is_empty() {
        system_blocks.push(json!({
            "type": "text",
            "text": context_block,
            "cache_control": { "type": "ephemeral" }
        }));
    }

    let mut user_content = Vec::new();
    let rolling = prompts::rolling_transcript(req);
    if !rolling.is_empty() {
        user_content.push(json!({
            "type": "text",
            "text": format!("## Recent transcript\n{rolling}"),
            "cache_control": { "type": "ephemeral" }
        }));
    }

    // Multimodal trigger when a screenshot is attached. The image is sent first
    // so the model sees it before reading the instructions about it.
    if let Some(b64) = req.image_b64.as_deref().filter(|x| !x.is_empty()) {
        user_content.push(json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": b64
            }
        }));
    }

    user_content.push(json!({
        "type": "text",
        "text": format!("## Trigger\n{}", req.trigger)
    }));

    json!({
        "model": MODEL,
        "max_tokens": max_tokens,
        "stream": true,
        "system": system_blocks,
        "messages": [{
            "role": "user",
            "content": user_content
        }]
    })
}
