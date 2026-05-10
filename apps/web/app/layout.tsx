import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'cue — AI co-pilot for interviews & meetings',
  description: 'Real-time notes and contextual answers in a minimalist desktop overlay.',
  icons: { icon: '/favicon.svg' },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-cue-bg text-cue-text">
        <Nav />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
