'use client';

import { useCallback, useEffect, useState } from 'react';

// Document Picture-in-Picture API — Chrome 116+ / Edge 116+.
// Opens an OS-level window that lives outside the tab, so when the user
// shares "this tab" in a video call, the PiP window is NOT captured. The
// best web-side mitigation we can offer without a desktop app.
//
// Honest limitation: if the user shares "Entire screen", the PiP window
// is still captured. The only way to be invisible to entire-screen capture
// on the same machine is the Tauri desktop overlay (WDA_EXCLUDEFROMCAPTURE).
type DocumentPiP = {
  requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
};

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPiP;
  }
}

export interface UsePiPResult {
  pipWindow: Window | null;
  supported: boolean;
  open: () => Promise<void>;
  close: () => void;
}

export function usePiP(): UsePiPResult {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'documentPictureInPicture' in window);
  }, []);

  const open = useCallback(async () => {
    if (typeof window === 'undefined' || !window.documentPictureInPicture) return;
    const pip = await window.documentPictureInPicture.requestWindow({ width: 440, height: 680 });

    // Carry over the page's compiled CSS so Tailwind classes render
    // identically inside the PiP document. We try cloning rules first
    // (works for inline <style>); fall back to <link rel="stylesheet">
    // for cross-origin sheets where cssRules is blocked.
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const cssText = Array.from(sheet.cssRules).map((r) => r.cssText).join('');
        const style = pip.document.createElement('style');
        style.textContent = cssText;
        pip.document.head.appendChild(style);
      } catch {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        if (sheet.href) link.href = sheet.href;
        pip.document.head.appendChild(link);
      }
    }

    pip.document.documentElement.classList.add('dark');
    pip.document.title = 'cue — answer';
    pip.document.body.style.margin = '0';
    pip.document.body.style.background = 'rgba(11, 11, 16, 0.96)';
    pip.document.body.style.color = '#e6e8ee';
    pip.document.body.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";

    pip.addEventListener('pagehide', () => setPipWindow(null));
    setPipWindow(pip);
  }, []);

  const close = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  useEffect(() => {
    return () => {
      pipWindow?.close();
    };
  }, [pipWindow]);

  return { pipWindow, supported, open, close };
}
