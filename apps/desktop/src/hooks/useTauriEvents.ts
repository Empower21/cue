import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface AudioSignalEvent {
  channel: 'mic' | 'system';
  voiced: boolean;
  timestamp_ms: number;
}

export function useAudioSignal() {
  const [mic, setMic] = useState({ voiced: false, ts: 0 });
  const [system, setSystem] = useState({ voiced: false, ts: 0 });

  useEffect(() => {
    const unlisten = listen<AudioSignalEvent>('audio_signal', ({ payload }) => {
      const next = { voiced: payload.voiced, ts: payload.timestamp_ms };
      if (payload.channel === 'mic') setMic(next);
      else setSystem(next);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return { mic, system };
}
