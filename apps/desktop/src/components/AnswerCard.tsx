import ReactMarkdown from 'react-markdown';
import type { StreamingAnswer } from '../hooks/useTauriEvents';

interface Props {
  answer: StreamingAnswer;
  onCopy?: () => void;
}

export function AnswerCard({ answer, onCopy }: Props) {
  if (!answer.text && !answer.error) return null;

  return (
    <div className="rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-3">
      {answer.fallback && (
        <p className="mb-2 text-[10px] uppercase tracking-wide text-amber-300">
          Fallback model
        </p>
      )}
      {answer.error ? (
        <p className="text-xs text-red-300">Error: {answer.error}</p>
      ) : (
        <div className="prose prose-invert prose-sm max-w-none text-cue-text">
          <ReactMarkdown>{answer.text}</ReactMarkdown>
        </div>
      )}
      {answer.done && answer.text && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(answer.text);
            onCopy?.();
          }}
          className="mt-2 rounded bg-cue-accent px-2 py-0.5 text-[10px] font-medium text-white"
        >
          Copy
        </button>
      )}
    </div>
  );
}
