# cue Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `cue` monorepo with a Tauri 2 desktop shell that opens a transparent, screen-share-invisible overlay window on `Cmd/Ctrl + \`. No audio, no AI yet — those are Plan 2 (`cue-intelligence`). This plan delivers the bones: directory structure, all scaffolding `.md` files, working Tauri build, working hotkey, working invisibility.

**Architecture:** pnpm-workspace monorepo with `apps/desktop` (Tauri 2 + React 18 + Vite + Tailwind) and `packages/shared` (TypeScript types + EULA constant). The desktop app wraps a transparent always-on-top window using Tauri's `set_content_protected(true)` API, which calls `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on Windows and `NSWindow.sharingType = .none` on macOS. A global shortcut registered via `tauri-plugin-global-shortcut` toggles visibility.

**Tech Stack:** Rust 1.78+, Tauri 2.x, React 18, Vite 5, Tailwind CSS 3, TypeScript 5.4+, pnpm 9, Node.js 24 LTS.

---

## File structure (created by this plan)

```
cue/
├── .gitignore
├── README.md
├── LICENSE                              # Personal-use EULA
├── ARCHITECTURE.md
├── ROADMAP.md
├── CHANGELOG.md
├── pnpm-workspace.yaml
├── package.json                         # root scripts
├── tsconfig.base.json                   # shared TS config
│
├── apps/desktop/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── styles/tailwind.css
│   │   ├── components/OverlayPanel.tsx
│   │   ├── components/ModeSelector.tsx
│   │   └── hooks/useHotkey.ts
│   └── src-tauri/
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── build.rs
│       ├── icons/                       # placeholder PNGs for now
│       │   └── icon.png
│       ├── capabilities/
│       │   └── default.json
│       └── src/
│           ├── main.rs
│           ├── lib.rs
│           ├── overlay/
│           │   ├── mod.rs
│           │   ├── window.rs
│           │   └── hotkeys.rs
│           └── config.rs
│
├── packages/shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── manifest.ts
│       └── eula.ts
│
└── docs/
    ├── superpowers/
    │   ├── specs/2026-05-09-cue-design.md   # already exists
    │   └── plans/2026-05-09-cue-foundation.md  # this file
    ├── DEV-SETUP.md
    ├── AUDIO-CAPTURE.md                 # stub — populated by Plan 2
    ├── INVISIBILITY.md                  # full content (this plan implements it)
    ├── PROMPT-DESIGN.md                 # stub — populated by Plan 2
    └── INSTALL.md                       # stub — populated by Plan 3
```

---

## Task 1: Initialize monorepo + git

**Files:**
- Create: `cue/.gitignore`
- Create: `cue/pnpm-workspace.yaml`
- Create: `cue/package.json`
- Create: `cue/tsconfig.base.json`

- [ ] **Step 1.1: Create `.gitignore`**

```
# Dependencies
node_modules/
.pnpm-store/

# Build artifacts
dist/
target/
*.log

# Tauri
src-tauri/target/
src-tauri/gen/
src-tauri/Cargo.lock

# IDE
.vscode/
.idea/
*.swp

# Env
.env
.env.local
.env.production
.env.*.local

# OS
.DS_Store
ehthumbs.db
Thumbs.db

# Project
~/.cue/
```

- [ ] **Step 1.2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 1.3: Create root `package.json`**

```json
{
  "name": "cue",
  "version": "0.1.0",
  "private": true,
  "description": "AI co-pilot desktop overlay",
  "engines": {
    "node": ">=24",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev": "pnpm --filter @cue/desktop dev",
    "build": "pnpm --filter @cue/desktop build",
    "build:shared": "pnpm --filter @cue/shared build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "clean": "pnpm -r clean"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 1.4: Create root `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

- [ ] **Step 1.5: Init git, install root deps, commit**

Run from `cue/`:
```bash
git init -b main
pnpm install
git add .gitignore pnpm-workspace.yaml package.json tsconfig.base.json
git commit -m "chore: init monorepo workspace"
```

Expected: clean commit, no errors. `pnpm-lock.yaml` will be created — add it in the next commit.

---

## Task 2: Write scaffolding docs

