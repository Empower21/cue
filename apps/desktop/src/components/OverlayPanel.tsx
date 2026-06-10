import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
// Drag uses JS mousemove + setPosition (not Tauri's startDragging and not the
// Win32 caption-drag). Every native approach failed in this Windows
// environment — likely DWM / Aero Snap interference. JS-side drag works
// because it never invokes the OS modal move loop.
import { ModeSelector, type Mode } from './ModeSelector';
import { TranscriptStream } from './TranscriptStream';
import { AnswerCard } from './AnswerCard';
import { ContextLoader } from './ContextLoader';
import { SettingsPanel } from './SettingsPanel';
import {
  emitSessionReset,
  useAudioSignal,
  useAnswer,
  useTranscript,
  type StreamingAnswer,
  type TranscriptUtterance,
} from '../hooks/useTauriEvents';

const QUESTION_REGEX =
  /^(what|how|why|when|where|who|can|could|would|should|is|are|do|does|did|tell|describe|explain)\b/i;
const DEBOUNCE_MS = 3000;

const EXPANDED_SIZE = new LogicalSize(380, 520);
const COLLAPSED_SIZE = new LogicalSize(140, 32);

/// Returns the most recent text we should treat as "the question" — the last
/// final system utterance if there is one, else the last final utterance from
/// either channel. Used by the manual Answer button.
function pickAnswerTrigger(transcript: TranscriptUtterance[]): string | null {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const u = transcript[i];
    if (u && u.isFinal && u.channel === 'system') return u.text;
  }
  for (let i = transcript.length - 1; i >= 0; i--) {
    const u = transcript[i];
    if (u && u.isFinal) return u.text;
  }
  return null;
}

type Purpose = 'interview' | 'meeting' | 'study';

/// Default screenshot prompts per purpose. Mirror the web /app so users get
/// consistent vision-call shapes whether they're on the desktop overlay or
/// the mobile second-screen page.
const SCREENSHOT_PROMPTS: Record<Purpose, string> = {
  interview:
    "Solve or explain whatever is currently on the candidate's screen. If it's a coding problem, give a runnable solution and walk through the approach in 3-5 bullets.",
  meeting:
    'Summarise what is on the screen in 3-5 bullets, then suggest a single insightful question or follow-up the user could say next.',
  study:
    'Explain whatever is on the screen step by step, then give one quick check question to reinforce understanding.',
};

