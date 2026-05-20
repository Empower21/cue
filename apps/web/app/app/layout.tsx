import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'cue — web copilot',
  description: 'Real-time interview & meeting copilot in the browser.',
};

// The marketing nav + footer wrap the (/) route group. The copilot route
// needs the full viewport, so we re-render `children` without them.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-cue-bg">{children}</div>;
}