**Files:**
- Create: `cue/README.md`
- Create: `cue/ARCHITECTURE.md`
- Create: `cue/ROADMAP.md`
- Create: `cue/CHANGELOG.md`
- Create: `cue/LICENSE`
- Create: `cue/docs/DEV-SETUP.md`
- Create: `cue/docs/AUDIO-CAPTURE.md` (stub)
- Create: `cue/docs/INVISIBILITY.md` (full)
- Create: `cue/docs/PROMPT-DESIGN.md` (stub)
- Create: `cue/docs/INSTALL.md` (stub)

- [ ] **Step 2.1: Create `README.md`**

```markdown
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
```

- [ ] **Step 2.2: Create `ARCHITECTURE.md`**

```markdown
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
```

- [ ] **Step 2.3: Create `ROADMAP.md`**

```markdown
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
```

- [ ] **Step 2.4: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to cue will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Foundation: monorepo workspace, Tauri 2 shell, transparent overlay window
- Screen-share invisibility on macOS (`NSWindow.sharingType = .none`) and Windows (`WDA_EXCLUDEFROMCAPTURE`)
- Global hotkey toggle (`Cmd/Ctrl + \`)
- Minimal React UI shell with mode selector

## [0.1.0] - TBD

Initial alpha release. Foundation only — audio and LLM features land in 0.2.0.
```

- [ ] **Step 2.5: Create `LICENSE` (Personal-Use EULA)**

```
cue Personal-Use License
Copyright (c) 2026 the cue contributors.

PERSONAL, NON-COMMERCIAL USE ONLY.

Permission is hereby granted, free of charge, to any individual obtaining a
copy of this software (the "Software") to use the Software for personal, non-
commercial purposes, subject to the following conditions:

1. COMPLIANCE WITH LAW. The user is solely responsible for ensuring that
   their use of the Software complies with all applicable laws, including
   but not limited to:

   (a) federal wiretap law (18 U.S.C. § 2511) and equivalent foreign
       statutes;

   (b) state, provincial, or national laws governing the recording of
       conversations, including two-party-consent jurisdictions such as
       California (Cal. Penal Code § 632), Florida (Fla. Stat. § 934.03),
       Illinois (720 ILCS 5/14), Maryland, Massachusetts, Montana, New
       Hampshire, Pennsylvania, and Washington (this list is illustrative,
       not exhaustive);

   (c) data-protection regulations such as the EU GDPR and Canadian PIPEDA.

2. PLATFORM TERMS OF SERVICE. The user is solely responsible for compliance
   with the terms of service of any communication, meeting, interview, or
   proctoring platform with which the Software is used, including but not
   limited to Zoom, Google Meet, Microsoft Teams, HireVue, Karat,
   CodeSignal, and Proctorio.

3. EMPLOYMENT AND ACADEMIC CODES. The user is solely responsible for
   compliance with the policies of their employer, prospective employer,
   educational institution, or examination authority, including academic
   integrity codes.

4. NO WARRANTY. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
   KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.

5. NO LIABILITY. IN NO EVENT SHALL THE AUTHORS, COPYRIGHT HOLDERS, OR
   AMDR-Ent Corp BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY,
   WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT
   OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   THE SOFTWARE.

6. NO COMMERCIAL USE. The Software may not be used for commercial purposes
   without the express written consent of the authors. "Commercial purposes"
   includes, without limitation, sale, rental, or leasing of the Software,
   integration into a paid product or service, or use within a for-profit
   enterprise's ordinary course of business.

By installing or running the Software, you acknowledge that you have read,
understood, and agree to these terms.
```

- [ ] **Step 2.6: Create `docs/DEV-SETUP.md`**

```markdown
# Dev setup

## Prerequisites

- **Rust 1.78+** — `https://rustup.rs/`
- **Node.js 24 LTS** — `https://nodejs.org/`
- **pnpm 9+** — `npm install -g pnpm`
- **Platform-specific Tauri prerequisites** — see https://tauri.app/start/prerequisites/

### macOS-specific

- Xcode Command Line Tools: `xcode-select --install`
- macOS 14.4+ (Sonoma) for `CoreAudio Tap` (lands in Plan 2; foundation works on 13+)

### Windows-specific

- Microsoft C++ Build Tools (via Visual Studio Installer or `vs_buildtools.exe`)
- WebView2 runtime (preinstalled on Windows 11; auto-installed by Tauri on 10)

## Install

```bash
git clone <repo>
cd cue
pnpm install
```

## Run dev build

```bash
pnpm dev
```

This launches the Tauri dev shell. The overlay opens automatically. Press `Cmd+\` (mac) or `Ctrl+\` (win) to toggle visibility. The dev build hot-reloads on UI changes; Rust changes trigger a recompile.

## Build release

```bash
pnpm build
```

Outputs to `apps/desktop/src-tauri/target/release/bundle/`.
```

- [ ] **Step 2.7: Create `docs/INVISIBILITY.md`** (full content — this plan implements the feature)

```markdown
# Screen-share invisibility

`cue` excludes its overlay window from screen-recording and screen-share APIs using documented OS-level mechanisms. This document explains the guarantee, the limitations, and the implementation.

## What it does

When you share your screen in Zoom / Google Meet / Microsoft Teams / OBS, the cue overlay window does **not** appear in the shared video. The overlay remains visible to you locally.

This is implemented via:

| OS | Mechanism | Notes |
|----|-----------|-------|
| macOS 12+ | `NSWindow.sharingType = .none` | Excludes from `CGWindowListCopyWindowInfo`. AVFoundation, ScreenCaptureKit, and CGDisplayStream all respect this. |
| Windows 10 2004+ | `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` | Built into the Desktop Window Manager. The window is composited locally but excluded from captures. |

In Tauri 2, both are abstracted behind a single API: `Window::set_content_protected(true)`. We call this in `overlay/window.rs` after window creation.

## What it does NOT do

These limitations are intentional — we ship documented OS APIs only, no hooks or driver-level shims:

1. **Hardware capture cards** (HDMI splitters, Elgato HD60, etc.) capture the entire DisplayPort/HDMI output below the OS compositor. Nothing user-space can hide from these.
2. **Some kernel-level recording drivers** operate below the desktop window manager.
3. **OBS in Display Capture mode** (some configurations) on Windows can bypass `WDA_EXCLUDEFROMCAPTURE` — Window Capture mode respects it.
4. **Screenshots taken via accessibility APIs** (`screencapture` CLI on macOS, `Win+Shift+S` on Windows) generally respect the OS exclusion, but third-party screenshot tools that hook the framebuffer may not.

If you need stronger guarantees against capture-card-level recording, that's a hardware problem, not a software problem.

## Verification

To verify invisibility on your platform:

1. Run `pnpm dev` to launch cue.
2. Press the global hotkey to show the overlay.
3. Open Zoom (or Meet, or Teams) and start a meeting alone.
4. Click "Share Screen" and select your entire desktop.
5. Open the meeting on a second device and look at the shared video.
6. The cue overlay should be absent from the shared feed but visible on your primary screen.
```

- [ ] **Step 2.8: Create stub docs**

`docs/AUDIO-CAPTURE.md`:

```markdown
# Audio capture

> **Stub.** Full content lands in Plan 2 (`cue-intelligence`). See `docs/superpowers/specs/2026-05-09-cue-design.md` Section 4 for the design.
```

`docs/PROMPT-DESIGN.md`:

```markdown
# Prompt design

> **Stub.** Full content lands in Plan 2 (`cue-intelligence`). See `docs/superpowers/specs/2026-05-09-cue-design.md` Section 7 for the 4-tier cache strategy.
```

`docs/INSTALL.md`:

```markdown
# Install

> **Stub.** End-user install guide lands in Plan 3 (`cue-distribution`). For developer setup, see `docs/DEV-SETUP.md`.
```

- [ ] **Step 2.9: Commit scaffolding docs**

```bash
git add README.md ARCHITECTURE.md ROADMAP.md CHANGELOG.md LICENSE docs/
git commit -m "docs: scaffolding (README, ARCHITECTURE, ROADMAP, CHANGELOG, LICENSE, dev/invisibility docs)"
```

---

## Task 3: Create `packages/shared`

**Files:**
- Create: `cue/packages/shared/package.json`
- Create: `cue/packages/shared/tsconfig.json`
- Create: `cue/packages/shared/src/index.ts`
- Create: `cue/packages/shared/src/manifest.ts`
- Create: `cue/packages/shared/src/eula.ts`

- [ ] **Step 3.1: Create `package.json`**

```json
{
  "name": "@cue/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 3.2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3.3: Create `src/manifest.ts`**

```typescript
export interface ReleasePlatform {
  url: string;
  signature: string;
}

export interface ReleaseManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: {
    'darwin-aarch64'?: ReleasePlatform;
    'darwin-x86_64'?: ReleasePlatform;
    'windows-x86_64'?: ReleasePlatform;
  };
}