export function OverlayPanel() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('listen');
  const [purpose, setPurposeState] = useState<Purpose>('interview');
  const [running, setRunning] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [alsoClearContext, setAlsoClearContext] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [autoAnswers, setAutoAnswers] = useState<StreamingAnswer[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturingScreen, setCapturingScreen] = useState(false);

  // Capture-source picker state. When the user clicks Screenshot, we fetch
  // the available monitors + windows from Rust (with live thumbnails), show
  // them in a modal, and capture the full-res image only after the user picks
  // one. Mirrors the browser getDisplayMedia picker behaviour — thumbnails
  // included.
  interface CaptureSource {
    id: string;
    kind: 'monitor' | 'window';
    label: string;
    width: number;
    height: number;
    primary: boolean;
    thumbnail_b64: string | null;
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSources, setPickerSources] = useState<CaptureSource[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Hydrate purpose from ~/.cue/config.toml on mount. The Rust Config has had
  // `mode: Option<String>` since the first build — surfacing it here was just
  // the missing piece.
  useEffect(() => {
    void invoke<{ mode?: string }>('load_config').then((cfg) => {
      const m = cfg.mode;
      if (m === 'meeting' || m === 'study' || m === 'interview') {
        setPurposeState(m);
      }
    });
  }, []);

  const setPurpose = (next: Purpose) => {
    setPurposeState(next);
    // Persist alongside everything else. The Rust side merges this into the
    // existing config — we don't have to fetch + spread, save_config takes
    // the whole struct and we only have the one field that changed.
    void invoke<Record<string, unknown>>('load_config').then((cfg) => {
      void invoke('save_config', { config: { ...cfg, mode: next } });
    });
  };

  const handleDragStart = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) return;
    e.preventDefault();

    const win = getCurrentWindow();
    const startScreenX = e.screenX;
    const startScreenY = e.screenY;
    const startPos = await win.outerPosition();

    const onMove = (mv: MouseEvent) => {
      const newX = startPos.x + (mv.screenX - startScreenX);
      const newY = startPos.y + (mv.screenY - startScreenY);
      void win.setPosition(new PhysicalPosition(newX, newY));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const toggleCollapsed = async () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      await getCurrentWindow().setSize(next ? COLLAPSED_SIZE : EXPANDED_SIZE);
    } catch (err) {
      console.error('failed to resize window:', err);
    }
  };

  const { mic, system } = useAudioSignal();
  const transcript = useTranscript();
  const { answer, reset } = useAnswer();

  // Single-flight guard. The previous version used useState + useEffect to
  // clear the flag when answer.done flipped true — but `reset()` also flips
  // answer.done to true (initial state), so the effect fired between reset
  // and the first token, briefly re-enabling the button and letting rapid
  // clicks slip through.
  //
  // useRef is synchronous: assigning .current updates the value in the same
  // tick, so the second click's guard check sees `true` immediately. State
  // mirrors the ref for the disabled prop (refs don't trigger re-renders).
  const inFlight = useRef(false);
  const [streaming, setStreaming] = useState(false);
  // Clear in-flight only after the answer has BOTH (a) received content
  // (text or error) AND (b) hit done. The `reset()` race can't trigger this
  // because reset clears text to '' and error to undefined.
  useEffect(() => {
    if (!inFlight.current) return;
    if (answer.done && (answer.text || answer.error)) {
      inFlight.current = false;
      setStreaming(false);
    }
  }, [answer.done, answer.text, answer.error]);

  // Safety net: if Rust never emits done (e.g., it crashed mid-stream), clear
  // the guard after 45s. Vision can take 20s; this gives ample buffer.
  useEffect(() => {
    if (!streaming) return;
    const t = setTimeout(() => {
      if (inFlight.current) {
        inFlight.current = false;
        setStreaming(false);
        setError('Request timed out (45s). Try again.');
      }
    }, 45_000);
    return () => clearTimeout(t);
  }, [streaming]);

  const lastTriggerAt = useRef(0);
  // The id of the last system utterance we already auto-answered. Without
  // this, the 3s time-debounce alone lets the SAME lingering question
  // re-trigger every few seconds (the effect re-runs on every audio-signal
  // re-render), stacking duplicate answers. Answer each utterance at most once.
  const lastAnsweredId = useRef<string | null>(null);

  /// Acquire the single-flight slot synchronously. Returns false if a call
  /// is already in flight (caller should bail out). True means: slot is
  /// yours, you MUST eventually trigger an answer event (or error) so the
  /// effect above can clear it — or the safety net will at 45s.
  const tryClaim = () => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setStreaming(true);
    return true;
  };

  // Auto mode: detect questions in system-channel transcripts.
  useEffect(() => {
    if (inFlight.current) return;
    if (mode !== 'auto' || transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (!last || !last.isFinal || last.channel !== 'system') return;
    // Already answered THIS utterance — don't re-answer it just because it's
    // still the last line on screen. This is the real fix for duplicate answers.
    if (last.id === lastAnsweredId.current) return;
    const now = Date.now();
    if (now - lastTriggerAt.current < DEBOUNCE_MS) return;
    if (last.text.includes('?') || QUESTION_REGEX.test(last.text)) {
      if (!tryClaim()) return;
      lastAnsweredId.current = last.id;
      lastTriggerAt.current = now;
      reset();
      void invoke('ask', { mode: purpose, trigger: last.text });
    }
  }, [transcript, mode, purpose, reset]);

  const submitAsk = () => {
    if (!askInput.trim()) return;
    if (!tryClaim()) return;
    reset();
    void invoke('ask', { mode: purpose, trigger: askInput.trim() });
    setAskInput('');
  };

  // Manual "Answer" button: take the last final utterance as the question.
  const manualAnswer = () => {
    const trigger = pickAnswerTrigger(transcript);
    if (!trigger) {
      setError('No transcript yet — speak first, then press Answer.');
      return;
    }
    if (!tryClaim()) return;
    setError(null);
    lastTriggerAt.current = Date.now();
    reset();
    void invoke('ask', { mode: purpose, trigger });
  };

  // Screenshot click: fetch the list of capture sources from Rust and show
  // the picker. The actual capture only happens once the user picks something
  // in the picker (see captureFromSource below). This mirrors the browser
  // getDisplayMedia picker — the user always chooses what to capture.
  const screenshotAnswer = async () => {
    if (capturingScreen || streaming) return;
    setError(null);
    setPickerLoading(true);
    setPickerOpen(true);
    try {
      const sources = await invoke<CaptureSource[]>('list_capture_sources');
      setPickerSources(sources);
    } catch (err) {
      setError('Could not list capture sources: ' + String(err));
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  };

  // Called when the user picks a source in the picker. Acquires the
  // single-flight slot, captures the chosen source, ships to vision.
  const captureFromSource = async (sourceId: string) => {
    setPickerOpen(false);
    if (!tryClaim()) return;
    setError(null);
    setCapturingScreen(true);
    try {
      const imageB64 = await invoke<string>('capture_screen', { sourceId });
      const trigger = askInput.trim() || SCREENSHOT_PROMPTS[purpose];
      reset();
      await invoke('ask_with_image', { mode: purpose, trigger, imageB64 });
      setAskInput('');
    } catch (err) {
      setError(String(err));
      inFlight.current = false;
      setStreaming(false);
    } finally {
      setCapturingScreen(false);
    }
  };

  // Snapshot finished auto-mode answers so they accumulate in the list, then
  // clear the live answer. Without the reset, the just-finished answer stays
  // in the top <AnswerCard answer={answer}> AND is also rendered from
  // `autoAnswers` below — so it shows twice until the next auto-trigger fires.
  // That double-render was the "outputs in duplicate" the user saw in Auto mode.
  useEffect(() => {
    if (mode === 'auto' && answer.done && answer.text) {
      setAutoAnswers((prev) => [...prev, answer]);
      reset();
    }
  }, [answer, mode, reset]);

  const toggle = async () => {
    setError(null);
    try {
      if (running) {
        await invoke('stop_capture');
        setRunning(false);
      } else {
        await invoke('start_capture');
        setRunning(true);
      }
    } catch (e) {
      setError(String(e));
      console.error('toggle failed:', e);
    }
  };

  if (collapsed) {
    return (
      <div
        onMouseDown={handleDragStart}
        className="flex h-full w-full items-center justify-between rounded-full bg-cue-bg/95 px-3 backdrop-blur-md ring-1 ring-cue-subtle cursor-grab active:cursor-grabbing select-none"
      >
        <span className="text-xs font-semibold tracking-wide text-cue-text">{t('app.title')}</span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand"
          className="text-cue-muted hover:text-cue-text text-sm leading-none"
        >
          ▢
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col rounded-xl bg-cue-bg p-3 shadow-2xl backdrop-blur-md ring-1 ring-cue-subtle">
      <header
        onMouseDown={handleDragStart}
        className="relative flex min-h-10 items-center justify-between px-1 pb-2 select-none cursor-grab active:cursor-grabbing"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1 h-1 w-10 -translate-x-1/2 rounded-full bg-cue-muted/40"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold tracking-wide text-cue-text">{t('app.title')}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAlsoClearContext(false);
              setShowEndConfirm(true);
            }}
            className="text-[10px] text-cue-muted hover:text-red-400"
          >
            {t('app.end')}
          </button>
          <button
            type="button"
            onClick={() => setShowContext(true)}
            className="text-[10px] text-cue-muted hover:text-cue-text"
          >
            {t('panel.context')}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="text-[10px] text-cue-muted hover:text-cue-text"
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse"
            className="text-cue-muted hover:text-cue-text text-sm leading-none px-1"
          >
            ▢
          </button>
        </div>
      </header>

      {/* Purpose row — chooses the system prompt persona. Disabled mid-session
         to keep the Anthropic prompt cache hot; the user can change between
         sessions via this row, or via Settings on platforms with no overlay. */}
      <div className="mb-2 flex items-center gap-1 text-[10px]">
        <span className="mr-1 text-cue-muted">{t('purpose.label')}:</span>
        {(['interview', 'meeting', 'study'] as const).map((p) => {
          const active = purpose === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPurpose(p)}
              disabled={running}
              className={
                'rounded-full border px-2 py-0.5 transition disabled:opacity-50 ' +
                (active
                  ? 'border-cue-accent bg-cue-accent/15 text-cue-text'
                  : 'border-cue-subtle/60 text-cue-muted hover:text-cue-text')
              }
              title={t(`purpose.${p}Help`)}
            >
              {t(`purpose.${p}`)}
            </button>
          );
        })}
      </div>

      <ModeSelector mode={mode} setMode={setMode} />

      <div className="mt-2 flex items-center justify-between rounded-md bg-cue-surface px-3 py-2 text-xs">
        <button
          type="button"
          onClick={toggle}
          className="rounded bg-cue-accent px-3 py-1 text-white"
        >
          {running ? t('app.stop') : t('app.start')}
        </button>
        <Dot label={t('audio.you')} voiced={mic.voiced} />
        <Dot label={t('audio.them')} voiced={system.voiced} />
      </div>

      {/* Action row: manual Answer + Screenshot — always available, even in
         Listen mode. Both disabled while an answer is streaming so we can
         never have two concurrent LLM calls writing into the same answer
         state (which would interleave tokens word-by-word). */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={manualAnswer}
          disabled={streaming}
          className="flex-1 rounded border border-cue-accent/60 bg-cue-accent/20 px-2 py-1 text-xs text-cue-text hover:bg-cue-accent/30 disabled:opacity-50"
          title={t('panel.answer')}
        >
          {t('panel.answer')}
        </button>
        <button
          type="button"
          onClick={screenshotAnswer}
          disabled={streaming || capturingScreen}
          className="flex-1 rounded border border-cue-subtle/60 bg-cue-surface px-2 py-1 text-xs text-cue-text hover:border-cue-accent disabled:opacity-50"
          title={t('panel.screenshot')}
        >
          {capturingScreen
            ? t('panel.analysingScreen')
            : streaming
            ? t('panel.thinking')
            : t('panel.screenshot')}
        </button>
      </div>

      <main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
        <div className="flex h-full flex-col gap-3">
          {/* Transcript only when audio is running */}
          {running && (
            <div className="flex-1 overflow-y-auto">
              <TranscriptStream />
            </div>
          )}

          {/* Ask input — visible whenever ask mode is selected, even before
             Start, so the user can type and hit Screenshot or Ask without
             starting audio. */}
          {mode === 'ask' && (
            <div className="flex gap-2">
              <input
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAsk();
                }}
                placeholder={t('panel.askPlaceholder')}
                disabled={streaming}
                className="flex-1 rounded border border-cue-subtle/40 bg-cue-surface px-2 py-1 text-xs text-cue-text disabled:opacity-50"
              />
              <button
                type="button"
                onClick={submitAsk}
                disabled={streaming}
                className="rounded bg-cue-accent px-2 text-xs text-white disabled:opacity-50"
              >
                {t('panel.ask')}
              </button>
            </div>
          )}

          {/* Answer area — always visible. The Screenshot button works
             without a running audio session, so the AnswerCard MUST be
             mounted regardless of `running` or streaming-state will land
             in a dead component. AnswerCard returns null when empty so
             this costs nothing in the empty case. */}
          <div className="space-y-2">
            <AnswerCard answer={answer} />
            {autoAnswers
              .slice()
              .reverse()
              .map((a, i) => (
                <AnswerCard key={`${i}-${a.text.slice(0, 20)}`} answer={a} />
              ))}
          </div>

          {/* Press-Start placeholder — only when there's truly nothing to
             show. Hidden once a transcript is running OR an answer is
             streaming/displayed/errored. */}
          {!running && !answer.text && !answer.error && (
            <div className="flex flex-1 items-center justify-center text-center text-xs text-cue-muted">
              <div>{t('panel.pressStart')}</div>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-cue-subtle pt-2 text-[10px] text-cue-muted">
        {t('modes.label')}: <span className="text-cue-text">{t(`modes.${mode}`)}</span>
        {error && (
          <div className="mt-1 rounded bg-red-100 px-2 py-1 text-red-700">
            <strong>{t('panel.errorLabel')}:</strong> {error}
          </div>
        )}
      </footer>

      <ContextLoader open={showContext} onClose={() => setShowContext(false)} />
      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
      <CaptureSourcePicker
        open={pickerOpen}
        loading={pickerLoading}
        sources={pickerSources}
        onPick={captureFromSource}
        onCancel={() => setPickerOpen(false)}
      />
      <EndSessionConfirm
        open={showEndConfirm}
        alsoClearContext={alsoClearContext}
        onToggleAlsoClearContext={setAlsoClearContext}
        onCancel={() => setShowEndConfirm(false)}
        onConfirm={async () => {
          setShowEndConfirm(false);
          setError(null);
          try {
            if (running) {
              await invoke('stop_capture');
              setRunning(false);
            }
            emitSessionReset();
            setAutoAnswers([]);
            setAskInput('');
            if (alsoClearContext) {
              const cfg = await invoke<Record<string, unknown>>('load_config');
              await invoke('save_config', {
                config: {
                  ...cfg,
                  job_description: '',
                  resume: '',
                  role_context: '',
                },
              });
            }
          } catch (e) {
            setError(String(e));
            console.error('end session failed:', e);
          }
        }}
      />
    </div>
  );
}

