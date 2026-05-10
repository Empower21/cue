//! Sliding-window question detector for Auto mode.
//!
//! Three-stage classifier over the last 5 seconds of system-channel transcript:
//!   1. Punctuation: window contains `?`
//!   2. Interrogative regex: starts with what/how/why/when/where/who/can/...
//!   3. Haiku 4.5 classifier (cheap fallback for ambiguous text >50 chars)
//!
//! After a trigger, suppress further triggers for 3 seconds.

use std::time::{Duration, Instant};

pub struct QuestionDetector {
    last_trigger: Option<Instant>,
    debounce: Duration,
}

impl Default for QuestionDetector {
    fn default() -> Self {
        Self {
            last_trigger: None,
            debounce: Duration::from_secs(3),
        }
    }
}

impl QuestionDetector {
    /// Returns `Some(question_text)` if the window contains a triggerable
    /// question and the debounce window has passed; `None` otherwise.
    pub fn evaluate(&mut self, window: &str) -> Option<String> {
        if let Some(t) = self.last_trigger {
            if t.elapsed() < self.debounce {
                return None;
            }
        }

        let trimmed = window.trim();
        if trimmed.is_empty() {
            return None;
        }

        if Self::stage_punctuation(trimmed) || Self::stage_interrogative(trimmed) {
            self.last_trigger = Some(Instant::now());
            return Some(trimmed.to_string());
        }

        // Stage 3 — Haiku classifier — is dispatched async in the session layer
        // for ambiguous text >50 chars. Returning None here means "stage 1+2 missed,
        // caller may invoke Haiku."
        None
    }

    fn stage_punctuation(text: &str) -> bool {
        text.contains('?')
    }

    fn stage_interrogative(text: &str) -> bool {
        let lower = text.to_ascii_lowercase();
        let first_token = lower.split_whitespace().next().unwrap_or("");
        matches!(
            first_token,
            "what"
                | "how"
                | "why"
                | "when"
                | "where"
                | "who"
                | "can"
                | "could"
                | "would"
                | "should"
                | "is"
                | "are"
                | "do"
                | "does"
                | "did"
                | "tell"
                | "describe"
                | "explain"
        )
    }

    pub fn note_trigger(&mut self) {
        self.last_trigger = Some(Instant::now());
    }
}
