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

/// Concatenate the user-pasted context blocks (JD + resume + role_context) into
/// one string. This is the L2 cache tier — pinned per session, ephemeral 1-hour.
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
    s.trim().to_string()
}

pub fn rolling_transcript(req: &LlmRequest) -> String {
    let mut s = String::new();
    for turn in &req.transcript_window {
        s.push_str(&format!("[{}] {}\n", turn.channel, turn.text));
    }
    s.trim().to_string()
}
