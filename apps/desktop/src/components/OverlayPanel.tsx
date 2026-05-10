import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModeSelector, type Mode } from './ModeSelector';
import { TranscriptStream } from './TranscriptStream';
import { AnswerCard } from './AnswerCard';
import { ContextLoader } from './ContextLoader';
import { SettingsPanel } from './SettingsPanel';
import {
  useAudioSignal,
  useAnswer,
  useTranscript,
  type StreamingAnswer,
} from '../hooks/useTauriEvents';

const QUESTION_REGEX =
  /^(what|how|why|when|where|who|can|could|would|should|is|are|do|does|did|tell|describe|explain)\b/i;
const DEBOUNCE_MS = 3000;

export function OverlayPanel() {
  const [mode, setMode] = useState<Mode>('listen');
  const [running, setRunning] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [askInput, setAskInput] = useState('');
  const [autoAnswers, setAutoAnswers] = useState<StreamingAnswer[]>([]);

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
    if (running) {
      await invoke('stop_capture');
      setRunning(false);
    } else {
      await invoke('start_capture');
      setRunning(true);
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col rounded-xl bg-cue-bg p-3 shadow-2xl backdrop-blur-md ring-1 ring-white/10">
      <header
        data-tauri-drag-region
        className="flex items-center justify-between pb-2 cursor-grab active:cursor-grabbing"
      >
        <span className="text-xs font-semibold tracking-wide text-cue-text">cue</span>
        <div className="flex items-center gap-2">
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
          <span className="text-[10px] text-cue-muted">⌘\</span>
        </div>
      </header>

      <ModeSelector mode={mode} setMode={setMode} />

      <div className="mt-2 flex items-center justify-between rounded-md bg-black/20 px-3 py-2 text-xs">
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
                    className="flex-1 rounded border border-cue-subtle/40 bg-black/30 px-2 py-1 text-xs text-cue-text"
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

      <footer className="border-t border-white/10 pt-2 text-[10px] text-cue-muted">
        Mode: <span className="text-cue-text">{mode}</span>
      </footer>

      <ContextLoader open={showContext} onClose={() => setShowContext(false)} />
      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
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
