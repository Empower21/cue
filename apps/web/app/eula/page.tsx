import { EULA_TEXT, EULA_VERSION } from '@cue/shared';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'License — cue',
  description: 'Personal-use license for cue.',
};

export default function EulaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <p className="text-sm text-cue-muted">License v{EULA_VERSION}</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        cue Personal-Use License
      </h1>
      <p className="mt-6 text-cue-muted">
        cue is provided for personal, non-commercial use. By installing or running cue, you agree
        to the terms below.
      </p>

      <pre className="mt-10 whitespace-pre-wrap rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-6 text-sm leading-relaxed text-cue-text">
        {EULA_TEXT}
      </pre>

      <div className="mt-10 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-6 text-sm leading-relaxed text-cue-muted">
        <p className="font-medium text-cue-text">Full license text</p>
        <p className="mt-2">
          The complete license is shipped with every install (file: <code>LICENSE</code>) and is
          available in the project repository.
        </p>
      </div>

      <Link
        href="/"
        className="mt-10 inline-block text-sm text-cue-muted underline transition hover:text-cue-text"
      >
        ← Back to home
      </Link>
    </main>
  );
}
