'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '@cue/shared';
import {
  clearContextOnly,
  loadConfig,
  saveConfig,
  type WebCopilotConfig,
} from '@/lib/storage';
import { openDeepgramSession, type DeepgramEvent, type DeepgramSession } from '@/lib/deepgram';

export type Channel = 'mic' | 'system';

export interface Utterance {
  id: string;
  channel: Channel;
  text: string;
  isFinal: boolean;
}

export interface StreamingAnswer {
  text: string;
  done: boolean;
  error?: string;
  /// Set when the server signalled a switch from Anthropic → HuggingFace.
  fallback?: boolean;
}

const EMPTY_ANSWER: StreamingAnswer = { text: '', done: true };

/// Default Vision prompt per purpose. Keep these tight — the system prompt
/// (server-side) already establishes the persona, so the trigger only needs
/// to nudge the model toward the right shape of output for the captured frame.
const DEFAULT_SCREENSHOT_PROMPTS: Record<'interview' | 'meeting' | 'study', string> = {
  interview:
    "Solve or explain whatever is on this screenshot. If it's a coding problem, give a runnable solution and walk through the approach in 3-5 bullets.",
  meeting:
    'Summarise what is on this screenshot in 3-5 bullets, then suggest a single insightful question or follow-up the user could say next.',
  study:
    'Explain whatever is on this screenshot step by step, then give one quick check question to reinforce understanding.',
};

