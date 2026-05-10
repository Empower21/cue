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
