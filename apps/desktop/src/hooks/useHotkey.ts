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
