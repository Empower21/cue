//! Browser-side persistence for the web copilot. Mirrors the desktop's
//! ~/.cue/config.toml but lives in localStorage. Keys are scoped so we can add
//! more later without colliding with marketing-site state.

import type { Language } from '@cue/shared';

/// What cue should pretend to be when crafting a response. Each value maps
/// to a different system prompt on the server (see /api/ask/route.ts).
/// Default is "interview" because that was the original launch persona.
export type CopilotPurpose = 'interview' | 'meeting' | 'study';

export interface WebCopilotConfig {
  jd?: string;
  resume?: string;
  roleContext?: string;
  voiceSample?: string;
  deepgramKey?: string;
  anthropicKey?: string;
  language?: Language;
  /// Mic capture toggle. Persisted — defaults to ON for a fresh user.
  captureMic?: boolean;
  /// Persona: interview / meeting / study. Persisted across sessions so
  /// users who almost always use it for one purpose don't have to re-pick.
  purpose?: CopilotPurpose;
  /// System audio toggle is INTENTIONALLY NOT PERSISTED — it resets to OFF
  /// on every page load. Reason: screen share triggers Chrome's "Meeting
  /// detected" overlay and a system-wide share picker, and wakes up browser
  /// extensions like Otter AI / Fathom / Read.ai. Forcing a deliberate
  /// click-to-enable per session prevents "wait, why is my screen being
  /// shared?" surprises after a reload. Lives in component state, not here.
}

/// Clear everything the user pastes/uploads in the Context drawer, keeping
/// API keys + language. Mirrors the desktop's "Also clear pasted Job
/// Description, Resume, Role/Company" checkbox on the End Session modal.
export function clearContextOnly() {
  if (typeof window === 'undefined') return;
  const current = loadConfig();
  const next: WebCopilotConfig = {
    ...current,
    jd: '',
    resume: '',
    roleContext: '',
    voiceSample: '',
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

const STORAGE_KEY = 'cue.web.copilot.v1';

export function loadConfig(): WebCopilotConfig {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const cfg = parsed as WebCopilotConfig & { captureSystem?: boolean };
    // Migration: prior versions persisted captureSystem. Always strip it on
    // load so a stale `true` from before this change doesn't auto-enable
    // screen share on first paint.
    if ('captureSystem' in cfg) {
      delete cfg.captureSystem;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    }
    return cfg;
  } catch {
    return {};
  }
}

export function saveConfig(partial: Partial<WebCopilotConfig>) {
  if (typeof window === 'undefined') return;
  const current = loadConfig();
  const next = { ...current, ...partial };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearConfig() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
