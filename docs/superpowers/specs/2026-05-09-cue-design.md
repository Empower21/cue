---
title: cue — AI Co-pilot Desktop Overlay (Design)
date: 2026-05-09
codename: cue
status: draft
author: Alicia Graham (AMDR-Ent Corp)
---

# cue — AI Co-pilot Desktop Overlay

A real-time AI co-pilot for interview prep, study sessions, and meeting note-taking. Runs as a transparent desktop overlay on macOS 14.4+ (Sonoma) and Windows 10 2004+. Captures the user's microphone and system audio, transcribes via Deepgram, and streams contextual answers via Claude Sonnet 4.6 with HuggingFace Mistral-7B as fallback. Personal, non-commercial use only.

---

## 1. Product summary

### 1.1 Goals (MVP)

1. Capture both the user's mic and system audio with **channel separation preserved** (free speaker diarization, no ML model required).
2. Stream transcripts via Deepgram, with a Rust trait abstraction for swapping providers later (Groq, Whisper-cloud, local Whisper.cpp).
3. Stream LLM answers via Claude Sonnet 4.6 with HuggingFace Mistral-7B-Instruct fallback on Anthropic 5xx/429.
4. Three operating modes: **Listen** (passive notes), **Ask** (manual question), **Auto** (real-time question detection + answer streaming).
5. Screen-share invisibility through documented OS APIs (`NSWindow.sharingType = .none` on macOS; `WDA_EXCLUDEFROMCAPTURE` on Windows).
6. Global hotkey (`Cmd/Ctrl + \`) to show/hide overlay.
7. Session-pinned context (job description, resume, role profile) using Anthropic 4-tier prompt cache breakpoints.
8. Vercel-hosted marketing site with OS-detected download routing and a Personal-Use EULA.
9. Tauri auto-updater backed by GitHub Releases.

### 1.2 Non-goals (MVP)

- Payments, accounts, telemetry, analytics
- Process-name masquerading (Natively-style binary renaming) — punted to post-MVP, opt-in
- Mobile clients
- Cloud-synced settings
- Karat / Proctorio-grade anti-detection
- Windows code-signing (deferred; SmartScreen click-through accepted)

### 1.3 Audience and intent

A single individual (the project owner) using `cue` on their own machines for interview practice, personal study, and notes on meetings they participate in. The Vercel site exists primarily to host installers across the user's own devices and serve as a portfolio piece, not as a commercial distribution channel.

---

## 2. Legal and risk posture

### 2.1 AMDR-Ent Corp exposure

- AMDR is the domain registrant for the Vercel deployment but **not** the developer-of-record on the signed binary. The macOS code-signing certificate will be issued under the user's **personal** Apple ID, keeping AMDR off the binary's `Info.plist` author field.
- The EULA explicitly disclaims AMDR-Ent Corp from end-user actions.
- Marketing copy is written as "AI co-pilot for interview prep & meeting notes" — language that would trigger Vercel's Acceptable Use Policy ("evade detection," "cheat undetected") is excluded.

### 2.2 End-user exposure

Users are responsible for compliance with:

- **Federal wiretap law** (18 USC §2511; generally one-party consent — recording a meeting you participate in is federally legal).
- **State two-party-consent laws**: California (Penal §632), Florida (§934.03), Illinois (720 ILCS 5/14), Maryland, Massachusetts, Montana, New Hampshire, Pennsylvania, Washington. Hybrid: Connecticut, Delaware, Oregon, Vermont.
- **International equivalents** outside the US (EU GDPR + national wiretap laws; Canadian PIPEDA + Criminal Code §184).
- **Platform Terms of Service** for Zoom, Google Meet, Microsoft Teams, HireVue, Karat, CodeSignal, Proctorio, etc.
- **Employment / academic integrity codes**.

This compliance language is surfaced at first install (consent dialog before audio capture activates) and on the `/eula` page.

### 2.3 Data handling

- **Audio**: processed locally for VAD and resampling, then streamed to Deepgram for STT. Audio is not persisted by `cue`. Deepgram's retention follows the user's account settings (default: zero-retention available on paid tiers).
- **Transcripts**: held in memory during a session. Optional local-file export is post-MVP.
- **LLM context**: JD/resume pinned in Anthropic prompt cache (provider-side, ephemeral 1-hour TTL). Cleared on logout, app quit, or manual clear.
- **No telemetry, no analytics, no remote logging.** This is enforced at build time — there are no analytics imports in the codebase.

---

## 3. Architecture

### 3.1 Top-level shape

A pnpm-workspaces monorepo with three packages:

- `apps/desktop` — Tauri shell, Rust backend, React UI
- `apps/web` — Next.js 15 App Router marketing site (Vercel deployment)
- `packages/shared` — release manifest schema, EULA constant, types shared across desktop and web

### 3.2 Desktop runtime layers

```
+------------------------------------------------------------+
|  React UI (Vite + Tailwind)                                |
|  Overlay window, panels, mode selector, settings           |
+--------------------------+---------------------------------+
                           | tauri::ipc::Channel
                           |
+--------------------------v---------------------------------+
|  Rust core (src-tauri/src/)                                |
|                                                            |
|  audio/ ------> stt/ -------> transcript bus ---> ui       |
|     |              |               |                       |
|     |              v               v                       |
|     |          provider        question_detector           |
|     |          abstraction         |                       |
|     |                              v                       |
|     +-------------------------> llm/ -----> ui (stream)    |
|                                  |                         |
|                                  +-> anthropic / hf        |
|                                                            |
|  overlay/ (window invisibility + hotkeys)                  |
|  config/  (~/.cue/config.toml)                             |
+------------------------------------------------------------+
```

Layers, top to bottom:

1. **Audio core** — captures mic + system audio in parallel, runs VAD, resamples to 16 kHz mono PCM, emits frames on dedicated `mic_buffer` and `system_buffer` ring buffers.
2. **STT layer** — `trait SttProvider` with two `SttSession`s per recording (one per channel); MVP impl: Deepgram WebSocket streaming.
3. **Transcript bus** — append-only stream of utterance events, each tagged with `channel: "mic" | "system"` and timestamps. Forwarded zero-copy via `tauri::ipc::Channel` to the React UI.
4. **LLM layer** — Anthropic Messages API streaming primary; HuggingFace Inference API fallback on 5xx/429/timeout.
5. **Question detector** — sliding-window classifier feeding the LLM layer in Auto mode.
6. **Overlay window** — transparent, always-on-top, screen-share-excluded, draggable, hotkey-toggled.
7. **Config store** — TOML file at `~/.cue/config.toml` (Linux: `~/.config/cue/config.toml`); holds API keys, hotkeys, mode preferences, pinned JD/resume.

### 3.3 Web runtime layers

1. **Static landing** — Hero, Features, How-it-works, Download CTA. Server components by default; client components only for interactive elements.
2. **Download orchestrator** — UA-based OS detection on the server, displays the matching download button; the actual download is served via `/api/download/[platform]`.
3. **Auto-update manifest** — `/api/manifest` returns Tauri-updater-compatible JSON with version, release notes, publication date, and per-platform `{ url, signature }` pairs.
4. **EULA / changelog** — static MDX, sourced from files committed alongside the spec.

---

## 4. Audio capture pipeline

### 4.1 macOS (Sonoma 14.4+)

- **API**: `CoreAudio Tap` (introduced macOS 14.4 in March 2024, replacing the kernel-extension era). User-space, sandboxable.
- **Crate**: `screencapturekit-rs` (provides bridging to ScreenCaptureKit, which exposes the audio tap), with `objc2` fallbacks for niche calls.
- **Permission**: System Settings → Privacy & Security → Microphone, prompted on first run. Documented for the user with screenshots on `/install`.
- **Output**: separate `mic_buffer` and `system_buffer` ring buffers, each 16 kHz mono i16 PCM after resampling.

### 4.2 Windows (10 2004+)

- **API**: WASAPI loopback (`IAudioClient::Initialize` with `AUDCLNT_STREAMFLAGS_LOOPBACK`).
- **Crate**: `cpal` with the `wasapi` feature, plus `windows-rs` for the loopback flag.
- **Permission**: no special permission for system loopback; mic permission via standard Windows Microphone privacy setting.
- **Output**: same shape as macOS (16 kHz mono i16 PCM, two ring buffers).

### 4.3 Voice Activity Detection

- **Crate**: `webrtc-vad` (Rust binding to Google's WebRTC VAD).
- **Mode**: aggressive (mode 3), 30 ms frames.
- **Behavior**: only voiced frames forwarded to STT; emit a `silence` event after 800 ms of voiceless frames to mark utterance boundaries (this is what closes a Deepgram interim result into a final).

### 4.4 Channel separation guarantee

Mic and system buffers are kept fully separate up to the point of STT submission. Each Deepgram WebSocket connection serves exactly **one** channel — there are two STT connections per recording session. Final transcript events are tagged `{channel: "mic" | "system"}` so the UI renders "you" vs "them" without ML-based diarization.

---

## 5. Screen-share invisibility

### 5.1 macOS

- `NSWindow.sharingType = .none` — excludes the window from `CGWindowListCopyWindowInfo` queries, which is what AVFoundation and ScreenCaptureKit use to enumerate shareable surfaces.
- `NSWindow.collectionBehavior` includes `.canJoinAllSpaces`, `.stationary`, `.fullScreenAuxiliary` so the overlay survives Mission Control transitions and Space changes.
- `NSWindow.level = CGShieldingWindowLevel()` (a.k.a. `.screenSaver`) so the overlay sits above standard application windows.
- `NSWindow.isOpaque = false`, `backgroundColor = .clear` for transparent rendering.

### 5.2 Windows

- `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` (Windows 10 version 2004+).
- `WS_EX_TOOLWINDOW` to suppress taskbar entry and Alt-Tab inclusion.
- `SetWindowPos` with `HWND_TOPMOST`.
- Layered window with per-pixel alpha for transparency.

### 5.3 Acknowledged limitations

- `WDA_EXCLUDEFROMCAPTURE` is bypassable by:
  - Hardware capture cards (HDMI passthrough)
  - Some screen-recording APIs that operate below the desktop window manager (third-party drivers)
  - OBS in specific capture modes
- These are documented OS guarantees; we do not extend them with hooks/shims in MVP.
- macOS `sharingType = .none` is bypassable in the same way (hardware capture is OS-level invisible to user-space apps).

---

## 6. STT pipeline

### 6.1 Provider abstraction

```rust
#[async_trait]
pub trait SttProvider: Send + Sync {
    async fn open(&self, channel: AudioChannel, config: SttConfig) -> Result<Box<dyn SttSession>>;
}

#[async_trait]
pub trait SttSession: Send {
    async fn submit(&mut self, frame: PcmFrame) -> Result<()>;
    fn events(&mut self) -> Pin<Box<dyn Stream<Item = SttEvent> + Send>>;
    async fn close(self: Box<Self>) -> Result<()>;
}

pub enum SttEvent {
    Interim { text: String, channel: AudioChannel },
    Final { text: String, channel: AudioChannel, start_ms: u64, end_ms: u64 },
    Error { reason: String },
}
```

### 6.2 Deepgram impl (MVP)

- Endpoint: `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=300`
- Auth: `Authorization: Token <user-supplied API key>` (BYO key — not bundled with the app)
- Two simultaneous WebSocket connections per session (mic + system)
- Final transcripts emit `SttEvent::Final`; interim transcripts emit `SttEvent::Interim` so the UI shows live-typing transcription

### 6.3 Failure handling

- Connection drops: exponential backoff with jitter, max 5 retries, then surface error
- 401: surface as "Deepgram key invalid" in Settings, halt audio submission
- 429: pause submission for 30s, show non-blocking notice in UI

### 6.4 Future providers (post-MVP)

- `GroqProvider` — Whisper-large-v3 hosted on Groq
- `WhisperCloudProvider` — OpenAI Whisper API
- `WhisperLocalProvider` — Whisper.cpp `tiny.en` model bundled with the installer (~39 MB), runs entirely on-device

---

## 7. LLM pipeline

### 7.1 Provider abstraction

```rust
#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn stream(&self, request: LlmRequest) -> Result<Pin<Box<dyn Stream<Item = LlmEvent> + Send>>>;
}