interface EndSessionConfirmProps {
  open: boolean;
  alsoClearContext: boolean;
  onToggleAlsoClearContext: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function EndSessionConfirm({
  open,
  alsoClearContext,
  onToggleAlsoClearContext,
  onCancel,
  onConfirm,
}: EndSessionConfirmProps) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">{t('end.title')}</h2>
        <button type="button" onClick={onCancel} className="text-cue-muted">
          ✕
        </button>
      </header>
      <ul className="space-y-1 text-cue-muted">
        <li>• {t('end.item1')}</li>
        <li>• {t('end.item2')}</li>
        <li>• {t('end.item3')}</li>
      </ul>
      <label className="mt-3 flex items-start gap-2 text-cue-text">
        <input
          type="checkbox"
          checked={alsoClearContext}
          onChange={(e) => onToggleAlsoClearContext(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          {t('end.alsoClearContext')}
          <span className="block text-[10px] text-cue-muted">{t('end.keysNote')}</span>
        </span>
      </label>
      <div className="mt-auto flex justify-end gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-cue-subtle/60 px-3 py-1 text-cue-text hover:border-cue-subtle"
        >
          {t('end.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded bg-red-500/90 px-3 py-1 text-white hover:bg-red-500"
        >
          {t('end.confirm')}
        </button>
      </div>
    </div>
  );
}

function Dot({ label, voiced }: { label: string; voiced: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-cue-muted">{label}</span>
      <span
        className={
          'h-2 w-2 rounded-full transition-opacity ' +
          (voiced ? 'bg-green-400 opacity-100' : 'bg-green-400 opacity-20')
        }
      />
    </div>
  );
}

interface CaptureSourcePickerProps {
  open: boolean;
  loading: boolean;
  sources: {
    id: string;
    kind: 'monitor' | 'window';
    label: string;
    width: number;
    height: number;
    primary: boolean;
    thumbnail_b64: string | null;
  }[];
  onPick: (id: string) => void;
  onCancel: () => void;
}

/// Tile representing one capture source. Square-ish thumbnail (16:9) above
/// a one-line label. Clicking picks the source.
function SourceTile({
  source,
  onPick,
}: {
  source: CaptureSourcePickerProps['sources'][number];
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(source.id)}
      className="group flex flex-col gap-1 rounded border border-cue-subtle/40 bg-cue-surface/50 p-1.5 text-left transition hover:border-cue-accent hover:bg-cue-accent/10"
      title={`${source.label} (${source.width}×${source.height})`}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded bg-black/40">
        {source.thumbnail_b64 ? (
          <img
            src={`data:image/png;base64,${source.thumbnail_b64}`}
            alt={source.label}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-cue-muted">
            No preview
          </div>
        )}
        {source.primary && (
          <span className="absolute right-1 top-1 rounded bg-cue-accent/80 px-1 text-[8px] uppercase text-white">
            primary
          </span>
        )}
      </div>
      <span className="block truncate text-[10px] text-cue-text group-hover:text-white">
        {source.label}
      </span>
    </button>
  );
}

function CaptureSourcePicker({ open, loading, sources, onPick, onCancel }: CaptureSourcePickerProps) {
  if (!open) return null;
  const monitors = sources.filter((s) => s.kind === 'monitor');
  const windows = sources.filter((s) => s.kind === 'window');
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">Pick what to capture</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-cue-muted hover:text-cue-text"
          aria-label="Cancel"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading && (
          <div className="flex flex-col items-center justify-center py-6 text-cue-muted">
            <div className="mb-2 h-5 w-5 animate-spin rounded-full border-2 border-cue-accent border-t-transparent" />
            <span>Capturing previews…</span>
          </div>
        )}
        {!loading && monitors.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[10px] uppercase tracking-wide text-cue-muted">
              Entire screen
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {monitors.map((s) => (
                <SourceTile key={s.id} source={s} onPick={onPick} />
              ))}
            </div>
          </section>
        )}
        {!loading && windows.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[10px] uppercase tracking-wide text-cue-muted">
              Window
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {windows.map((s) => (
                <SourceTile key={s.id} source={s} onPick={onPick} />
              ))}
            </div>
          </section>
        )}
        {!loading && monitors.length === 0 && windows.length === 0 && (
          <div className="text-center text-cue-muted py-4">No capture sources available.</div>
        )}
      </div>
      <div className="mt-2 flex justify-end pt-2 border-t border-cue-subtle/40">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-cue-subtle/60 px-3 py-1 text-cue-text hover:border-cue-subtle"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
