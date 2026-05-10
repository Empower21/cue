import { headers } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ALL_PLATFORMS, detectPlatform } from '@/lib/platform';

export const metadata: Metadata = {
  title: 'Download — cue',
  description: 'Download cue for your platform.',
};

export default async function DownloadPage() {
  const ua = (await headers()).get('user-agent');
  const detected = detectPlatform(ua);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Download cue</h1>
      <p className="mt-4 text-cue-muted">
        Free, personal-use only. No account required. By installing, you agree to the{' '}
        <Link href="/eula" className="underline transition hover:text-cue-text">
          personal-use license
        </Link>
        .
      </p>

      {detected.key ? (
        <section className="mt-10 rounded-2xl border border-cue-subtle/60 bg-cue-surface/40 p-8">
          <p className="text-xs uppercase tracking-wide text-cue-accent">Detected</p>
          <h2 className="mt-2 text-2xl font-semibold">{detected.label}</h2>
          <a
            href={`/api/download/${detected.key}`}
            className="mt-6 inline-block rounded-md bg-cue-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-cue-accentHover"
          >
            Download {detected.fileType === 'dmg' ? '.dmg' : '.msi'}
          </a>
        </section>
      ) : (
        <section className="mt-10 rounded-2xl border border-cue-subtle/60 bg-cue-surface/40 p-8">
          <p className="text-cue-text">
            We could not detect your platform. Pick from the list below.
          </p>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">All downloads</h2>
        <ul className="mt-4 divide-y divide-cue-subtle/40 rounded-lg border border-cue-subtle/40">
          {ALL_PLATFORMS.map((p) => (
            <li
              key={p.key}
              className="flex items-center justify-between px-5 py-4 text-sm"
            >
              <span className="text-cue-text">{p.label}</span>
              <a
                href={`/api/download/${p.key}`}
                className="rounded-md border border-cue-subtle/60 px-4 py-1.5 text-xs font-medium transition hover:border-cue-subtle"
              >
                .{p.fileType}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-6 text-sm text-cue-muted">
        <p className="font-medium text-cue-text">No releases yet?</p>
        <p className="mt-2">
          If the download links return a 404, the first release has not yet been published. The{' '}
          <Link href="/changelog" className="underline transition hover:text-cue-text">
            changelog
          </Link>{' '}
          shows release history.
        </p>
      </section>

      <Link
        href="/"
        className="mt-12 inline-block text-sm text-cue-muted underline transition hover:text-cue-text"
      >
        ← Back to home
      </Link>
    </main>
  );
}