pub enum LlmEvent {
    Token { text: String },
    Done { stop_reason: StopReason, usage: Usage },
    Error { reason: String },
}
```

- Primary: `AnthropicProvider` (Claude Sonnet 4.6 — model id `claude-sonnet-4-6`)
- Fallback: `HuggingFaceProvider` (`mistralai/Mistral-7B-Instruct-v0.3` via the `Amdrautomate` HF account)

**API key sourcing (single-user personal-use posture):**

- The user's existing Anthropic key (already in their environment for the broader AMDR stack) is bundled at build time via a `.env.production` not committed to git, baked into a compiled-in default. This means a fresh install works out-of-the-box for the user without requiring them to paste the key into Settings on every machine.
- The Settings panel exposes an "Override key" field that takes precedence over the compiled default. Useful for testing alternate keys, and a soft kill-switch (paste a wrong key to disable Anthropic and force HF fallback).
- Deepgram, by contrast, is **always BYO** — Deepgram bills per audio-second and a leaked compiled-in key would empty the user's account quickly. The first-run setup wizard prompts for the Deepgram key.
- The HuggingFace token is similarly compiled in (the `Amdrautomate` account), since HF inference API for Mistral-7B is rate-limited rather than per-token-billed.

### 7.2 Prompt structure (4-tier cache breakpoints)

The Anthropic prompt is constructed with explicit `cache_control: { type: "ephemeral" }` markers at four breakpoints:

| Tier | Content | TTL | Source |
|------|---------|-----|--------|
| L1 | System prompt — assistant role per mode (interview / meeting / study) | 1 hour | `prompts/<mode>.md` |
| L2 | User-provided context — JD, resume, role/seniority, company name | 1 hour | `ContextLoader` modal, persisted in `config.toml` |
| L3 | Last ~10 transcript turns, channel-tagged | 5 minutes | rolling buffer |
| L4 | Live trigger — manual question (Ask) or auto-detected question (Auto) | none | per-call |

L2 is the highest-leverage cache: pinning the JD + resume once at session start avoids re-uploading multi-thousand-token context on every question.

### 7.3 Streaming

- Anthropic Server-Sent Events → Tauri channel → React `useStreamingAnswer` hook
- Render incremental tokens with markdown support (code blocks, tables, lists, inline code)

### 7.4 Fallback behavior

- Triggered on Anthropic `5xx`, `429` (after one retry), or local timeout > 8s before first token
- HF call: `https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3` with token from config
- UI displays a small "Fallback model" indicator so the user knows quality is degraded

---

## 8. Question detection (Auto mode)

### 8.1 Trigger surface

- Sliding 5-second window over recent **system-channel** transcript only (we want THEIR questions, not ours)
- Update on every Deepgram `is_final = true` event for the system channel

### 8.2 Three-stage classifier

1. **Punctuation**: window contains `?`. → trigger.
2. **Interrogative regex**: window starts with or contains `what|how|why|when|where|who|can you|could you|would you|tell me about|describe|explain`. → trigger.
3. **Haiku classifier**: ambiguous cases (Stage 1 and 2 both miss but window length > 50 chars). Send to Claude Haiku 4.5 with cached system prompt: *"Return YES if the speaker is asking a question that warrants a substantive answer. Otherwise NO. Window: <text>"*. ~40 input tokens, single-token output. Negligible cost.

### 8.3 Debouncing

- After a trigger, suppress further triggers for 3 seconds (avoids re-firing on a question split across packets)
- Ignore the mic channel — the use case is answering THEM, not ourselves

---

## 9. UI / UX

### 9.1 Overlay window

- Default size: **360 × 480**, minimum **280 × 360**
- Position: top-right by default; draggable; persists last position in `config.toml`
- Transparent background with subtle backdrop blur (rendered by webview, not OS — gives consistent visual across platforms)
- Drag handle: entire window header area
- Keyboard:
  - `Cmd/Ctrl + \` — show/hide
  - `Esc` — hide
  - `Cmd/Ctrl + Enter` — submit Ask query
  - `Cmd/Ctrl + L` / `M` / `A` — switch to Listen / Mic mute / Auto mode

### 9.2 Three modes

- **Listen** — streams transcript only, no LLM calls; cheapest mode
- **Ask** — text input + voice-input toggle; user submits a question manually
- **Auto** — question detector active; surfaced answers stream into AnswerCards as they arrive

### 9.3 Components

- `OverlayPanel` — root container, drag + transparency
- `TranscriptStream` — channel-tagged transcript with "you" / "them" indicators
- `AnswerCard` — markdown-rendered streaming answer with copy button + dismiss
- `ModeSelector` — three-position toggle
- `ContextLoader` — modal for pasting JD, resume, role
- `SettingsPanel` — API keys, hotkey rebinding, model selection (post-MVP)

---

## 10. Marketing site (apps/web)

### 10.1 Stack

- Next.js 15 App Router
- Tailwind CSS
- **`vercel.ts`** for project configuration — the new TypeScript-native config format that replaces `vercel.json` (per the 2026 Vercel knowledge update)
- Deployed to a new Vercel project under `amdrentcorp-5032s-projects`
- Suggested project name: `cue-web`. Suggested domain: `usecue.io` or `trycue.app` (procure separately; do not use `amdrautomate.ai` subdomain — keeps the brand firewall intact)

### 10.2 Pages

| Path | Purpose |
|------|---------|
| `/` | Landing — Hero, Features, How-it-works, Download CTA |
| `/download` | Server-side UA-detect → display matching download button |
| `/eula` | Personal-Use License (full text, also bundled with installer) |
| `/changelog` | Version history pulled from `packages/shared/CHANGELOG.md` |
| `/api/download/[platform]` | 302 redirect to GitHub Releases asset URL (consistent download domain; download counters in future) |
| `/api/manifest` | Tauri-updater-compatible JSON: `{ version, notes, pub_date, platforms: { "darwin-aarch64": { url, signature }, "windows-x86_64": { url, signature } } }` |

### 10.3 Marketing copy posture

- Hero: **"Your AI co-pilot for interviews and meetings."**
- Sub: **"Real-time notes, contextual answers, all on your device."**
- Features list emphasizes **prep**, **note quality**, and **personal productivity**
- **Excluded language**: "undetected," "cheat," "evade," "stealth," "invisible to bosses/proctors," "hide from screen-share." Replace with: "minimalist overlay," "private workspace," "doesn't clutter your screen-share."
- This wording is what keeps Vercel's AUP comfortable and reduces the chance the page gets reported and deplatformed.

---

## 11. Distribution and signing

### 11.1 Build outputs

- **macOS**: `.dmg` (universal binary; arm64 + x86_64 lipo'd) and `.app.tar.gz` for the updater feed
- **Windows**: `.msi` (x86_64) and `.zip` for the updater feed

### 11.2 Signing

- **macOS**:
  - Developer ID Application certificate under user's **personal** Apple ID ($99/year)
  - Notarization via `xcrun notarytool submit` with stapling
  - Result: clean Gatekeeper experience on first launch (no right-click → Open required)
- **Windows**:
  - **MVP**: unsigned. SmartScreen warns; users click "More info" → "Run anyway"
  - **Post-MVP**: SSL.com EV cert (~$300/year) for clean install UX

### 11.3 Hosting

- **GitHub Releases**. Repository visibility (public vs private) is a user decision deferred to the implementation phase. If private, releases are still served via signed asset URLs that don't require auth — no source exposure. If public, source is visible but not a competitive secret (Cluely is closed but heavily reverse-engineered; Natively is fully open).
- Vercel `/api/download/[platform]` issues a 302 to the GitHub asset URL. Keeps the user-visible download domain consistent (cue-web.vercel.app or custom domain).

### 11.4 Auto-updater

- Tauri's built-in updater
- Pings `/api/manifest` weekly (or on app launch)
- Downloads + installs in-place with user confirmation
- Update signatures verified via Tauri's Ed25519 keypair (private key in CI secrets, public key compiled into binary)

---

## 12. Repository layout

```
cue/                                      # monorepo root
├── README.md                             # project overview, install, dev setup
├── LICENSE                               # personal-use EULA + jurisdiction warning
├── ARCHITECTURE.md                       # system diagram + data flow
├── ROADMAP.md                            # MVP cut + post-MVP backlog
├── CHANGELOG.md
├── .gitignore
├── pnpm-workspace.yaml
├── package.json                          # root scripts (dev, build, release)
│
├── apps/
│   ├── desktop/                          # Tauri app (Rust core + React UI)
│   │   ├── src-tauri/                    # Rust backend
│   │   │   ├── Cargo.toml
│   │   │   ├── tauri.conf.json
│   │   │   ├── build.rs
│   │   │   ├── icons/                    # .icns (mac) + .ico (win)
│   │   │   └── src/
│   │   │       ├── main.rs               # entry, window setup, IPC commands
│   │   │       ├── audio/
│   │   │       │   ├── mod.rs
│   │   │       │   ├── macos.rs          # CoreAudio Tap
│   │   │       │   └── windows.rs        # WASAPI loopback
│   │   │       ├── stt/
│   │   │       │   ├── mod.rs            # SttProvider trait
│   │   │       │   └── deepgram.rs
│   │   │       ├── llm/
│   │   │       │   ├── mod.rs            # LlmProvider trait
│   │   │       │   ├── anthropic.rs
│   │   │       │   └── huggingface.rs
│   │   │       ├── overlay/
│   │   │       │   ├── mod.rs
│   │   │       │   ├── macos.rs          # NSWindow sharingType + collectionBehavior
│   │   │       │   ├── windows.rs        # SetWindowDisplayAffinity
│   │   │       │   └── hotkeys.rs        # global shortcut registration
│   │   │       ├── prompts/
│   │   │       │   ├── interview.md
│   │   │       │   ├── meeting.md
│   │   │       │   └── study.md
│   │   │       ├── question_detector.rs
│   │   │       └── config.rs             # ~/.cue/config.toml
│   │   ├── src/                          # React + Tailwind UI
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── components/
│   │   │   │   ├── OverlayPanel.tsx
│   │   │   │   ├── TranscriptStream.tsx
│   │   │   │   ├── AnswerCard.tsx
│   │   │   │   ├── ModeSelector.tsx
│   │   │   │   ├── ContextLoader.tsx
│   │   │   │   └── SettingsPanel.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useTauriEvents.ts
│   │   │   │   ├── useHotkeys.ts
│   │   │   │   └── useStreamingAnswer.ts
│   │   │   ├── styles/
│   │   │   │   └── tailwind.css
│   │   │   └── types.ts
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── web/                              # Next.js 15 marketing site (Vercel)
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx                  # landing
│       │   ├── download/page.tsx
│       │   ├── eula/page.tsx
│       │   ├── changelog/page.tsx
│       │   └── api/
│       │       ├── download/[platform]/route.ts
│       │       └── manifest/route.ts
│       ├── components/
│       │   ├── Hero.tsx
│       │   ├── DownloadCTA.tsx
│       │   ├── Features.tsx
│       │   ├── HowItWorks.tsx
│       │   └── Footer.tsx
│       ├── public/
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── vercel.ts                     # vercel.ts (replaces vercel.json)
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── index.ts
│       │   ├── manifest.ts               # release manifest schema
│       │   └── eula.ts                   # EULA text constant
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/
│   ├── build-mac.sh                      # builds + signs .dmg
│   ├── build-win.ps1                     # builds .msi
│   └── release.sh                        # tags, builds both, uploads to GH releases
│
├── docs/
│   ├── superpowers/
│   │   └── specs/
│   │       └── 2026-05-09-cue-design.md  # this file
│   ├── AUDIO-CAPTURE.md                  # CoreAudio Tap + WASAPI deep-dive
│   ├── INVISIBILITY.md                   # screen-share evasion via OS APIs
│   ├── PROMPT-DESIGN.md                  # 4-tier cache strategy
│   ├── INSTALL.md                        # user-facing install guide
│   └── DEV-SETUP.md                      # contributor setup
│
└── .github/
    └── workflows/
        ├── ci.yml                        # lint + typecheck on PR
        └── release.yml                   # build + sign + upload on tag
