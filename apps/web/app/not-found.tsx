import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-cue-muted">404</p>
      <h1 className="mt-4 text-3xl font-semibold">Page not found</h1>
      <Link
        href="/"
        className="mt-8 rounded-md bg-cue-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-cue-accentHover"
      >
        Back to home
      </Link>
    </main>
  );
}
