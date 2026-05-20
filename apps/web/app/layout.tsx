import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'cue — AI co-pilot for interviews & meetings',
  description: 'Real-time notes and contextual answers in a minimalist desktop overlay.',
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'cue',
    description: 'Your AI co-pilot for interview prep & meeting notes.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'cue',
    description: 'Your AI co-pilot for interview prep & meeting notes.',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0b0b0e',
};

// Root layout: html + body shell only. Marketing chrome (Nav, Footer) lives
// in `app/(marketing)/layout.tsx` so `/app` — which is OUTSIDE that route
// group — gets a clean viewport.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cue-bg text-cue-text">{children}</body>
    </html>
  );
}
