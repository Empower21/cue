//! Deepgram streaming STT via WebSocket.
//!
//! Endpoint: wss://api.deepgram.com/v1/listen
//! Auth: `Authorization: Token <api-key>` header
//! Audio format: linear16 PCM, 16 kHz, mono, single channel
//! Each session covers exactly one AudioChannel — we run two in parallel.

use crate::audio::AudioChannel;
use crate::stt::{SttConfig, SttEvent, SttProvider, SttSession};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

pub struct DeepgramProvider;

#[async_trait]
impl SttProvider for DeepgramProvider {
    async fn open(
        &self,
        channel: AudioChannel,
        config: SttConfig,
    ) -> anyhow::Result<Box<dyn SttSession>> {
        let url = format!(
            "wss://api.deepgram.com/v1/listen\
             ?model={}\
             &encoding=linear16\
             &sample_rate=16000\
             &channels=1\
             &interim_results=true\
             &endpointing=300\
             &language={}",
            config.model, config.language
        );

        let mut req = url.into_client_request()?;
        req.headers_mut().insert(
            "Authorization",
            HeaderValue::from_str(&format!("Token {}", config.api_key))?,
        );

        let (ws, _resp) = tokio_tungstenite::connect_async(req).await?;

        let (event_tx, event_rx) = mpsc::channel::<SttEvent>(256);
        let (frame_tx, frame_rx) = mpsc::channel::<Vec<u8>>(256);

        // Spawn the read+write driver task.
        tokio::spawn(driver_task(ws, frame_rx, event_tx, channel));

        Ok(Box::new(DeepgramSession {
            frame_tx,
            event_rx: Some(event_rx),
        }))
    }
}

pub struct DeepgramSession {
    frame_tx: mpsc::Sender<Vec<u8>>,
    event_rx: Option<mpsc::Receiver<SttEvent>>,
}

#[async_trait]
impl SttSession for DeepgramSession {
    async fn submit(&mut self, frame: &[i16]) -> anyhow::Result<()> {
        let mut bytes = Vec::with_capacity(frame.len() * 2);
        for sample in frame {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        self.frame_tx
            .send(bytes)
            .await
            .map_err(|_| anyhow::anyhow!("Deepgram frame channel closed"))?;
        Ok(())
    }

    fn events(&mut self) -> mpsc::Receiver<SttEvent> {
        self.event_rx.take().expect("events() called twice")
    }

    async fn close(self: Box<Self>) -> anyhow::Result<()> {
        // Dropping self.frame_tx closes the channel, which the driver task
        // sees as a signal to send the WS close frame.
        Ok(())
    }
}

async fn driver_task(
    mut ws: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    mut frame_rx: mpsc::Receiver<Vec<u8>>,
    event_tx: mpsc::Sender<SttEvent>,
    channel: AudioChannel,
) {
    loop {
        tokio::select! {
            // Outgoing audio.
            Some(bytes) = frame_rx.recv() => {
                // tungstenite 0.24 Message::Binary takes Vec<u8> (not bytes::Bytes).
                let msg = Message::Binary(bytes);
                if let Err(e) = ws.send(msg).await {
                    let _ = event_tx.send(SttEvent::Error {
                        reason: format!("send: {e}"),
                        channel,
                    }).await;
                    break;
                }
            }
            // Incoming Deepgram messages.
            Some(msg) = ws.next() => {
                match msg {
                    Ok(Message::Text(json)) => {
                        if let Some(ev) = parse_deepgram_message(&json, channel) {
                            if event_tx.send(ev).await.is_err() {
                                break;
                            }
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Ok(_) => {} // ignore ping/pong/binary
                    Err(e) => {
                        let _ = event_tx.send(SttEvent::Error {
                            reason: format!("ws: {e}"),
                            channel,
                        }).await;
                        break;
                    }
                }
            }
            else => break,
        }
    }
    // Send Close frame and exit.
    let _ = ws.close(None).await;
    let _ = event_tx.send(SttEvent::Closed { channel }).await;
}

#[derive(Deserialize)]
struct DgRoot {
    is_final: Option<bool>,
    channel: Option<DgChannel>,
    start: Option<f64>,
    duration: Option<f64>,
}

#[derive(Deserialize)]
struct DgChannel {
    alternatives: Vec<DgAlternative>,
}

#[derive(Deserialize)]
struct DgAlternative {
    transcript: String,
}

fn parse_deepgram_message(json: &str, channel: AudioChannel) -> Option<SttEvent> {
    let root: DgRoot = serde_json::from_str(json).ok()?;
    let alts = root.channel.as_ref()?.alternatives.as_slice();
    let text = alts.first().map(|a| a.transcript.clone()).unwrap_or_default();
    if text.is_empty() {
        return None;
    }
    let is_final = root.is_final.unwrap_or(false);
    if is_final {
        let start_ms = (root.start.unwrap_or(0.0) * 1000.0) as u64;
        let end_ms = start_ms + (root.duration.unwrap_or(0.0) * 1000.0) as u64;
        Some(SttEvent::Final {
            text,
            channel,
            start_ms,
            end_ms,
        })
    } else {
        Some(SttEvent::Interim { text, channel })
    }
}
