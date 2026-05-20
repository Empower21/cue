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

export function OverlayPanel() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('listen');
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

  const lastTriggerAt = useRef(0);

  // Auto mode: detect questions in system-channel transcripts.
  useEffect(() => {
    if (mode !== 'auto' || transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (!last || !last.isFinal || last.channel !== 'system') return;
    const now = Date.now();
    if (now - lastTriggerAt.current < DEBOUNCE_MS) return;
    if (last.text.includes('?') || QUESTION_REGEX.test(last.text)) {
      lastTriggerAt.current = now;
      reset();
      void invoke('ask', { mode: 'interview', trigger: last.text });
    }
  }, [transcript, mode, reset]);

  const submitAsk = () => {
    if (!askInput.trim()) return;
    reset();
    void invoke('ask', { mode: 'interview', trigger: askInput.trim() });
    setAskInput('');
  };

  // Manual "Answer" button: take the last final utterance as the question.
  const manualAnswer = () => {
    const trigger = pickAnswerTrigger(transcript);
    if (!trigger) {
      setError('No transcript yet — speak first, then press Answer.');
      return;
    }
    setError(null);
    lastTriggerAt.current = Date.now();
    reset();
    void invoke('ask', { mode: 'interview', trigger });
  };

  // Screenshot button: capture screen, send to vision model with a generic
  // "answer what's on screen" prompt. If the user has typed an Ask question,
  // we use that as the prompt instead — most useful for "solve this leetcode
  // problem" where context lives in the visible code editor.
  const screenshotAnswer = async () => {
    setError(null);
    setCapturingScreen(true);
    try {
      const image_b64 = await invoke<string>('capture_screen');
      const trigger = askInput.trim()
        ? askInput.trim()
        : "Solve or explain whatever is currently on the candidate's screen. If it's a coding problem, give a runnable solution and walk through the approach in 3-5 bullets.";
      reset();
      await invoke('ask_with_image', { mode: 'interview', trigger, image_b64 });
      setAskInput('');
    } catch (err) {
      setError(String(err));
    } finally {
      setCapturingScreen(false);
    }
  };

  // Snapshot finished auto-mode answers so they accumulate in the list.
  useEffect(() => {
    if (mode === 'auto' && answer.done && answer.text) {
      setAutoAnswers((prev) => [...prev, answer]);
    }
  }, [answer, mode]);

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

      {/* Action row: manual Answer + Screenshot — always available, even in Listen mode */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={manualAnswer}
          className="flex-1 rounded border border-cue-accent/60 bg-cue-accent/20 px-2 py-1 text-xs text-cue-text hover:bg-cue-accent/30"
          title={t('panel.answer')}
        >
          {t('panel.answer')}
        </button>
        <button
          type="button"
          onClick={screenshotAnswer}
          disabled={capturingScreen}
          className="flex-1 rounded border border-cue-subtle/60 bg-cue-surface px-2 py-1 text-xs text-cue-text hover:border-cue-accent disabled:opacity-50"
          title={t('panel.screenshot')}
        >
          {capturingScreen ? t('panel.analysingScreen') : t('panel.screenshot')}
        </button>
      </div>

      <main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
        {!running && (
          <div className="flex h-full items-center justify-center text-center text-xs text-cue-muted">
            <div>{t('panel.pressStart')}</div>
          </div>
        )}

        {running && (
          <div className="flex h-full flex-col gap-3">
            <div className="flex-1 overflow-y-auto">
              <TranscriptStream />
            </div>

            {mode === 'ask' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={askInput}
                    onChange={(e) => setAskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAsk();
                    }}
                    placeholder={t('panel.askPlaceholder')}
                    className="flex-1 rounded border border-cue-subtle/40 bg-cue-surface px-2 py-1 text-xs text-cue-text"
                  />
                  <button
                    type="button"
                    onClick={submitAsk}
                    className="rounded bg-cue-accent px-2 text-xs text-white"
                  >
                    {t('panel.ask')}
                  </button>
                </div>
                <AnswerCard answer={answer} />
              </div>
            )}

            {mode !== 'ask' && (
              <div className="space-y-2">
                <AnswerCard answer={answer} />
                {autoAnswers
                  .slice()
                  .reverse()
                  .map((a, i) => (
                    <AnswerCard key={`${i}-${a.text.slice(0, 20)}`} answer={a} />
                  ))}
              </div>
            )}
          </div>
        )}
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
