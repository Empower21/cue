import Link from 'next/link';

export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 sm:pt-32 sm:pb-24">
      <p className="text-sm font-medium text-cue-accent">Personal-use • macOS · Windows</p>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
        Your AI co-pilot for{' '}
        <span className="text-cue-accent">interviews</span> and{' '}
        <span className="text-cue-accent">meetings</span>.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-cue-muted">
        Real-time notes and contextual answers in a minimalist overlay. Captures both sides of the
        conversation locally, hides cleanly from your screen-share, and pulls context from the job
        description and resume you paste in.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link
          href="/download"
          className="rounded-md bg-cue-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-cue-accentHover"
        >
          Download for your platform
        </Link>
        <Link
          href="/changelog"
          className="rounded-md border border-cue-subtle/60 px-5 py-2.5 text-sm font-medium text-cue-text transition hover:border-cue-subtle"
        >
          See what's new
        </Link>
      </div>
      <p className="mt-6 text-xs text-cue-muted">
        Personal-use only. You are responsible for compliance with local recording laws and the
        terms of any meeting platform you use it with.{' '}
        <Link href="/eula" className="underline transition hover:text-cue-text">
          Read the license
        </Link>
        .
      </p>
    </section>
  );
}