export type ReleaseManifestPlatform = keyof ReleaseManifest['platforms'];
```

- [ ] **Step 3.4: Create `src/eula.ts`**

```typescript
export const EULA_VERSION = '1.0.0';

export const EULA_TEXT = `cue Personal-Use License

PERSONAL, NON-COMMERCIAL USE ONLY.

By installing or using this software you confirm that you have read,
understood, and agree to the terms in the LICENSE file. You acknowledge that
you are solely responsible for compliance with all applicable wiretap and
recording laws (including two-party-consent statutes), the terms of service
of any meeting, interview, or proctoring platform with which you use this
software, and any employer or academic integrity policies that apply to you.

The full license text is available in the LICENSE file shipped with the
installer.`;
```

- [ ] **Step 3.5: Create `src/index.ts`**

```typescript
export * from './manifest';
export * from './eula';
```

- [ ] **Step 3.6: Verify and commit**

Run from repo root:
```bash
pnpm install
pnpm --filter @cue/shared typecheck
```

Expected: typecheck passes with no errors.

```bash
git add packages/
git commit -m "feat(shared): release manifest types and EULA constants"
```

---

## Task 4: Bootstrap `apps/desktop` (Tauri 2 + React + Vite + Tailwind)

**Files:**
- Create: `cue/apps/desktop/package.json`
- Create: `cue/apps/desktop/vite.config.ts`
- Create: `cue/apps/desktop/tailwind.config.ts`
- Create: `cue/apps/desktop/postcss.config.js`
- Create: `cue/apps/desktop/tsconfig.json`
- Create: `cue/apps/desktop/index.html`
- Create: `cue/apps/desktop/src/main.tsx`
- Create: `cue/apps/desktop/src/App.tsx`
- Create: `cue/apps/desktop/src/styles/tailwind.css`

- [ ] **Step 4.1: Create `package.json`**

```json
{
  "name": "@cue/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "vite:dev": "vite",
    "vite:build": "tsc && vite build",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist src-tauri/target"
  },
  "dependencies": {
    "@cue/shared": "workspace:*",
    "@tauri-apps/api": "^2.1.1",
    "@tauri-apps/plugin-global-shortcut": "^2.0.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.4.5",
    "vite": "^5.4.10"
  }
}
```

- [ ] **Step 4.2: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
```