export function useCopilotState() {
  const [config, setConfigState] = useState<WebCopilotConfig>({});
  const [running, setRunning] = useState(false);
  const [systemAudioAvailable, setSystemAudioAvailable] = useState(true);
  const [transcript, setTranscript] = useState<Utterance[]>([]);
  const [answer, setAnswer] = useState<StreamingAnswer>(EMPTY_ANSWER);
  const [error, setError] = useState<string | null>(null);
  // Screen-share opt-in is SESSION-LOCAL, not persisted. Every page load
  // resets this to false so screen share is always a fresh deliberate
  // decision — silences Otter AI / Read.ai / Fathom auto-attach on reload.
  const [captureSystem, setCaptureSystem] = useState(false);

  const micSession = useRef<DeepgramSession | null>(null);
  const sysSession = useRef<DeepgramSession | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const sysStream = useRef<MediaStream | null>(null);
  // Both counters increment monotonically — we never trust Deepgram's
  // start_ms for uniqueness because (a) two utterances can legitimately
  // share start_ms=0 at session boundaries, and (b) network retries can
  // replay the same event. The counter guarantees React keys never
  // collide across the lifetime of a session.
  const interimCounter = useRef(0);
  const finalCounter = useRef(0);

  useEffect(() => {
    setConfigState(loadConfig());
  }, []);

  const updateConfig = useCallback((partial: Partial<WebCopilotConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...partial };
      saveConfig(partial);
      return next;
    });
  }, []);

  const handleDeepgramEvent = useCallback((ev: DeepgramEvent) => {
    setTranscript((prev) => {
      // Replace trailing interim from the same channel, or append.
      const trailing = findLastIndex(prev, (u) => !u.isFinal && u.channel === ev.channel);
      if (ev.isFinal) {
        const utt: Utterance = {
          id: `f-${ev.channel}-${++finalCounter.current}`,
          channel: ev.channel,
          text: ev.text,
          isFinal: true,
        };
        if (trailing >= 0) {
          const copy = prev.slice();
          copy[trailing] = utt;
          return copy;
        }
        return [...prev, utt];
      }
      const existing = trailing >= 0 ? prev[trailing] : undefined;
      const utt: Utterance = {
        id: existing?.id ?? `i-${++interimCounter.current}`,
        channel: ev.channel,
        text: ev.text,
        isFinal: false,
      };
      if (trailing >= 0) {
        const copy = prev.slice();
        copy[trailing] = utt;
        return copy;
      }
      return [...prev, utt];
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    // Precedence: user override from Settings (localStorage, per-device) takes
    // priority over any build-time env. NEXT_PUBLIC_DEEPGRAM_API_KEY is a
    // CONVENIENCE for local `pnpm dev` only — if it ever gets set in Vercel's
    // project env it ALSO gets baked into the public client bundle and any
    // visitor can read it. Keep it in `apps/web/.env.local` (gitignored), do
    // NOT add it to Vercel — production users supply their own key in Settings.
    const deepgramKey =
      config.deepgramKey?.trim() || process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY?.trim();
    if (!deepgramKey) {
      setError(
        'Deepgram API key needed — open ⚙ Settings and paste yours. Get one free at https://console.deepgram.com.',
      );
      return;
    }
    // Toggle resolution. Mic defaults ON (persisted), system audio defaults
    // OFF (session-local, see captureSystem state above) — so a fresh user
    // and any reload both produce mic-only behavior. Screen share is opted
    // into per session via the chip above the transcript.
    const wantMic = config.captureMic !== false;
    const wantSystem = captureSystem;
    if (!wantMic && !wantSystem) {
      setError(
        'Both mic and system audio are off — toggle at least one on before Start.',
      );
      return;
    }
    setRunning(true);
    try {
      const lang = config.language ?? 'en';

      if (wantMic) {
        // Mic capture profile depends on whether system audio is ALSO being
        // captured (desktop screen-share path) or the mic is the only source
        // (always the case on mobile):
        //
        //  - Mic-only → capture RAW: echo cancellation, noise suppression, and
        //    auto gain OFF. Those features exist to isolate the near-end
        //    speaker for a call, and on a phone they actively delete
        //    loudspeaker audio because they treat it as echo. Turning them off
        //    is what lets cue hear a speakerphone conversation acoustically.
        //    (This is why mic capture "worked when not in a call" but went
        //    silent on speaker — the call audio was cancelled before it ever
        //    reached Deepgram.)
        //  - Mic + system → keep the defaults (AEC on). The other side's voice
        //    already arrives cleanly on the system channel; a raw mic would
        //    re-capture the loudspeaker and double-transcribe it.
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: wantSystem
            ? true
            : {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
          video: false,
        });
        micStream.current = mic;
        const micTrack = mic.getAudioTracks()[0];
        if (!micTrack) throw new Error('No microphone track available');
        micSession.current = await openDeepgramSession({
          apiKey: deepgramKey,
          language: lang,
          channel: 'mic',
          track: micTrack,
          onEvent: handleDeepgramEvent,
          onError: (msg) => setError(`Deepgram (mic): ${msg}`),
        });
      }

      if (wantSystem) {
        try {
          // Constraints chosen so the browser's share-picker shows ALL three
          // surface options (Entire Screen, Window, Chrome Tab) — needed to
          // capture audio from a desktop app like Word. Without these hints,
          // Chrome 122+ defaults to tab-only.
          const sys = await navigator.mediaDevices.getDisplayMedia({
            audio: { suppressLocalAudioPlayback: false },
            video: {
              displaySurface: 'monitor',
              // Hint, not constraint — browser still lets the user pick.
              frameRate: { ideal: 1 },
            },
            // Chrome-specific:
            selfBrowserSurface: 'exclude',
            surfaceSwitching: 'include',
            monitorTypeSurfaces: 'include',
            systemAudio: 'include',
          } as DisplayMediaStreamOptions);
          sysStream.current = sys;
          // Stop the video track immediately — we only wanted the audio
          // half of the captured surface.
          sys.getVideoTracks().forEach((t) => t.stop());
          const sysTrack = sys.getAudioTracks()[0];
          if (sysTrack) {
            sysSession.current = await openDeepgramSession({
              apiKey: deepgramKey,
              language: lang,
              channel: 'system',
              track: sysTrack,
              onEvent: handleDeepgramEvent,
              onError: (msg) => setError(`Deepgram (system): ${msg}`),
            });
            setSystemAudioAvailable(true);
          } else {
            setSystemAudioAvailable(false);
            setError(
              "Selected source doesn't include audio. Re-pick and check Share tab/system audio.",
            );
          }
        } catch (err) {
          setSystemAudioAvailable(false);
          // User denied or browser doesn't support — keep mic going if it
          // started, otherwise abort.
          if (!micSession.current) {
            setError(err instanceof Error ? err.message : String(err));
            setRunning(false);
            return;
          }
          console.warn('system audio capture skipped:', err);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    }
  }, [
    config.deepgramKey,
    config.language,
    config.captureMic,
    captureSystem,
    handleDeepgramEvent,
  ]);

  const stop = useCallback(() => {
    micSession.current?.close();
    sysSession.current?.close();
    micStream.current?.getTracks().forEach((t) => t.stop());
    sysStream.current?.getTracks().forEach((t) => t.stop());
    micSession.current = null;
    sysSession.current = null;
    micStream.current = null;
    sysStream.current = null;
    setRunning(false);
    setSystemAudioAvailable(true);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const ask = useCallback(
    async (trigger: string, imageB64?: string) => {
      setError(null);
      setAnswer({ text: '', done: false });
      // Build the rolling context for the model. Two things keep answers
      // tight and on-topic:
      //   1. Drop any final whose text IS the trigger — otherwise the model
      //      sees the question once here and again as `## Trigger`, and tends
      //      to echo it back. (This was the main source of "duplicated"
      //      answers.)
      //   2. Keep only the last 8 finals. Older utterances are usually stale
      //      and pull the answer off the current topic.
      const norm = (s: string) => s.trim().toLowerCase();
      const triggerKey = norm(trigger);
      const finals = transcript
        .filter((u) => u.isFinal && norm(u.text) !== triggerKey)
        .slice(-8)
        .map((u) => ({ channel: u.channel, text: u.text }));
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      // Authorization header is optional — server falls back to ANTHROPIC_API_KEY.
      if (config.anthropicKey?.trim()) {
        headers.authorization = `Bearer ${config.anthropicKey.trim()}`;
      }
      let resp: Response;
      try {
        resp = await fetch('/api/ask', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: config.purpose ?? 'interview',
            trigger,
            jd: config.jd,
            resume: config.resume,
            roleContext: config.roleContext,
            voiceSample: config.voiceSample,
            language: config.language,
            transcript: finals,
            imageB64,
          } as const),
        });
      } catch (err) {
        setAnswer({
          text: '',
          done: true,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      if (!resp.ok || !resp.body) {
        const msg = await resp.text();
        setAnswer({ text: '', done: true, error: msg || `HTTP ${resp.status}` });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const json = line.slice(6);
          try {
            const evt = JSON.parse(json) as
              | { type: 'token'; text: string }
              | { type: 'done' }
              | { type: 'fallback'; text: string }
              | { type: 'error'; reason: string };
            if (evt.type === 'token') {
              setAnswer((prev) => ({ text: prev.text + evt.text, done: false }));
            } else if (evt.type === 'done') {
              setAnswer((prev) => ({ ...prev, done: true }));
            } else if (evt.type === 'fallback') {
              setAnswer((prev) => ({ ...prev, fallback: true }));
            } else if (evt.type === 'error') {
              setAnswer((prev) => ({ ...prev, done: true, error: evt.reason }));
            }
          } catch {
            /* ignore malformed line */
          }
        }
      }
    },
    [config, transcript],
  );

  const answerLatest = useCallback(() => {
    const last = [...transcript].reverse().find((u) => u.isFinal && u.channel === 'system');
    const fallback = [...transcript].reverse().find((u) => u.isFinal);
    const trigger = last?.text ?? fallback?.text;
    if (!trigger) {
      setError('No transcript yet — start a session first.');
      return;
    }
    void ask(trigger);
  }, [transcript, ask]);

  const screenshot = useCallback(async (customPrompt?: string) => {
    setError(null);
    try {
      // displaySurface + monitorTypeSurfaces hints force Chrome to show ALL
      // three picker tabs (Chrome Tab, Window, Entire Screen) instead of
      // defaulting to tab-only on Chrome 122+. selfBrowserSurface 'exclude'
      // hides cue's own tab from the picker so the user can't accidentally
      // capture the copilot.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 1 },
        },
        audio: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
      } as DisplayMediaStreamOptions);
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No video track from getDisplayMedia');
      // ImageCapture has spotty TS types; cast through unknown.
      const ImageCaptureCtor = (window as unknown as {
        ImageCapture?: new (track: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> };
      }).ImageCapture;
      let bitmap: ImageBitmap;
      if (ImageCaptureCtor) {
        const capture = new ImageCaptureCtor(track);
        bitmap = await capture.grabFrame();
      } else {
        bitmap = await fallbackFrameGrab(stream);
      }
      stream.getTracks().forEach((t) => t.stop());

      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      // The prompt mirrors the active purpose so a meeting user gets meeting-
      // shaped insight ("summarise + suggest a follow-up") and an interview
      // user gets a working answer. A typed askInput overrides everything.
      const purpose = config.purpose ?? 'interview';
      const prompt = customPrompt?.trim() || DEFAULT_SCREENSHOT_PROMPTS[purpose];
      await ask(prompt, b64);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [ask, config.purpose]);

  const resetSession = useCallback(() => {
    setTranscript([]);
    setAnswer(EMPTY_ANSWER);
    setError(null);
  }, []);

  /// Wipes the resume/JD/role/voice-sample from localStorage. Keeps API keys
  /// and the active language. Suitable to call from a "Clear context" button
  /// when finishing a session.
  const clearContext = useCallback(() => {
    clearContextOnly();
    setConfigState((prev) => ({
      ...prev,
      jd: '',
      resume: '',
      roleContext: '',
      voiceSample: '',
    }));
  }, []);

  return {
    config,
    updateConfig,
    running,
    systemAudioAvailable,
    transcript,
    answer,
    error,
    start,
    stop,
    ask,
    answerLatest,
    screenshot,
    resetSession,
    clearContext,
    captureSystem,
    setCaptureSystem,
  };
}

async function fallbackFrameGrab(stream: MediaStream): Promise<ImageBitmap> {
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  await new Promise((r) => setTimeout(r, 80));
  const bitmap = await createImageBitmap(video);
  video.pause();
  video.srcObject = null;
  return bitmap;
}

function findLastIndex<T>(arr: T[], pred: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== undefined && pred(v)) return i;
  }
  return -1;
}

export type { Language };
