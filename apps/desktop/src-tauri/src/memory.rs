//! Adaptive memory — cue learns from each use instead of staying static.
//!
//! Every completed Q&A is persisted to %APPDATA%\cue\memory.json (capped).
//! Future asks include the most recent entries for the active purpose, so the
//! model stays consistent with what it already told this user, avoids
//! repeating identical content, and builds on earlier answers when topics
//! recur across sessions.
//!
//! Privacy: this never leaves the machine except as part of the prompt the
//! user is already sending to their own LLM key.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    /// Purpose this was answered under: "interview" | "meeting" | "study".
    pub mode: String,
    pub q: String,
    pub a: String,
    /// Unix seconds when the answer completed.
    pub ts: u64,
}

/// Hard cap on stored entries — oldest are evicted first.
const MAX_ENTRIES: usize = 30;
/// Answers are stored truncated: enough to anchor consistency, small enough
/// that six of them don't crowd out the live transcript in the prompt.
const MAX_ANSWER_CHARS: usize = 600;
const MAX_QUESTION_CHARS: usize = 300;

fn memory_path() -> anyhow::Result<PathBuf> {
    let dir = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("could not resolve config dir"))?
        .join("cue");
    Ok(dir.join("memory.json"))
}

pub fn load() -> Vec<MemoryEntry> {
    let Ok(path) = memory_path() else {
        return Vec::new();
    };
    if !path.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Append one completed Q&A. Best-effort: failures are logged, never fatal —
/// memory is an enhancement, not a dependency.
pub fn append(mode: &str, q: &str, a: &str) {
    let q = truncate_chars(q.trim(), MAX_QUESTION_CHARS);
    let a = truncate_chars(a.trim(), MAX_ANSWER_CHARS);
    if q.is_empty() || a.is_empty() {
        return;
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut entries = load();
    entries.push(MemoryEntry { mode: mode.to_string(), q, a, ts });
    if entries.len() > MAX_ENTRIES {
        let excess = entries.len() - MAX_ENTRIES;
        entries.drain(..excess);
    }
    let write = || -> anyhow::Result<()> {
        let path = memory_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, serde_json::to_string_pretty(&entries)?)?;
        Ok(())
    };
    if let Err(e) = write() {
        log::warn!("memory: failed to persist entry: {e}");
    }
}

/// The `n` most recent entries for `mode`, oldest first (chronological order
/// reads naturally in the prompt).
pub fn recent(mode: &str, n: usize) -> Vec<MemoryEntry> {
    let mut out: Vec<MemoryEntry> = load()
        .into_iter()
        .filter(|e| e.mode == mode)
        .collect();
    if out.len() > n {
        out.drain(..out.len() - n);
    }
    out
}

/// Truncate on a char boundary (never split a multibyte char).
fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let cut: String = s.chars().take(max).collect();
    format!("{cut}…")
}