- [ ] **Step 4.3: Create `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cue: {
          bg: 'rgba(20, 20, 24, 0.85)',
          accent: '#7c5cff',
          text: '#e8e8ec',
          muted: '#9a9aa3',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4.4: Create `postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4.5: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../../packages/shared" }]
}
```

- [ ] **Step 4.6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>cue</title>
  </head>
  <body class="bg-transparent">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4.7: Create `src/styles/tailwind.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  margin: 0;
  background: transparent;
  user-select: none;
  -webkit-user-select: none;
  color: theme('colors.cue.text');
}
```

- [ ] **Step 4.8: Create `src/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/tailwind.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4.9: Create minimal `src/App.tsx` (real UI in Task 7)**

```typescript
export function App() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="text-cue-muted text-sm">cue • foundation</div>
    </div>
  );
}
```

- [ ] **Step 4.10: Install deps and verify**

Run from repo root:
```bash
pnpm install
pnpm --filter @cue/desktop typecheck
```

Expected: typecheck passes.

```bash
git add apps/desktop/
git commit -m "feat(desktop): bootstrap React + Vite + Tailwind shell"
```

---

## Task 5: Bootstrap Tauri 2 Rust backend

**Files:**
- Create: `cue/apps/desktop/src-tauri/Cargo.toml`
- Create: `cue/apps/desktop/src-tauri/build.rs`
- Create: `cue/apps/desktop/src-tauri/tauri.conf.json`
- Create: `cue/apps/desktop/src-tauri/capabilities/default.json`
- Create: `cue/apps/desktop/src-tauri/icons/icon.png` (1024×1024 placeholder)
- Create: `cue/apps/desktop/src-tauri/src/main.rs`
- Create: `cue/apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 5.1: Create `Cargo.toml`**

```toml
[package]
name = "cue"
version = "0.1.0"
description = "AI co-pilot desktop overlay"
edition = "2021"
rust-version = "1.78"

