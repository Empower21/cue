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
