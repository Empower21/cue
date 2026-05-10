# Architecture

Monorepo with two apps and one shared package:

- `apps/desktop` — Tauri 2 desktop app. Rust backend (audio, STT, LLM, overlay window control). React + Tailwind UI rendered in the Tauri webview.
- `apps/web` — Next.js 15 marketing site (added in Plan 3 — `cue-distribution`).
- `packages/shared` — TypeScript types and constants used by both apps.

## Desktop runtime layers

1. **Audio core (Rust)** — captures mic + system audio, runs WebRTC VAD, resamples to 16kHz mono PCM, emits frames on dedicated ring buffers.
2. **STT layer (Rust)** — `trait SttProvider` with two `SttSession`s per recording (one per channel); MVP impl: Deepgram WebSocket streaming.
3. **Transcript bus** — append-only stream of utterance events tagged `{channel: "mic" | "system"}`, forwarded zero-copy via `tauri::ipc::Channel` to the React UI.
4. **LLM layer (Rust)** — Anthropic Messages API streaming primary; HuggingFace Inference API fallback on 5xx/429/timeout.
5. **Question detector (Rust)** — sliding-window classifier feeding the LLM layer in Auto mode.
6. **Overlay window (Tauri + React)** — transparent, always-on-top, screen-share-excluded, draggable, hotkey-toggled.
7. **Config store** — TOML at `~/.cue/config.toml` (Linux: `~/.config/cue/config.toml`).

## Why Tauri (not Electron)

- ~10× smaller binary (8–15 MB vs 80–150 MB Electron)
- Native Rust audio without a NAPI bridge
- Cleaner OS-level fingerprint for the screen-share-invisible posture

For the full design rationale, audio capture deep-dive, and prompt cache strategy, see `docs/superpowers/specs/2026-05-09-cue-design.md`.
