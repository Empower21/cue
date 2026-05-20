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
  const url = new URL('wss://api.deepgram.com/v1/listen');
  url.searchParams.set('model', 'nova-2');
  url.searchParams.set('language', language);
  url.searchParams.set('interim_results', 'true');
  url.searchParams.set('encoding', 'linear16');
  url.searchParams.set('sample_rate', String(TARGET_SR));
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

  // Set up the audio capture pipeline: MediaStreamTrack → AudioContext →
  // AudioWorklet that emits 16-bit PCM frames → WebSocket.
  const stream = new MediaStream([track]);
  const audioCtx = new AudioContext({ sampleRate: TARGET_SR });
  const source = audioCtx.createMediaStreamSource(stream);

  await audioCtx.audioWorklet.addModule(buildWorkletUrl());
  const node = new AudioWorkletNode(audioCtx, 'pcm16-emitter');
  node.port.onmessage = (msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg.data as ArrayBuffer);
  };
  source.connect(node);
  node.connect(audioCtx.destination);

  return {
    close: () => {
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
