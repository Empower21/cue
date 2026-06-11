//! Browser-side Deepgram WebSocket pump. One instance per channel (mic /
//! system). The caller wires up a MediaStreamTrack and consumes
//! interim/final events through the callback.
//!
//! Note: this puts the Deepgram API key directly in the browser. The user
//! supplies their own key in the Settings drawer; we never proxy it through
//! our server. The desktop app behaves the same way — the choice is
//! deliberate so cue.amdrautomate.* doesn't have to underwrite token costs.

export type DeepgramChannel = 'mic' | 'system';

export interface DeepgramEvent {
  channel: DeepgramChannel;
  text: string;
  isFinal: boolean;
  startMs?: number;
  endMs?: number;
}

export interface DeepgramSession {
  close(): void;
}

interface OpenOptions {
  apiKey: string;
  language: string;
  channel: DeepgramChannel;
  track: MediaStreamTrack;
  onEvent: (ev: DeepgramEvent) => void;
  onError?: (msg: string) => void;
}

/// PCM16 sample rate Deepgram expects. AudioContext upsamples/downsamples
/// transparently — the browser handles the resampling math.
const TARGET_SR = 16_000;

export async function openDeepgramSession(opts: OpenOptions): Promise<DeepgramSession> {
  const { apiKey, language, channel, track, onEvent, onError } = opts;

  // Create the AudioContext FIRST and ask it what sample rate it actually
  // got. iOS Safari often ignores the requested rate and keeps the hardware
  // rate (48 kHz) — if we blindly told Deepgram "16000" it would decode 48k
  // PCM as 3×-slowed audio and return empty/garbage transcripts with no
  // error. Telling Deepgram the REAL rate makes the mismatch impossible.
  const stream = new MediaStream([track]);
  let audioCtx: AudioContext;
  try {
    audioCtx = new AudioContext({ sampleRate: TARGET_SR });
  } catch {
    // Some browsers throw on unsupported custom rates — fall back to default.
    audioCtx = new AudioContext();
  }
  // Safari can hand back a suspended context even inside a user-gesture
  // chain; resume() is a no-op when already running.
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume().catch(() => undefined);
  }
  const actualSr = Math.round(audioCtx.sampleRate);

  const url = new URL('wss://api.deepgram.com/v1/listen');
  url.searchParams.set('model', 'nova-2');
  url.searchParams.set('language', language);
  url.searchParams.set('interim_results', 'true');
  url.searchParams.set('encoding', 'linear16');
  url.searchParams.set('sample_rate', String(actualSr));
  url.searchParams.set('punctuate', 'true');
  url.searchParams.set('smart_format', 'true');
  url.searchParams.set('channels', '1');

  const ws = new WebSocket(url.toString(), ['token', apiKey]);
  ws.binaryType = 'arraybuffer';

  ws.addEventListener('message', (evt) => {
    try {
      const data = JSON.parse(evt.data as string) as {
        channel?: { alternatives?: { transcript?: string }[] };
        is_final?: boolean;
        start?: number;
        duration?: number;
      };
      const alt = data.channel?.alternatives?.[0];
      const transcript = alt?.transcript ?? '';
      if (!transcript) return;
      onEvent({
        channel,
        text: transcript,
        isFinal: data.is_final ?? false,
        startMs:
          typeof data.start === 'number' ? Math.round(data.start * 1000) : undefined,
        endMs:
          typeof data.start === 'number' && typeof data.duration === 'number'
            ? Math.round((data.start + data.duration) * 1000)
            : undefined,
      });
    } catch (err) {
      onError?.(String(err));
    }
  });
  ws.addEventListener('error', () => onError?.('Deepgram websocket error'));
  // Deepgram closes idle/bad-auth connections with a `close` frame, NOT an
  // `error` event (1008 = bad key, 1011 = server timeout). Without this
  // handler a dead session keeps looking "running" while the transcript
  // silently freezes.
  let closedByUs = false;
  ws.addEventListener('close', (evt) => {
    if (!closedByUs && evt.code !== 1000) {
      onError?.(`Deepgram connection closed (code ${evt.code})${evt.code === 1008 ? ' — check your API key' : ''}`);
    }
  });

  // Set up the audio capture pipeline: MediaStreamTrack → AudioContext →
  // AudioWorklet that emits 16-bit PCM frames → WebSocket.
  const source = audioCtx.createMediaStreamSource(stream);

  await audioCtx.audioWorklet.addModule(buildWorkletUrl());
  const node = new AudioWorkletNode(audioCtx, 'pcm16-emitter');
  // Frames produced before the TCP+TLS handshake finishes (300-800 ms on
  // mobile networks) used to be silently dropped — the first words of a
  // session never reached Deepgram. Buffer while CONNECTING, flush on open.
  let pendingChunks: ArrayBuffer[] = [];
  ws.addEventListener('open', () => {
    for (const chunk of pendingChunks) ws.send(chunk);
    pendingChunks = [];
  });
  node.port.onmessage = (msg) => {
    const buf = msg.data as ArrayBuffer;
    if (ws.readyState === WebSocket.OPEN) ws.send(buf);
    else if (ws.readyState === WebSocket.CONNECTING) pendingChunks.push(buf);
  };
  source.connect(node);
  node.connect(audioCtx.destination);

  // Phones suspend the AudioContext when the app is backgrounded (incoming
  // notification, screen lock, app switch). The session looks alive but the
  // worklet stops firing. Resume on return to foreground.
  const onVisibility = () => {
    if (!document.hidden && audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => undefined);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    close: () => {
      closedByUs = true;
      pendingChunks = [];
      document.removeEventListener('visibilitychange', onVisibility);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      try {
        node.disconnect();
        source.disconnect();
        void audioCtx.close();
      } catch {
        /* noop */
      }
    },
  };
}

// AudioWorklet source is shipped as a string + blob URL so the page doesn't
// need a separate static file. The worklet converts Float32 → Int16 and
// posts an ArrayBuffer back to the main thread for each ~20ms chunk.
let workletUrl: string | null = null;
function buildWorkletUrl(): string {
  if (workletUrl) return workletUrl;
  const source = `
    class Pcm16Emitter extends AudioWorkletProcessor {
      process(inputs) {
        const channelData = inputs[0]?.[0];
        if (!channelData) return true;
        const out = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
          const s = Math.max(-1, Math.min(1, channelData[i]));
          out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(out.buffer, [out.buffer]);
        return true;
      }
    }
    registerProcessor('pcm16-emitter', Pcm16Emitter);
  `;
  const blob = new Blob([source], { type: 'application/javascript' });
  workletUrl = URL.createObjectURL(blob);
  return workletUrl;
}
