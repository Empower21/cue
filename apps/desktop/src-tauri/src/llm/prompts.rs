//! 4-tier prompt cache builder.

use crate::llm::{LlmRequest, Mode};

const INTERVIEW: &str = include_str!("../prompts/interview.md");
const MEETING: &str = include_str!("../prompts/meeting.md");
const STUDY: &str = include_str!("../prompts/study.md");

pub fn system_prompt(mode: Mode) -> &'static str {
    match mode {
        Mode::Interview => INTERVIEW,
        Mode::Meeting => MEETING,
        Mode::Study => STUDY,
    }
}

/// Concatenate the user-pasted context blocks (JD + resume + role_context +
/// voice_sample) into one string. This is the L2 cache tier — pinned per
/// session, ephemeral 1-hour.
pub fn user_context_block(req: &LlmRequest) -> String {
    let mut s = String::new();
    if let Some(jd) = req.job_description.as_deref().filter(|x| !x.is_empty()) {
        s.push_str("## Job description\n");
        s.push_str(jd);
        s.push_str("\n\n");
    }
    if let Some(r) = req.resume.as_deref().filter(|x| !x.is_empty()) {
        s.push_str("## Candidate resume\n");
        s.push_str(r);
        s.push_str("\n\n");
    }
    if let Some(c) = req.role_context.as_deref().filter(|x| !x.is_empty()) {
        s.push_str("## Role context\n");
        s.push_str(c);
        s.push_str("\n\n");
    }
    if let Some(v) = req.voice_sample.as_deref().filter(|x| !x.is_empty()) {
        s.push_str("## Voice & tone reference (the candidate's own writing)\n");
        s.push_str("Match the cadence, vocabulary, hedging, and idioms in this sample. Do not copy phrases verbatim — internalise the *voice*. Avoid sounding more formal or more buzzword-heavy than the sample.\n\n");
        s.push_str(v);
        s.push_str("\n\n");
    }
    s.trim().to_string()
}

pub fn rolling_transcript(req: &LlmRequest) -> String {
    let mut s = String::new();
    for turn in &req.transcript_window {
        s.push_str(&format!("[{}] {}\n", turn.channel, turn.text));
    }
    s.trim().to_string()
}

/// Returns a one-line directive instructing the model to respond in the user's
/// preferred language. Empty string when language is unset or already English.
pub fn language_directive(req: &LlmRequest) -> String {
    let Some(code) = req.language.as_deref().filter(|x| !x.is_empty()) else {
        return String::new();
    };
    let name = language_name(code);
    if code.starts_with("en") {
        return String::new();
    }
    format!("Respond in {name}. The transcript may be in any language; your answer must be in {name}.")
}

fn language_name(code: &str) -> &'static str {
    match code.split('-').next().unwrap_or(code) {
        "es" => "Spanish",
        "fr" => "French",
        "zh" => "Mandarin Chinese",
        "hi" => "Hindi",
        "ar" => "Arabic",
        "it" => "Italian",
        "de" => "German",
        "nl" => "Dutch",
        _ => "English",
    }
}
