'use client';

import ReactMarkdownRaw from 'react-markdown';
import { useTranslation } from 'react-i18next';
import type { StreamingAnswer } from './useCopilotState';

// react-markdown@9 was built against React 18 types. React 19 narrowed
// ReactNode such that the lib's exported component signature no longer
// type-checks, even though it renders fine at runtime. We cast through
// `any` deliberately rather than waiting on the lib's React 19 release.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactMarkdown: any = ReactMarkdownRaw;

export function AnswerCard({ answer }: { answer: StreamingAnswer }) {
  const { t } = useTranslation();
  if (!answer.text && !answer.error && answer.done) return null;
  return (
    <div className="rounded-lg border border-cue-accent/40 bg-cue-bg/60 p-4 text-sm">
      {!answer.text && !answer.done && !answer.error && (
        <div className="flex items-center gap-2 text-cue-muted">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cue-accent" />
          {t('panel.thinking')}
        </div>
      )}
      {answer.text && (
        <div className="text-sm leading-relaxed text-cue-text [&_code]:rounded [&_code]:bg-cue-bg/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_li]:ml-4 [&_li]:list-disc [&_p+p]:mt-2 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-cue-bg/80 [&_pre]:p-3 [&_strong]:font-semibold [&_ul]:my-2">
          <ReactMarkdown>{answer.text}</ReactMarkdown>
        </div>
      )}
      {answer.error && (
        <div className="mt-2 rounded bg-red-500/20 p-2 text-xs text-red-200">
          {t('panel.errorLabel')}: {answer.error}
        </div>
      )}
    </div>
  );
}
