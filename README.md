# cue

AI co-pilot for interview prep, study sessions, and meeting note-taking. Runs as a transparent desktop overlay on macOS 14.4+ and Windows 10 2004+.

**Status:** alpha — Foundation complete. Audio + LLM in progress.

## Features (target MVP)

- Real-time transcript via dual-channel audio capture (your mic + system audio kept separate)
- Streaming Claude Sonnet 4.6 answers with HuggingFace Mistral-7B fallback
- Three modes: Listen / Ask / Auto
- Screen-share invisibility via documented OS APIs
- Global hotkey toggle (`Cmd/Ctrl + \`)
- 4-tier prompt cache for low-cost session context

## Personal-use only

This project is a personal-productivity tool. You are responsible for compliance with local recording laws, two-party-consent statutes, and the terms of service of any meeting/interview/proctoring platform you use it with. See `LICENSE`.

## Quick start (developer)

```bash
pnpm install
pnpm dev          # launches Tauri dev build of apps/desktop
```

See `docs/DEV-SETUP.md` for full setup including platform-specific dependencies.

## Architecture

See `ARCHITECTURE.md` for the design overview, or `docs/superpowers/specs/2026-05-09-cue-design.md` for the full spec.

## Roadmap

See `ROADMAP.md`.
