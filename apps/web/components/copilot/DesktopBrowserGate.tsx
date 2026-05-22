'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/// Returns true if the current browser is a *desktop* browser — best-effort
/// signal that combines a coarse-pointer media query with a generous viewport
/// width. A touchscreen Surface laptop reports `pointer: coarse` but has a
/// large viewport, so this still treats it as desktop (good — that laptop
/// would still be visible during screen share).
function isLikelyMobile(): boolean {
  if (typeof window === 'undefined') return false;
  // Mobile devices: width <= 768px almost always.
  if (window.matchMedia('(max-width: 768px)').matches) return true;
  // Tablets: medium width + primary coarse pointer + no fine pointer.
  if (
    window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(any-pointer: fine)').matches &&
    window.matchMedia('(max-width: 1280px)').matches
  ) {
    return true;
  }
  return false;
}

const APP_URL = 'https://cue-web-five.vercel.app/app';

/// Renders a full-screen gate for desktop browsers, and {children} for mobile.
/// "Open anyway" sets a dismissal flag in sessionStorage so debugging /app on
/// desktop only requires one click per session, not per reload.
export function DesktopBrowserGate({ children }: { children: React.ReactNode }) {
  const [decided, setDecided] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    // Per-session dismissal — clears on tab close. Storing it longer would
    // cement the wrong default the first time someone tested with the
    // override and then forgot.
    if (sessionStorage.getItem('cue.web.gateDismissed') === '1') {
      setMobile(true);
      setDecided(true);
      return;
    }
    setMobile(isLikelyMobile());
    setDecided(true);
  }, []);

  // First paint: render nothing while we measure the device. Keeps the gate
  // from flashing on a real phone where the gate is wrong.
  if (!decided) return null;
  if (mobile) return <>{children}</>;

  const qrUrl =
    'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&bgcolor=0b0b0e&color=e6e8ee&data=' +
    encodeURIComponent(APP_URL);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-cue-subtle/40 bg-cue-surface/60 p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-cue-accent text-base font-bold text-white">
            c
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Open cue on your phone</h1>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-cue-muted">
          The web copilot is designed to be used on a <span className="text-cue-text">second device</span> —
          your phone or tablet — while you interview from your laptop. On the same
          machine as the meeting, a browser tab is visible during screen share
          (no API exists to hide a webpage from OS-level capture).
        </p>
        <p className="mb-6 text-sm leading-relaxed text-cue-muted">
          For invisibility on this machine, use the <span className="text-cue-text">desktop overlay</span>{' '}
          — it registers with the OS compositor and is excluded from screen
          recording across Zoom, Meet, Teams, and OBS.
        </p>

        <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center gap-2">
            <img
              src={qrUrl}
              alt="QR code to open cue on a phone"
              width={220}
              height={220}
              className="rounded-lg ring-1 ring-cue-subtle/40"
            />
            <p className="text-[11px] text-cue-muted">Scan to open on phone</p>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <p className="mb-1 text-cue-text">Or copy the URL:</p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(APP_URL);
                }}
                className="w-full truncate rounded-md border border-cue-subtle/50 bg-cue-bg px-3 py-2 text-left font-mono text-xs text-cue-muted hover:border-cue-accent hover:text-cue-text"
                title="Click to copy"
              >
                {APP_URL}
              </button>
            </div>
            <Link
              href="/download"
              className="rounded-md bg-cue-accent px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-cue-accentHover"
            >
              Download desktop app (truly invisible)
            </Link>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('cue.web.gateDismissed', '1');
                setMobile(true);
              }}
              className="text-xs text-cue-muted underline-offset-4 hover:text-cue-text hover:underline"
            >
              I know — continue in this browser anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
