import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

// Wraps every marketing-tier route ('/', '/eula', '/changelog', '/guide',
// '/download') with the marketing nav + footer. The `/app` copilot lives
// outside this group and so renders without these.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
