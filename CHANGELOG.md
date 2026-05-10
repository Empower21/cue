# Changelog

All notable changes to cue will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
