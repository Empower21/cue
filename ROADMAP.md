# Roadmap

## Plan 1: Foundation (this plan)

- [x] Monorepo setup
- [x] Tauri 2 shell with transparent overlay
- [x] Screen-share invisibility (mac + win)
- [x] Global hotkey toggle
- [x] Minimal React UI shell with ModeSelector skeleton

## Plan 2: Intelligence (next)

- [ ] Rust audio capture (CoreAudio Tap on mac, WASAPI loopback on win)
- [ ] WebRTC VAD pre-filter
- [ ] Dual-channel separation
- [ ] Deepgram STT integration
- [ ] Anthropic streaming with HuggingFace fallback
- [ ] 4-tier prompt cache wiring
- [ ] Question detector (Auto mode)
- [ ] Three modes: Listen / Ask / Auto
- [ ] Context loader (JD + resume)
- [ ] Settings panel

## Plan 3: Distribution

- [ ] Next.js 15 marketing site (`apps/web`)
- [ ] Vercel deployment with `vercel.ts`
- [ ] OS-detected download flow
- [ ] Personal-Use EULA + first-run consent
- [ ] GitHub Releases CI
- [ ] macOS code-signing + notarization
- [ ] Tauri auto-updater

## Post-MVP backlog

1. Local Whisper.cpp STT (privacy upgrade)
2. Process-name masquerading (Natively-style, opt-in)
3. Multi-provider STT (Groq, Whisper-cloud)
4. Multi-provider LLM (Gemini, OpenAI, local Ollama)
5. Session export (markdown notes → file/clipboard)
6. Custom prompt templates per use case
7. Optional cloud sync of settings
8. Mobile companion (iOS/Android — read-only viewer)
9. Windows code-signing certificate
10. Karat/Proctorio-grade evasion research
