import Link from 'next/link';

export function DownloadCTA() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <div className="rounded-2xl border border-cue-subtle/60 bg-cue-surface/40 px-8 py-12 text-center sm:px-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Ready when your next call is.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-cue-muted">
          One download for your platform. No account. No subscription. Personal use only.
        </p>
        <Link
          href="/download"
          className="mt-8 inline-block rounded-md bg-cue-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-cue-accentHover"
        >
          Pick your platform
        </Link>
      </div>
    </section>
  );
}
