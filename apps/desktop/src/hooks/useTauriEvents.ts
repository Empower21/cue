import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface AudioSignalEvent {
  channel: 'mic' | 'system';
  voiced: boolean;
  timestamp_ms: number;
}

export interface TranscriptUtterance {
  id: string;
  channel: 'mic' | 'system';
  text: string;
  isFinal: boolean;
  start_ms?: number;
  end_ms?: number;
}

type TranscriptEvent =
  | { kind: 'interim'; text: string; channel: 'mic' | 'system' }
  | { kind: 'final'; text: string; channel: 'mic' | 'system'; start_ms: number; end_ms: number };

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

/** Returns the index of the last element matching the predicate, or -1. */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    const item = arr[i];
    if (item !== undefined && predicate(item)) return i;
  }
  return -1;
}

export function useTranscript() {
  const [utterances, setUtterances] = useState<TranscriptUtterance[]>([]);

  useEffect(() => {
    let interimCounter = 0;
    const unlisten = listen<TranscriptEvent>('transcript_event', ({ payload }) => {
      setUtterances((prev) => {
        if (payload.kind === 'interim') {
          // Replace any trailing interim from the same channel; otherwise append.
          const trailingIndex = findLastIndex(
            prev,
            (u: TranscriptUtterance) => !u.isFinal && u.channel === payload.channel,
          );
          const existing = trailingIndex >= 0 ? prev[trailingIndex] : undefined;
          const id = existing !== undefined ? existing.id : `interim-${++interimCounter}`;
          const next: TranscriptUtterance = {
            id,
            channel: payload.channel,
            text: payload.text,
            isFinal: false,
          };
          if (trailingIndex >= 0) {
            const copy = prev.slice();
            copy[trailingIndex] = next;
            return copy;
          }
          return [...prev, next];
        }
        // Final — promote latest interim from this channel, or append.
        const trailingIndex = findLastIndex(
          prev,
          (u: TranscriptUtterance) => !u.isFinal && u.channel === payload.channel,
        );
        const finalUtt: TranscriptUtterance = {
          id: `final-${payload.start_ms}-${payload.channel}`,
          channel: payload.channel,
          text: payload.text,
          isFinal: true,
          start_ms: payload.start_ms,
          end_ms: payload.end_ms,
        };
        if (trailingIndex >= 0) {
          const copy = prev.slice();
          copy[trailingIndex] = finalUtt;
          return copy;
        }
        return [...prev, finalUtt];
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return utterances;
}

// ---------------------------------------------------------------------------
// Answer streaming
// ---------------------------------------------------------------------------

interface AnswerEvent {
  kind: 'token' | 'done' | 'error' | 'fallback';
  text?: string;
  reason?: string;
}

export interface StreamingAnswer {
  text: string;
  done: boolean;
  error?: string;
  fallback: boolean;
}

export function useAnswer() {
  const [answer, setAnswer] = useState<StreamingAnswer>({ text: '', done: true, fallback: false });

  useEffect(() => {
    const unlisten = listen<AnswerEvent>('answer_event', ({ payload }) => {
      setAnswer((prev) => {
        if (payload.kind === 'token' && payload.text) {
          return { ...prev, text: prev.text + payload.text, done: false };
        }
        if (payload.kind === 'done') {
          return { ...prev, done: true };
        }
        if (payload.kind === 'fallback') {
          return { ...prev, fallback: true };
        }
        if (payload.kind === 'error') {
          return { ...prev, done: true, error: payload.reason ?? 'unknown' };
        }
        return prev;
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Reset is exposed so callers can clear before a new ask.
  const reset = () => setAnswer({ text: '', done: true, fallback: false });

  return { answer, reset };
}
