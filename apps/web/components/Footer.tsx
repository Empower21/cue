import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-32 border-t border-cue-subtle/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-cue-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          cue — personal-use AI co-pilot. © {new Date().getFullYear()} the cue contributors.
        </p>
        <div className="flex gap-6">
          <Link href="/guide" className="transition hover:text-cue-text">Guide</Link>
          <Link href="/eula" className="transition hover:text-cue-text">License</Link>
          <Link href="/changelog" className="transition hover:text-cue-text">Changelog</Link>
        </div>
      </div>
    </footer>
  );
}
