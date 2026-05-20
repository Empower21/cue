import { Hero } from '@/components/Hero';
import { Features } from '@/components/Features';
import { HowItWorks } from '@/components/HowItWorks';
import { DownloadCTA } from '@/components/DownloadCTA';

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <DownloadCTA />
    </>
  );
}
