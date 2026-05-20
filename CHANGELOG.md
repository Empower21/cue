# Changelog

All notable changes to cue will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Voice/tone matching**: Context tab now accepts a writing sample via paste or `.txt` / `.md` / `.docx` / `.pdf` upload (native Tauri dialog → Rust extract on desktop, `/api/voice-sample` on web). Stored as `voice_sample` in config and pinned in the L2 prompt-cache tier so Claude matches the user's vocabulary and cadence at zero per-question cost.
- **Manual Answer button**: one-click answer to the last detected question, available in every mode (no longer Auto-only).
- **Screenshot capture**: `capture_screen` command (`xcap` cross-platform) + `ask_with_image` vision path on desktop; `getDisplayMedia` frame grab + base64 PNG on web. Useful for live coding interviews where the question is on-screen.
- **i18n in 9 languages** (English / Español / Français / 中文 / हिन्दी / العربية / Italiano / Deutsch / Nederlands). Translations live in `packages/shared/src/i18n/*.json`, consumed by both desktop and web via `react-i18next`. RTL handled for Arabic. The chosen language is forwarded to Deepgram (STT language code) and into Claude's system prompt (response language directive).
- **Web copilot at `/app`**: Parakeet-style browser experience. Mic via `getUserMedia`, system audio via `getDisplayMedia` (Chrome/Edge desktop + Android), Deepgram WebSocket per channel, Anthropic streaming proxied through an Edge route. Mobile-responsive; installable as a PWA via `manifest.webmanifest`. Falls back to mic-only gracefully on Safari/iOS.
- Plan 2 (`intelligence-complete`): dual-channel audio capture (mic + system loopback) with WebRTC VAD, Deepgram streaming STT with channel-tagged transcripts, Claude Sonnet 4.6 streaming with HuggingFace Mistral-7B-Instruct fallback (8s first-token timeout), three operating modes (Listen / Ask / Auto), JD + resume context loader, Settings panel for API keys, sliding-window question detector for Auto mode.
- Foundation: monorepo workspace, Tauri 2 shell, transparent overlay window
- Screen-share invisibility on macOS (`NSWindow.sharingType = .none`) and Windows (`WDA_EXCLUDEFROMCAPTURE`)
- Global hotkey toggle (`Cmd/Ctrl + \`)
- Minimal React UI shell with mode selector

### Notes
- Release MSI built 2026-05-10 with placeholder API keys. Acceptance smoke test requires:
  1. Sign up for Deepgram (https://deepgram.com — free tier ~$200 credit), paste key into Settings
  2. Set `CUE_ANTHROPIC_KEY` and `CUE_HF_TOKEN` env vars before running `pnpm build` to bake real values
  3. Walk the 7-step acceptance test documented in plan Task 14.1

## [0.1.0] - TBD

Initial alpha release. Foundation only — audio and LLM features land in 0.2.0.
