import Link from 'next/link';

export function Nav() {
  return (
    <nav className="border-b border-cue-subtle/40 bg-cue-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-cue-accent text-sm font-bold text-white">
            c
          </span>
          cue
        </Link>
        <div className="flex items-center gap-6 text-sm text-cue-muted">
          <Link href="/changelog" className="transition hover:text-cue-text">Changelog</Link>
          <Link href="/eula" className="transition hover:text-cue-text">EULA</Link>
          <Link
            href="/download"
            className="rounded-md bg-cue-accent px-3 py-1.5 font-medium text-white transition hover:bg-cue-accentHover"
          >
            Download
          </Link>
        </div>
      </div>
    </nav>
  );
}