[lib]
name = "cue_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.1", features = ["macos-private-api", "tray-icon"] }
tauri-plugin-global-shortcut = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.41", features = ["full"] }
anyhow = "1.0"
thiserror = "2.0"
log = "0.4"
env_logger = "0.11"

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.5"
objc2-app-kit = { version = "0.2", features = ["NSWindow"] }
objc2-foundation = "0.2"

[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.58", features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_Graphics_Dwm",
] }

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

- [ ] **Step 5.2: Create `build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5.3: Create `tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2.0.0",
  "productName": "cue",
  "version": "0.1.0",
  "identifier": "io.cue.app",
  "build": {
    "beforeDevCommand": "pnpm vite:dev",
    "beforeBuildCommand": "pnpm vite:build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "label": "main",
        "title": "cue",
        "width": 360,
        "height": 480,
        "minWidth": 280,
        "minHeight": 360,
        "resizable": true,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "shadow": false,
        "visible": true,
        "x": 100,
        "y": 100
      }
    ],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "msi"],
    "icon": ["icons/icon.png"],
    "category": "Productivity",
    "shortDescription": "AI co-pilot for interviews and meetings",
    "longDescription": "Real-time notes and contextual answers in a minimalist overlay.",
    "copyright": "© 2026 the cue contributors"
  },
  "plugins": {
    "global-shortcut": {}
  }
}
```

**Note:** `macOSPrivateApi: true` is required to use the private CoreAnimation transparency API on macOS. This is a Tauri-supported flag, not a private SDK exploit. It is documented at https://tauri.app/reference/config/#macosprivateapi.

- [ ] **Step 5.4: Create `capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for the cue main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-content-protected",
    "core:window:allow-set-position",
    "core:window:allow-set-size",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-focus",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister",
    "global-shortcut:allow-is-registered"
  ]
}
```

- [ ] **Step 5.5: Create placeholder icon**

Place a 1024×1024 PNG at `apps/desktop/src-tauri/icons/icon.png`. For now, generate a flat-color square — actual icon design lands in Plan 3.

```bash
# Run from apps/desktop/src-tauri/icons/ — requires ImageMagick OR substitute any PNG
# If ImageMagick not installed, skip and use the Tauri CLI's icon generator after Step 5.7:
#   pnpm tauri icon path/to/source.png
mkdir -p .
convert -size 1024x1024 xc:'#7c5cff' icon.png 2>/dev/null || \
  printf 'PLACEHOLDER ICON — replace with real 1024x1024 PNG before release\n' > icon.png.TODO
