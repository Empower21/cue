import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window';
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
} from '../hooks/useTauriEvents';

const QUESTION_REGEX =
  /^(what|how|why|when|where|who|can|could|would|should|is|are|do|does|did|tell|describe|explain)\b/i;
const DEBOUNCE_MS = 3000;

const EXPANDED_SIZE = new LogicalSize(360, 480);
const COLLAPSED_SIZE = new LogicalSize(140, 32);

export function OverlayPanel() {
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

  const handleDragStart = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('button') || t.closest('input') || t.closest('textarea')) return;
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
  // noUncheckedIndexedAccess guard: transcript[n] can be undefined.
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
        <span className="text-xs font-semibold tracking-wide text-cue-text">cue</span>
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
        <span className="text-sm font-semibold tracking-wide text-cue-text">cue</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAlsoClearContext(false);
              setShowEndConfirm(true);
            }}
            className="text-[10px] text-cue-muted hover:text-red-400"
          >
            End
          </button>
          <button
            type="button"
            onClick={() => setShowContext(true)}
            className="text-[10px] text-cue-muted hover:text-cue-text"
          >
            Context
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
          {running ? 'Stop' : 'Start'}
        </button>
        <Dot label="you" voiced={mic.voiced} />
        <Dot label="them" voiced={system.voiced} />
      </div>

      <main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
        {!running && (
          <div className="flex h-full items-center justify-center text-center text-xs text-cue-muted">
            <div>Press Start to begin.</div>
          </div>
        )}

        {running && (
          <div className="flex h-full flex-col gap-3">
            {/* Transcript always visible while running */}
            <div className="flex-1 overflow-y-auto">
              <TranscriptStream />
            </div>

            {/* Ask mode: manual question input + single streaming answer */}
            {mode === 'ask' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={askInput}
                    onChange={(e) => setAskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAsk();
                    }}
                    placeholder="Ask anything (Cmd/Ctrl+Enter to send)"
                    className="flex-1 rounded border border-cue-subtle/40 bg-cue-surface px-2 py-1 text-xs text-cue-text"
                  />
                  <button
                    type="button"
                    onClick={submitAsk}
                    className="rounded bg-cue-accent px-2 text-xs text-white"
                  >
                    Ask
                  </button>
                </div>
                <AnswerCard answer={answer} />
              </div>
            )}

            {/* Auto mode: live answer + accumulated past answers (newest-first) */}
            {mode === 'auto' && (
              <div className="space-y-2">
                <AnswerCard answer={answer} />
                {autoAnswers
                  .slice()
                  .reverse()
                  .map((a, i) => (
                    // Key uses index + stable text prefix as a lightweight stable key.
                    <AnswerCard key={`${i}-${a.text.slice(0, 20)}`} answer={a} />
                  ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-cue-subtle pt-2 text-[10px] text-cue-muted">
        Mode: <span className="text-cue-text">{mode}</span>
        {error && (
          <div className="mt-1 rounded bg-red-100 px-2 py-1 text-red-700">
            <strong>Error:</strong> {error}
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
            // Clears transcripts in both useTranscript subscribers plus
            // the streaming answer card. Local-only state is cleared below.
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
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">End this session?</h2>
        <button type="button" onClick={onCancel} className="text-cue-muted">
          ✕
        </button>
      </header>
      <ul className="space-y-1 text-cue-muted">
        <li>• Stops transcription</li>
        <li>• Clears all answer cards</li>
        <li>• Clears live transcript</li>
      </ul>
      <label className="mt-3 flex items-start gap-2 text-cue-text">
        <input
          type="checkbox"
          checked={alsoClearContext}
          onChange={(e) => onToggleAlsoClearContext(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Also clear pasted Job Description, Resume, and Role/Company
          <span className="block text-[10px] text-cue-muted">
            API keys are kept either way.
          </span>
        </span>
      </label>
      <div className="mt-auto flex justify-end gap-2 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-cue-subtle/60 px-3 py-1 text-cue-text hover:border-cue-subtle"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded bg-red-500/90 px-3 py-1 text-white hover:bg-red-500"
        >
          End Session
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