```

---

## 13. Build sequence (preview for plan)

Detailed phasing happens in the implementation plan produced by the `superpowers:writing-plans` skill. Preview of the phases:

1. Repo + workspaces + tooling (pnpm, biome, husky, gitignore)
2. Tauri shell + transparent overlay window with hotkey on both platforms
3. Rust audio capture — macOS (CoreAudio Tap), then Windows (WASAPI)
4. Deepgram STT integration with the `SttProvider` trait
5. Anthropic LLM streaming with HuggingFace fallback and 4-tier prompt cache
6. Question detector + Auto mode wiring
7. UI: overlay shell, transcript stream, answer cards, mode selector
8. Settings: hotkey rebind, API keys, JD/resume context loader
9. Screen-share invisibility — both platforms
10. Marketing site (apps/web) on Vercel with `vercel.ts`
11. CI: build + sign + release on tag
12. EULA + first-run consent flow
13. Beta self-test pass

---

## 14. Open questions and risks

- **macOS notarization timing** — `notarytool` can take 2–15 minutes per build. Acceptable for releases; not for dev iteration. Dev builds are unsigned.
- **Deepgram cost at user volume** — at the user's stated personal-use volume the BYO-key model is fine. If per-month Deepgram spend gets uncomfortable, accelerate the Whisper.cpp local impl from post-MVP into MVP-1.
- **CoreAudio Tap permission UX** — first-run audio permission prompt may scare some users. Document the prompt in `/install` page screenshots with copy explaining what `cue` is asking for and why.
- **`WDA_EXCLUDEFROMCAPTURE` on Windows** — bypassable by some hardware capture and OBS in specific modes. Acknowledged limitation; documented in `INVISIBILITY.md`.
- **Auto-updater signature key management** — the Ed25519 private key for updater signatures must live in CI secrets. If it leaks, attackers can ship malicious updates to existing installs. Rotate quarterly; keep the public key compiled in.

---

## 15. Acceptance criteria

The MVP is "done" when all of:

1. Fresh-install flow completes end-to-end on a clean macOS Sonoma machine and a clean Windows 11 machine.
2. The user can start a Zoom call, share their screen, and the overlay does **not** appear in the shared video.
3. The user can paste a JD + resume, run a 10-minute mock interview against a friend, and receive useful answers in Auto mode.
4. Listen-mode transcript correctly attributes utterances to "you" vs "them" using channel separation.
5. An induced Anthropic outage (e.g., bad API key) triggers HuggingFace fallback within 8s, with a visible "Fallback model" UI indicator.
6. Auto-updater successfully delivers a `0.1.0 → 0.1.1` update on both platforms.
7. Marketing site loads in <1s on Vercel; EULA is reachable from the install flow and from `/eula`; `/api/manifest` returns a valid Tauri-updater payload.

---

*End of design.*