```

If you don't have ImageMagick, just create any 1024×1024 PNG manually and save as `icon.png`. The Tauri CLI will reject builds without it.

- [ ] **Step 5.6: Create minimal `src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cue_lib::run();
}
```

- [ ] **Step 5.7: Create minimal `src/lib.rs` (real overlay setup in Task 6)**

```rust
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|_app| {
            log::info!("cue starting up");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5.8: Verify the dev build launches**

Run from repo root:
```bash
pnpm dev
```

Expected: a 360×480 transparent borderless window appears at (100, 100) showing "cue • foundation". The window stays on top of other apps. Close it with `Cmd+Q` (mac) or by killing the dev server (`Ctrl+C` in terminal).

If the build fails on a missing icon, replace `apps/desktop/src-tauri/icons/icon.png` with any valid 1024×1024 PNG and retry.

- [ ] **Step 5.9: Commit**

```bash
git add apps/desktop/src-tauri/
git commit -m "feat(desktop): bootstrap Tauri 2 Rust backend with transparent window"
```

---

## Task 6: Implement screen-share invisibility

**Files:**
- Create: `cue/apps/desktop/src-tauri/src/overlay/mod.rs`
- Create: `cue/apps/desktop/src-tauri/src/overlay/window.rs`
- Modify: `cue/apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 6.1: Create `overlay/mod.rs`**

```rust
pub mod window;
```

- [ ] **Step 6.2: Create `overlay/window.rs`**

```rust
use tauri::{Runtime, WebviewWindow, Window, WindowEvent};

pub fn configure_overlay<R: Runtime>(window: &WebviewWindow<R>) -> anyhow::Result<()> {
    // Cross-platform: enable content protection so the window is excluded
    // from screen-share on macOS (NSWindow.sharingType = .none) and on
    // Windows (SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)).
    window.set_content_protected(true)?;
    log::info!("content protection enabled (screen-share invisibility)");

    // Always on top, above standard application windows.
    window.set_always_on_top(true)?;

    // Hide from taskbar / dock to reduce visual fingerprint.
    window.set_skip_taskbar(true)?;

    #[cfg(target_os = "macos")]
    apply_macos_collection_behavior(window)?;

    #[cfg(target_os = "windows")]
    apply_windows_extended_style(window)?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_macos_collection_behavior<R: Runtime>(window: &WebviewWindow<R>) -> anyhow::Result<()> {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    let ns_window_ptr = window.ns_window()? as *mut NSWindow;
    if ns_window_ptr.is_null() {
        anyhow::bail!("ns_window pointer was null");
    }

    // Safety: Tauri guarantees the NSWindow is valid for the lifetime of the
    // tauri WebviewWindow. We retain to follow Cocoa ARC conventions.
    let ns_window: Retained<NSWindow> = unsafe { Retained::retain(ns_window_ptr) }
        .ok_or_else(|| anyhow::anyhow!("failed to retain NSWindow"))?;

    let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::IgnoresCycle;

    unsafe {
        ns_window.setCollectionBehavior(behavior);
    }

    log::info!("macOS collection behavior applied");
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_windows_extended_style<R: Runtime>(window: &WebviewWindow<R>) -> anyhow::Result<()> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
    };

    let hwnd = HWND(window.hwnd()?.0 as *mut _);
    if hwnd.0.is_null() {
        anyhow::bail!("hwnd was null");
    }

    // WS_EX_TOOLWINDOW removes the window from the taskbar and Alt-Tab.
    // (skip_taskbar already does this on most builds; we set it explicitly
    // for older Windows 10 versions where Tauri's flag is unreliable.)
    unsafe {
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current | WS_EX_TOOLWINDOW.0 as isize);
    }

    log::info!("Windows extended style applied (WS_EX_TOOLWINDOW)");
    Ok(())
}

pub fn handle_window_event<R: Runtime>(_window: &Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        // Foundation behavior: closing the X button hides instead of quitting.
        // Quit explicitly via the system tray (added in Plan 2) or Cmd+Q.
        api.prevent_close();
    }
}
```

- [ ] **Step 6.3: Update `src/lib.rs` to call `configure_overlay`**

Replace the entire contents:

```rust
mod overlay;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let main = app
                .get_webview_window("main")
                .ok_or_else(|| anyhow::anyhow!("main window missing"))?;

            overlay::window::configure_overlay(&main)?;
            log::info!("cue starting up");
            Ok(())
        })
        .on_window_event(|window, event| overlay::window::handle_window_event(window, event))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6.4: Verify build still launches**

```bash
pnpm dev
```

Expected: window still appears with the same layout. Logs in the terminal should include:
- `content protection enabled (screen-share invisibility)`
- `macOS collection behavior applied` (on mac) **or** `Windows extended style applied (WS_EX_TOOLWINDOW)` (on win)

- [ ] **Step 6.5: Manually verify invisibility (acceptance test)**

Per `docs/INVISIBILITY.md` Verification section:

1. Open Zoom (or Meet, or Teams) and start a meeting alone.
2. Click Share Screen and select your entire desktop.
3. Open the meeting on a second device (phone is fine) and look at the shared video.
4. The cue overlay should be ABSENT from the shared feed but VISIBLE on your primary screen.

