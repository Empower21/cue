'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { detectBrowserLanguage, isLanguage } from '@/lib/i18n';
import type { Language } from '@cue/shared';
import { useCopilotState } from '@/components/copilot/useCopilotState';
import { ContextDrawer } from '@/components/copilot/ContextDrawer';
import { SettingsDrawer } from '@/components/copilot/SettingsDrawer';
import { TranscriptView } from '@/components/copilot/TranscriptView';
import { AnswerCard } from '@/components/copilot/AnswerCard';
import { ModeSelector, type Mode } from '@/components/copilot/ModeSelector';
import { usePiP } from '@/components/copilot/usePiP';
import i18next from 'i18next';

const QUESTION_REGEX =
  /^(what|how|why|when|where|who|can|could|would|should|is|are|do|does|did|tell|describe|explain)\b/i;
const AUTO_DEBOUNCE_MS = 3000;

export default function CopilotPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('listen');
  const [showContext, setShowContext] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [askInput, setAskInput] = useState('');
  // Visibility banner — shown once per device until dismissed. Tells the
  // user this is the *web* version and won't be invisible to screen share
  // on the same machine. The dismiss state lives in localStorage so it
  // doesn't nag after they've read it.
  const [showVisibilityNotice, setShowVisibilityNotice] = useState(false);
  useEffect(() => {
    if (window.localStorage.getItem('cue.web.dismissedVisibilityNotice') !== '1') {
      setShowVisibilityNotice(true);
    }
  }, []);

  const {
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
  } = useCopilotState();

  const { pipWindow, supported: pipSupported, open: openPiP, close: closePiP } = usePiP();

  // Auto-pop the answer card when the user clicks Start. Document PiP
  // needs a user-gesture context to open, and the Start click satisfies
  // that. If it fails (browser without PiP, or gesture lost across an
  // await), we silently fall through — the user can still click Pop out
  // manually.
  const handleStartClick = async () => {
    if (running) {
      stop();
      closePiP();
      return;
    }
    if (pipSupported && !pipWindow) {
      try {
        await openPiP();
      } catch {
        // Best-effort. User can still click Pop out manually below.
      }
    }
    start();
  };

  // Mic is persisted; system audio is session-only and resets on every
  // page load. The user sees both states on the chips above the transcript.
  const micOn = config.captureMic !== false;
  const systemOn = captureSystem;

  // Persist mode in localStorage so it survives reloads. Reads on mount.
  useEffect(() => {
    const saved = window.localStorage.getItem('cue.web.mode');
    if (saved === 'listen' || saved === 'ask' || saved === 'auto') setMode(saved);
  }, []);
  useEffect(() => {
    window.localStorage.setItem('cue.web.mode', mode);
  }, [mode]);

  // Post-hydration: switch to the user's preferred language.
  //   1. Persisted `config.language` wins (Settings drawer choice).
  //   2. Else `navigator.languages` if it matches one of the 9 we ship.
  //   3. Else stay on 'en'.
  // Critically — this only runs AFTER the first paint. The first paint
  // always uses 'en' to match SSR HTML byte-for-byte. Changing language
  // here re-renders client-only, no hydration warning.
  useEffect(() => {
    const target: Language = config.language && isLanguage(config.language)
      ? config.language
      : detectBrowserLanguage();
    if (target !== i18next.language) {
      void i18next.changeLanguage(target);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.dir = target === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = target;
    }
  }, [config.language]);

  const handleLanguageChange = (lang: Language) => {
    void i18next.changeLanguage(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
  };

  const submitAsk = () => {
    if (!askInput.trim()) return;
    void ask(askInput.trim());
    setAskInput('');
  };

  // Auto mode: when a final system-channel utterance looks like a question
  // and the 3s debounce has elapsed, fire ask() automatically.
  const lastAutoFireAt = useRef(0);
  useEffect(() => {
    if (mode !== 'auto' || transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (!last || !last.isFinal || last.channel !== 'system') return;
    const now = Date.now();
    if (now - lastAutoFireAt.current < AUTO_DEBOUNCE_MS) return;
    if (last.text.includes('?') || QUESTION_REGEX.test(last.text)) {
      lastAutoFireAt.current = now;
      void ask(last.text);
    }
  }, [transcript, mode, ask]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-cue-subtle/40 bg-cue-bg/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-cue-accent text-sm font-bold text-white">
            c
          </span>
          <span className="hidden sm:inline">{t('app.title')}</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setShowContext(true)}
            className="rounded-md border border-cue-subtle/50 px-3 py-1 text-xs hover:border-cue-accent"
          >
            {t('panel.context')}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="rounded-md border border-cue-subtle/50 px-3 py-1 text-xs hover:border-cue-accent"
            aria-label={t('settings.title')}
          >
            ⚙
          </button>
        </div>
      </header>

      {showVisibilityNotice && (
        <div className="flex items-start gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-100 sm:px-6">
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
            <path d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM10 6a1 1 0 011 1v3a1 1 0 11-2 0V7a1 1 0 011-1zm0 7a1 1 0 100 2 1 1 0 000-2z" />
          </svg>
          <p className="flex-1 leading-snug">
            {t('panel.visibilityNotice')}{' '}
            <Link href="/download" className="underline underline-offset-2 hover:text-amber-50">
              {t('panel.getDesktop')}
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={() => {
              setShowVisibilityNotice(false);
              window.localStorage.setItem('cue.web.dismissedVisibilityNotice', '1');
            }}
            className="text-amber-200/70 hover:text-amber-50"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[1fr_1.1fr] lg:gap-6">
        <section className="flex flex-col rounded-xl border border-cue-subtle/30 bg-cue-surface/40 p-4">
          {/* Purpose picker — chooses which system prompt the server uses.
             Interview: tight opener + supporting bullets, grounded in resume/JD.
             Meeting:   summarise + suggest a follow-up.
             Study:     step-by-step + a check question.
             Persisted in localStorage so users default to their main use case. */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-cue-muted">{t('purpose.label')}:</span>
            {(['interview', 'meeting', 'study'] as const).map((p) => {
              const active = (config.purpose ?? 'interview') === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateConfig({ purpose: p })}
                  disabled={running}
                  className={
                    'rounded-full border px-3 py-1 transition disabled:opacity-50 ' +
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleStartClick()}
              className="rounded-md bg-cue-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-cue-accentHover"
            >
              {running ? t('app.stop') : t('app.start')}
            </button>
            <button
              type="button"
              onClick={answerLatest}
              disabled={!transcript.some((u) => u.isFinal)}
              className="rounded-md border border-cue-accent/60 px-3 py-1.5 text-sm hover:bg-cue-accent/10 disabled:opacity-40"
            >
              {t('panel.answer')}
            </button>
            <button
              type="button"
              onClick={() => void screenshot(askInput.trim() || undefined)}
              className="rounded-md border border-cue-subtle/50 px-3 py-1.5 text-sm hover:border-cue-accent"
              title={t('panel.screenshotHelp')}
            >
              {t('panel.screenshot')}
            </button>
            {pipSupported && (
              <button
                type="button"
                onClick={pipWindow ? closePiP : openPiP}
                className={
                  'rounded-md border px-3 py-1.5 text-sm transition ' +
                  (pipWindow
                    ? 'border-emerald-400 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20'
                    : 'border-cue-subtle/50 hover:border-cue-accent')
                }
                title="Open the answer card in a separate OS window — not captured when sharing only this tab"
              >
                {pipWindow ? '⇲ ' + t('panel.closePiP') : '⇱ ' + t('panel.popOut')}
              </button>
            )}
            <button
              type="button"
              onClick={resetSession}
              className="ml-auto text-xs text-cue-muted hover:text-red-400"
            >
              {t('app.end')}
            </button>
          </div>

          {/* Per-source capture chips. Mic persists; System audio resets to
             OFF on every reload (session-local) so screen share is always
             an explicit, deliberate choice. */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => updateConfig({ captureMic: !micOn })}
              disabled={running}
              className={
                'rounded-full border px-3 py-1 transition disabled:opacity-50 ' +
                (micOn
                  ? 'border-cue-accent bg-cue-accent/15 text-cue-text'
                  : 'border-cue-subtle/60 text-cue-muted hover:text-cue-text')
              }
              title="Capture your microphone"
            >
              <span className="mr-1">{micOn ? '●' : '○'}</span>
              Mic
            </button>
            <button
              type="button"
              onClick={() => setCaptureSystem(!systemOn)}
              disabled={running}
              className={
                'rounded-full border px-3 py-1 transition disabled:opacity-50 ' +
                (systemOn
                  ? 'border-amber-400 bg-amber-400/15 text-amber-100'
                  : 'border-cue-subtle/60 text-cue-muted hover:text-cue-text')
              }
              title="Capture the other side's audio — requires screen share"
            >
              <span className="mr-1">{systemOn ? '●' : '○'}</span>
              System audio
            </button>
            {running && (
              <span className="text-[11px] text-cue-muted">
                Stop to change toggles
              </span>
            )}
          </div>

          {/* Heads-up banner — only shows when System audio is armed and we
             haven't started yet. Tells the user EXACTLY what will happen
             when they click Start, and how to silence Otter / similar
             extensions that auto-attach to media calls. */}
          {systemOn && !running && (
            <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              <p className="font-semibold">Heads up — clicking Start will:</p>
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                <li>open the system share-screen picker (pick a Window, Tab, or Entire Screen — check &quot;Share audio&quot;)</li>
                <li>request your microphone if Mic is also on</li>
                <li>likely trigger Chrome&apos;s &quot;Meeting detected&quot; bubble</li>
                <li>wake up meeting-recording extensions (Otter, Read.ai, Fathom) — to silence them: open the extension menu and either disable for this site or click &quot;Don&apos;t join&quot;</li>
              </ul>
              <p className="mt-2 text-amber-200/80">
                Want to skip all of this? Click the chip above to turn System audio off — only your mic will be captured.
              </p>
            </div>
          )}

          {running && systemOn && !systemAudioAvailable && (
            <div className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              System audio wasn&apos;t granted. Stop, then Start again and pick &quot;Entire Screen&quot; or a Window with &quot;Share audio&quot; checked.
            </div>
          )}

          <div className="mt-3 flex-1 overflow-y-auto rounded-lg bg-cue-bg/40 p-3">
            <TranscriptView utterances={transcript} />
          </div>

          {mode === 'ask' && (
            <div className="mt-3 flex gap-2">
              <input
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitAsk();
                  }
                }}
                placeholder={t('panel.askPlaceholder')}
                className="flex-1 rounded-md border border-cue-subtle/50 bg-cue-bg px-3 py-2 text-sm focus:border-cue-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={submitAsk}
                className="rounded-md bg-cue-accent px-4 py-2 text-sm font-medium text-white hover:bg-cue-accentHover"
              >
                {t('panel.ask')}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-2 rounded bg-red-500/20 px-2 py-1 text-xs text-red-200">
              {t('panel.errorLabel')}: {error}
            </div>
          )}

          <footer className="mt-3 border-t border-cue-subtle/40 pt-2 text-[11px] text-cue-muted">
            {t('modes.label')}: <span className="text-cue-text">{t(`modes.${mode}`)}</span>
            {mode === 'listen' && ' — transcript only, no auto-answers'}
            {mode === 'ask' && ' — type or use Answer button'}
            {mode === 'auto' && ' — questions trigger an answer automatically'}
          </footer>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-cue-subtle/30 bg-cue-surface/40 p-4">
          <header className="flex items-center justify-between text-xs uppercase tracking-wide text-cue-muted">
            <span>{t('panel.answer')}</span>
            {answer.fallback && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] normal-case text-amber-200">
                HuggingFace fallback
              </span>
            )}
            {pipWindow && (
              <span className="rounded bg-emerald-400/20 px-2 py-0.5 text-[10px] normal-case text-emerald-200">
                {t('panel.poppedOut')}
              </span>
            )}
          </header>
          {pipWindow ? (
            <>
              <p className="text-sm text-cue-muted">{t('panel.poppedOutNote')}</p>
              {createPortal(
                <div style={{ padding: '16px', minHeight: '100vh' }}>
                  <AnswerCard answer={answer} />
                </div>,
                pipWindow.document.body,
              )}
            </>
          ) : (
            <AnswerCard answer={answer} />
          )}
          {!answer.text && !answer.error && answer.done && !pipWindow && (
            <p className="text-sm text-cue-muted">{t('panel.pressStart')}</p>
          )}
        </section>
      </div>

      <ContextDrawer
        open={showContext}
        config={config}
        onChange={updateConfig}
        onClear={clearContext}
        onClose={() => setShowContext(false)}
      />
      <SettingsDrawer
        open={showSettings}
        config={config}
        onChange={updateConfig}
        onLanguageChange={handleLanguageChange}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
