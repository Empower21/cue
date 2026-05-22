import type { Metadata } from 'next';
import { DesktopBrowserGate } from '@/components/copilot/DesktopBrowserGate';

export const metadata: Metadata = {
  title: 'cue — mobile copilot',
  description: 'Mobile second-screen copilot for interviews, meetings, and study sessions.',
};

// The marketing nav + footer wrap the (/) route group. The copilot route
// needs the full viewport, so we re-render `children` without them. The
// DesktopBrowserGate keeps phones unobstructed while showing a "use on
// mobile" landing to anyone who reaches /app from a laptop browser.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cue-bg">
      <DesktopBrowserGate>{children}</DesktopBrowserGate>
    </div>
  );
}