If the overlay appears in the shared feed, check:
- macOS: confirm `app.macOSPrivateApi: true` in `tauri.conf.json` (without it, Tauri can't apply `sharingType = .none`)
- Windows: confirm Windows version is 10 2004+ (`winver` in Run dialog)

- [ ] **Step 6.6: Commit**

```bash
git add apps/desktop/src-tauri/src/
git commit -m "feat(overlay): screen-share invisibility via OS APIs (mac sharingType, win WDA_EXCLUDEFROMCAPTURE)"
```

---

## Task 7: Implement global hotkey toggle

**Files:**
- Create: `cue/apps/desktop/src-tauri/src/overlay/hotkeys.rs`
- Modify: `cue/apps/desktop/src-tauri/src/overlay/mod.rs`
- Modify: `cue/apps/desktop/src-tauri/src/lib.rs`
- Create: `cue/apps/desktop/src/hooks/useHotkey.ts` (frontend half — listens for visibility events)

- [ ] **Step 7.1: Create `overlay/hotkeys.rs`**

```rust
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const TOGGLE_SHORTCUT: &str = "CmdOrCtrl+Backslash";

pub fn register_default_hotkey<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    let app_handle = app.clone();
    let shortcut: Shortcut = TOGGLE_SHORTCUT.parse()?;

    app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_overlay_visibility(&app_handle);
        }
    })?;

    log::info!("global shortcut registered: {}", TOGGLE_SHORTCUT);
    Ok(())
}

fn toggle_overlay_visibility<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("toggle requested but main window missing");
        return;
    };

    match window.is_visible() {
        Ok(true) => {
            if let Err(e) = window.hide() {
                log::error!("failed to hide window: {e:?}");
            }
        }
        Ok(false) => {
            if let Err(e) = window.show().and_then(|()| window.set_focus()) {
                log::error!("failed to show window: {e:?}");
            }
        }
        Err(e) => log::error!("is_visible failed: {e:?}"),
    }
}
```

- [ ] **Step 7.2: Update `overlay/mod.rs`**

```rust
pub mod hotkeys;
pub mod window;
```

- [ ] **Step 7.3: Update `lib.rs` to register the hotkey**

Replace the `setup` closure body:

```rust
.setup(|app| {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| anyhow::anyhow!("main window missing"))?;

    overlay::window::configure_overlay(&main)?;
    overlay::hotkeys::register_default_hotkey(app.handle())?;

    log::info!("cue starting up");
    Ok(())
})
```

- [ ] **Step 7.4: Verify hotkey works**

```bash
pnpm dev
```

Expected:
- Window appears.
- Press `Cmd+\` (mac) or `Ctrl+\` (win) — window hides.
- Press again — window reappears with focus.
- Logs include `global shortcut registered: CmdOrCtrl+Backslash`.

- [ ] **Step 7.5: Create frontend `src/hooks/useHotkey.ts` (placeholder for Plan 2 wiring)**

```typescript
import { useEffect, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export function useOverlayVisibility() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      // Window focus changes correlate with show/hide via the global hotkey.
      // In Plan 2 we'll add explicit visibility events from the Rust side.
      if (focused) setVisible(true);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return visible;
}
```

- [ ] **Step 7.6: Commit**

```bash
git add apps/desktop/src-tauri/src/ apps/desktop/src/hooks/
git commit -m "feat(overlay): global hotkey CmdOrCtrl+Backslash toggles visibility"
```

---

## Task 8: Wire React UI shell with `OverlayPanel` + `ModeSelector`

**Files:**
- Create: `cue/apps/desktop/src/components/OverlayPanel.tsx`
- Create: `cue/apps/desktop/src/components/ModeSelector.tsx`
- Modify: `cue/apps/desktop/src/App.tsx`

- [ ] **Step 8.1: Create `ModeSelector.tsx`**

```typescript
import type { Dispatch, SetStateAction } from 'react';

export type Mode = 'listen' | 'ask' | 'auto';

interface ModeSelectorProps {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
}

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: 'listen', label: 'Listen' },
  { id: 'ask', label: 'Ask' },
  { id: 'auto', label: 'Auto' },
];

export function ModeSelector({ mode, setMode }: ModeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-md bg-black/30 p-1">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setMode(m.id)}
          className={
            'flex-1 rounded px-3 py-1 text-xs transition ' +
            (mode === m.id
              ? 'bg-cue-accent text-white'
              : 'text-cue-muted hover:text-cue-text')
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8.2: Create `OverlayPanel.tsx`**

```typescript
import { useState, type ReactNode } from 'react';
import { ModeSelector, type Mode } from './ModeSelector';

interface OverlayPanelProps {
  children?: ReactNode;
}

export function OverlayPanel({ children }: OverlayPanelProps) {
  const [mode, setMode] = useState<Mode>('listen');

  return (
    <div className="flex h-full w-full flex-col rounded-xl bg-cue-bg p-3 shadow-2xl backdrop-blur-md ring-1 ring-white/10">
      <header
        data-tauri-drag-region
        className="flex items-center justify-between pb-2 cursor-grab active:cursor-grabbing"
      >
        <span className="text-xs font-semibold tracking-wide text-cue-text">cue</span>
        <span className="text-[10px] text-cue-muted">⌘\</span>
      </header>

      <ModeSelector mode={mode} setMode={setMode} />

      <main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
        {children ?? (
          <div className="flex h-full items-center justify-center text-center text-xs text-cue-muted">
            <div>
              Foundation ready.
              <br />
              Audio + AI in Plan 2.
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 pt-2 text-[10px] text-cue-muted">
        Mode: <span className="text-cue-text">{mode}</span>
      </footer>
    </div>
  );
}
```

- [ ] **Step 8.3: Update `App.tsx`**

```typescript
import { OverlayPanel } from './components/OverlayPanel';

export function App() {
  return <OverlayPanel />;
}
```

- [ ] **Step 8.4: Verify UI**

```bash
pnpm dev
```

Expected: overlay shows the cue header, three-mode selector (Listen / Ask / Auto), placeholder body text, and footer showing the active mode. The header is draggable (drag the window by its top bar). Clicking a mode button updates the active state.

- [ ] **Step 8.5: Commit**

```bash
git add apps/desktop/src/
git commit -m "feat(ui): OverlayPanel shell with ModeSelector skeleton"
```

---

## Task 9: Acceptance test pass

**Files:** none — this is a verification-only task.

- [ ] **Step 9.1: Build a release binary and run it**

```bash
pnpm build
```

Expected: build completes. Output paths printed to terminal:
- macOS: `apps/desktop/src-tauri/target/release/bundle/dmg/cue_0.1.0_*.dmg`
- Windows: `apps\desktop\src-tauri\target\release\bundle\msi\cue_0.1.0_x64_en-US.msi`

Install/run the binary on your machine. The dev server is **not** running for this test — we want to verify the production bundle stands on its own.

- [ ] **Step 9.2: Run through the foundation acceptance criteria**

Confirm each:

1. ✅ The app launches and shows a transparent 360×480 overlay at (100, 100).
2. ✅ The overlay sits above other application windows.
3. ✅ Pressing `Cmd+\` / `Ctrl+\` toggles visibility globally (works even when the overlay is not focused).
4. ✅ Sharing your screen in Zoom/Meet/Teams does NOT show the overlay in the shared feed.
5. ✅ The header is draggable.
6. ✅ Clicking a mode button highlights it.
7. ✅ The window is absent from the taskbar / dock.
8. ✅ Closing the X button hides instead of quitting (verify by re-toggling with the hotkey).

If any item fails, file an issue against the plan rather than patching ad-hoc — most failures indicate a config drift that should be fixed in `tauri.conf.json` or `capabilities/default.json`.

- [ ] **Step 9.3: Tag and commit**

```bash
git tag -a foundation-complete -m "Plan 1 (cue-foundation) complete: shell + invisibility + hotkey"
```

(No code commit needed if all acceptance steps pass — Task 8's commit was the final code change.)

---

## Done

Plan 1 complete. Outcomes:

- Monorepo with pnpm workspaces, `apps/desktop` + `packages/shared` populated
- All scaffolding `.md` files in place (README, ARCHITECTURE, ROADMAP, CHANGELOG, LICENSE/EULA, dev/invisibility docs)
- Tauri 2 + React 18 + Vite + Tailwind shell building and running on mac and win
- Transparent always-on-top overlay with full screen-share invisibility via documented OS APIs
- Global hotkey toggle (`Cmd/Ctrl + \`)
- React UI skeleton with `OverlayPanel` + `ModeSelector`
- Release binaries successfully bundle on both platforms

**Next:** Plan 2 (`cue-intelligence`) — audio capture, Deepgram STT, Anthropic LLM streaming with HuggingFace fallback, question detection, three operating modes, settings panel, context loader.
