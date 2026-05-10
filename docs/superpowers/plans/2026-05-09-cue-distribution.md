# cue Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js 15 marketing site (`apps/web`), deploy it to Vercel as a separate project under `amdrentcorp-5032s-projects` (firewalled from amdrautomate.ai), and ship a GitHub Actions workflow that publishes signed desktop binaries to GitHub Releases on tag push. By the end of this plan, the user has a live marketing URL with OS-detected download links, an EULA page, a changelog page, and a Tauri-updater manifest endpoint — all of which work even before Plan 1's Tauri binaries exist (graceful "no release yet" handling).

**Architecture:** Next.js 15 App Router. Server Components by default, Client Components only where genuinely interactive (no client JS for the download page — UA detection happens server-side via `next/headers`). Tailwind for styling, sharing the `cue` color palette from `apps/desktop`. `vercel.ts` for project config (TS-native — replaces `vercel.json` per the 2026 Vercel knowledge update). Two API routes: `/api/download/[platform]` proxies/redirects to the latest GitHub Release asset, and `/api/manifest` returns the Tauri-updater-compatible JSON feed. GitHub Actions handles the build matrix (macOS + Windows) and uploads to a tagged release.

**Tech Stack:** Next.js 15.x, React 19, TypeScript 5.4+, Tailwind CSS 3.4, `@cue/shared` workspace package (already exists from Plan 1 Task 3), Vercel platform with `@vercel/config` for TS-native config, GitHub Actions with `tauri-apps/tauri-action`.

**Independence from Plan 1:** This plan does NOT require Plan 1 to be complete. The web app, deployment, and CI all ship standalone. The download routes return a polite "release coming soon" payload until the first GitHub Release exists. CI workflow runs are skipped until you push the first `v*.*.*` tag.

---

## File structure (created by this plan)

```
cue/
├── apps/web/
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── vercel.ts
│   ├── .env.example
│   ├── .gitignore                       # next-specific (.next/, .vercel/)
│   ├── public/
│   │   └── favicon.svg                  # tiny placeholder
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                     # /
│   │   ├── globals.css
│   │   ├── not-found.tsx
│   │   ├── download/page.tsx            # /download
│   │   ├── eula/page.tsx                # /eula
│   │   ├── changelog/page.tsx           # /changelog
│   │   └── api/
│   │       ├── download/[platform]/route.ts
│   │       └── manifest/route.ts
│   ├── components/
│   │   ├── Hero.tsx
│   │   ├── Features.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── DownloadCTA.tsx
│   │   ├── Footer.tsx
│   │   └── Nav.tsx
│   └── lib/
│       ├── platform.ts                  # UA → platform key
│       └── github-release.ts            # GitHub Releases API client (cached)
│
└── .github/
    └── workflows/
        └── release.yml                  # build + upload on tag push
```

---

## Task 1: Bootstrap `apps/web` (Next.js 15 + Tailwind + TS)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/.env.example`
- Create: `apps/web/.gitignore`
- Create: `apps/web/public/favicon.svg`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/not-found.tsx`
- Create: `apps/web/app/page.tsx` (minimal — real content in Task 4)

- [ ] **Step 1.1: Create `package.json`**

```json
{
  "name": "@cue/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint --max-warnings=0"
  },
  "dependencies": {
    "@cue/shared": "workspace:*",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vercel/config": "^1.0.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.16.0",
    "eslint-config-next": "^15.1.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 1.2: Create `next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: true,
  },
  // Allow workspace packages to be transpiled
  transpilePackages: ['@cue/shared'],
};

export default config;
```

- [ ] **Step 1.3: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "incremental": true,
    "noEmit": true,
    "allowJs": true
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 1.4: Create `tailwind.config.ts`** (mirrors `apps/desktop/tailwind.config.ts` palette)

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cue: {
          bg: '#0b0b0e',
          surface: '#15151b',
          accent: '#7c5cff',
          accentHover: '#9277ff',
          text: '#e8e8ec',
          muted: '#9a9aa3',
          subtle: '#42424a',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 1.5: Create `postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 1.6: Create `.env.example`**

```
# GitHub repository where the cue desktop binaries are published as Releases.
# Used by /api/download/[platform] and /api/manifest to discover assets.
# Format: owner/repo
GITHUB_REPO=

# Optional: GitHub token for higher API rate limits (unauthenticated = 60/hr).
# Use a PAT with public_repo scope if the repo is public; repo scope if private.
GITHUB_TOKEN=

# Optional: Override the marketing-site domain for canonical URLs and OG images.
# Defaults to the Vercel deployment URL when unset.
NEXT_PUBLIC_SITE_URL=
```

- [ ] **Step 1.7: Create `.gitignore`** (Next-specific entries — root .gitignore already covers node_modules/dist)

```
# Next.js
.next/
out/
next-env.d.ts

# Vercel
.vercel/

# Env (apps/web specific)
.env.local
.env.development.local
.env.test.local
.env.production.local
```

- [ ] **Step 1.8: Create `public/favicon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#0b0b0e"/>
  <text x="32" y="42" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="#7c5cff">c</text>
</svg>
```

- [ ] **Step 1.9: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

html {
  background: #0b0b0e;
  color: #e8e8ec;
  font-feature-settings: "ss01", "cv11";
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 1.10: Create `app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import './globals.css';

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
      <body className="min-h-screen bg-cue-bg text-cue-text">{children}</body>
    </html>
  );
}
```

- [ ] **Step 1.11: Create `app/not-found.tsx`**

```typescript
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
```

- [ ] **Step 1.12: Create minimal `app/page.tsx` (real content in Task 4)**

```typescript
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-cue-muted">cue</p>
      <h1 className="mt-4 text-3xl font-semibold">Marketing site coming together</h1>
      <p className="mt-3 text-sm text-cue-muted">Hero, Features, and HowItWorks land in Task 4.</p>
    </main>
  );
}
```

- [ ] **Step 1.13: Install and verify**

Run from `cue/`:

```bash
pnpm install
pnpm --filter @cue/web typecheck
pnpm --filter @cue/web dev
```

Expected:
- `pnpm install` adds Next 15, React 19, Tailwind, etc. (~30-90s)
- `typecheck` passes (Next will write `next-env.d.ts` on first dev run; that's expected)
- `pnpm dev` launches at `http://localhost:3000` showing the placeholder home page

Open `http://localhost:3000` in a browser. You should see the dark `#0b0b0e` background with the placeholder text. Hit `Ctrl+C` in the terminal to stop the dev server.

- [ ] **Step 1.14: Commit**

```bash
git -C "cue" add apps/web/
git -C "cue" commit -m "feat(web): bootstrap Next.js 15 + Tailwind marketing site shell"
```

If `pnpm-lock.yaml` updated, also:
```bash
git -C "cue" add pnpm-lock.yaml
git -C "cue" commit -m "chore: update pnpm lockfile after @cue/web bootstrap"
```

---

## Task 2: Configure `vercel.ts`

**Files:**
- Create: `apps/web/vercel.ts`

The 2026 Vercel knowledge update established `vercel.ts` as the recommended TS-native project config, replacing `vercel.json`. It supports dynamic logic and full IntelliSense. We use it instead of JSON.

- [ ] **Step 2.1: Create `apps/web/vercel.ts`**

```typescript
import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'pnpm --filter @cue/web build',
  outputDirectory: 'apps/web/.next',
  installCommand: 'pnpm install --frozen-lockfile',
  framework: 'nextjs',
  // The repo root is the monorepo. Vercel needs to know which app to deploy.
  // We point it at apps/web via the buildCommand above and let Next handle output.
  redirects: [
    routes.redirect('/install', '/download', { permanent: false }),
    routes.redirect('/license', '/eula', { permanent: false }),
  ],
  headers: [
    routes.cacheControl('/(_next/static|favicon.svg)/(.*)', {
      public: true,
      maxAge: '1 year',
      immutable: true,
    }),
    routes.cacheControl('/api/manifest', {
      public: true,
      sMaxAge: '5 minutes',
      staleWhileRevalidate: '1 hour',
    }),
    routes.cacheControl('/api/download/(.*)', {
      public: true,
      sMaxAge: '5 minutes',
      staleWhileRevalidate: '1 hour',
    }),
  ],
};

export default config;
```

- [ ] **Step 2.2: Verify typecheck still passes**

```bash
pnpm --filter @cue/web typecheck
```

Expected: pass. If `@vercel/config` types are missing, add `@vercel/config` to devDependencies in `apps/web/package.json` and run `pnpm install`.

- [ ] **Step 2.3: Commit**

```bash
git -C "cue" add apps/web/vercel.ts
git -C "cue" commit -m "feat(web): vercel.ts config with cache headers + legacy redirects"
```

---

## Task 3: Shared Nav + Footer + design tokens

**Files:**
- Create: `apps/web/components/Nav.tsx`
- Create: `apps/web/components/Footer.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 3.1: Create `components/Nav.tsx`**

```typescript
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
```

- [ ] **Step 3.2: Create `components/Footer.tsx`**

```typescript
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-32 border-t border-cue-subtle/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-cue-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          cue — personal-use AI co-pilot. © {new Date().getFullYear()} the cue contributors.
        </p>
        <div className="flex gap-6">
          <Link href="/eula" className="transition hover:text-cue-text">License</Link>
          <Link href="/changelog" className="transition hover:text-cue-text">Changelog</Link>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3.3: Update `app/layout.tsx` to include Nav + Footer**

Replace the existing `RootLayout` body:

```typescript
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
```

- [ ] **Step 3.4: Verify**

```bash
pnpm --filter @cue/web typecheck
pnpm --filter @cue/web dev
```

Open `http://localhost:3000` — Nav appears at top with "Changelog · EULA · Download" links; Footer at bottom. Stop dev server.

- [ ] **Step 3.5: Commit**

```bash
git -C "cue" add apps/web/components apps/web/app/layout.tsx
git -C "cue" commit -m "feat(web): Nav + Footer with cue brand palette"
```

---

## Task 4: Landing page (`/`)

**Files:**
- Create: `apps/web/components/Hero.tsx`
- Create: `apps/web/components/Features.tsx`
- Create: `apps/web/components/HowItWorks.tsx`
- Create: `apps/web/components/DownloadCTA.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 4.1: Create `components/Hero.tsx`**

```typescript
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
```

- [ ] **Step 4.2: Create `components/Features.tsx`**

```typescript
const FEATURES = [
  {
    title: 'Dual-channel transcription',
    body:
      'Captures your microphone and the meeting audio as separate channels — you get free speaker attribution without an ML model in the loop.',
  },
  {
    title: 'Context-aware answers',
    body:
      'Paste a job description and your resume once at session start. They stay pinned in the prompt cache so every answer reads the room.',
  },
  {
    title: 'Three modes',
    body:
      'Listen for passive notes. Ask for a single question on demand. Auto for real-time question detection while the other side is talking.',
  },
  {
    title: 'Excluded from screen-share',
    body:
      'Uses documented OS APIs (NSWindow.sharingType on macOS, WDA_EXCLUDEFROMCAPTURE on Windows) so the overlay does not appear in Zoom, Meet, or Teams shared video.',
  },
  {
    title: 'Local-first',
    body:
      'Audio is processed locally before transcription. No telemetry, no analytics, no cloud accounts. Your transcripts are not persisted.',
  },
  {
    title: 'Anthropic + HuggingFace fallback',
    body:
      'Claude Sonnet 4.6 streaming with HuggingFace Mistral-7B as automatic fallback if Anthropic is rate-limited or down. You always get an answer.',
  },
] as const;

export function Features() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Built for the moment, not after.
      </h2>
      <p className="mt-4 max-w-2xl text-cue-muted">
        Live transcription, channel-aware diarization, and a hotkey-driven UX that keeps your
        screen-share clean.
      </p>
      <ul className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <li key={f.title}>
            <h3 className="text-base font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-cue-muted">{f.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4.3: Create `components/HowItWorks.tsx`**

```typescript
const STEPS = [
  {
    n: '01',
    title: 'Install',
    body:
      'Download the .dmg or .msi for your platform. First-run consent flow surfaces the personal-use license and asks for the audio permissions cue needs.',
  },
  {
    n: '02',
    title: 'Paste context',
    body:
      'Drop in the job description and your resume. cue pins them in the Anthropic prompt cache so every subsequent answer is contextually grounded.',
  },
  {
    n: '03',
    title: 'Hotkey + mode',
    body:
      'Cmd/Ctrl + \\ shows or hides the overlay. Pick Listen for notes only, Ask for a single targeted question, or Auto for real-time question detection.',
  },
  {
    n: '04',
    title: 'Stay invisible',
    body:
      'When you share your screen, the overlay is excluded from the captured video by the OS itself. You see it. Zoom does not.',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="bg-cue-surface/40">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
        <ol className="mt-12 space-y-10">
          {STEPS.map((s) => (
            <li key={s.n} className="grid gap-2 sm:grid-cols-[64px_1fr] sm:gap-8">
              <div className="font-mono text-sm text-cue-accent">{s.n}</div>
              <div>
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cue-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 4.4: Create `components/DownloadCTA.tsx`**

```typescript
import Link from 'next/link';

export function DownloadCTA() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <div className="rounded-2xl border border-cue-subtle/60 bg-cue-surface/40 px-8 py-12 text-center sm:px-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Ready when your next call is.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-cue-muted">
          One download for your platform. No account. No subscription. Personal use only.
        </p>
        <Link
          href="/download"
          className="mt-8 inline-block rounded-md bg-cue-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-cue-accentHover"
        >
          Pick your platform
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4.5: Replace `app/page.tsx`**

```typescript
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
```

- [ ] **Step 4.6: Verify**

```bash
pnpm --filter @cue/web typecheck
pnpm --filter @cue/web dev
```

Open `http://localhost:3000`. You should see: Nav → Hero → Features (6 in 3-col grid) → HowItWorks (4 numbered steps) → DownloadCTA → Footer. Confirm all links work (clicking "Read the license" goes to `/eula` which doesn't exist yet — Next will show 404 with our custom not-found.tsx; that's expected).

- [ ] **Step 4.7: Commit**

```bash
git -C "cue" add apps/web/components apps/web/app/page.tsx
git -C "cue" commit -m "feat(web): landing page with Hero/Features/HowItWorks/DownloadCTA"
```

---

## Task 5: `/eula` page

**Files:**
- Create: `apps/web/app/eula/page.tsx`

The EULA text is exported from `@cue/shared` (created in Plan 1 Task 3). The full LICENSE file content lives at `cue/LICENSE`. We render the short EULA_TEXT inline and link to the full LICENSE file in the GitHub repo for the long-form version.

- [ ] **Step 5.1: Create `app/eula/page.tsx`**

```typescript
import { EULA_TEXT, EULA_VERSION } from '@cue/shared';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'License — cue',
  description: 'Personal-use license for cue.',
};

export default function EulaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <p className="text-sm text-cue-muted">License v{EULA_VERSION}</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        cue Personal-Use License
      </h1>
      <p className="mt-6 text-cue-muted">
        cue is provided for personal, non-commercial use. By installing or running cue, you agree
        to the terms below.
      </p>

      <pre className="mt-10 whitespace-pre-wrap rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-6 text-sm leading-relaxed text-cue-text">
        {EULA_TEXT}
      </pre>

      <div className="mt-10 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-6 text-sm leading-relaxed text-cue-muted">
        <p className="font-medium text-cue-text">Full license text</p>
        <p className="mt-2">
          The complete license is shipped with every install (file: <code>LICENSE</code>) and is
          available in the project repository.
        </p>
      </div>

      <Link
        href="/"
        className="mt-10 inline-block text-sm text-cue-muted underline transition hover:text-cue-text"
      >
        ← Back to home
      </Link>
    </main>
  );
}
```

- [ ] **Step 5.2: Verify**

```bash
pnpm --filter @cue/web dev
```

Visit `http://localhost:3000/eula` — page renders with EULA version, heading, the full EULA_TEXT inside a `<pre>` block, and a "Back to home" link. Stop dev server.

- [ ] **Step 5.3: Commit**

```bash
git -C "cue" add apps/web/app/eula
git -C "cue" commit -m "feat(web): /eula page rendered from @cue/shared EULA_TEXT"
```

---

## Task 6: `/changelog` page

**Files:**
- Create: `apps/web/app/changelog/page.tsx`

We render the project's `CHANGELOG.md` (committed in Plan 1 Task 2). Source-of-truth is the file in the repo; we read it at build time using Node's `fs` (works in Server Components) and convert markdown to HTML via a tiny inline parser — no markdown lib needed for the simple format we use.

- [ ] **Step 6.1: Create `app/changelog/page.tsx`**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog — cue',
  description: "What shipped in each cue release.",
};

// Force static rendering: read CHANGELOG.md once at build time and serve the
// rendered HTML from the CDN. This means new commits to CHANGELOG.md require
// a redeploy to surface — which is the desired behavior for release-aligned
// changelog updates.
export const dynamic = 'force-static';

// Read CHANGELOG.md from the monorepo root at build time.
async function readChangelog(): Promise<string> {
  // apps/web/app/changelog/page.tsx is 4 levels deep from cue/
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  const candidate = path.join(repoRoot, 'CHANGELOG.md');
  try {
    return await fs.readFile(candidate, 'utf8');
  } catch {
    // Fallback: when running from monorepo root, cwd is already cue/
    return await fs.readFile(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8');
  }
}

// Tiny markdown renderer — handles the headings + lists + paragraphs we use
// in CHANGELOG.md. Avoids pulling a 100kb markdown library for ~5 element types.
function renderChangelog(md: string): React.ReactNode {
  const lines = md.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] | null = null;
  let paragraph: string[] | null = null;
  let key = 0;

  const flushList = () => {
    if (!listItems) return;
    blocks.push(
      <ul key={key++} className="ml-5 list-disc space-y-1 text-cue-muted">
        {listItems.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>,
    );
    listItems = null;
  };

  const flushParagraph = () => {
    if (!paragraph) return;
    blocks.push(
      <p key={key++} className="text-cue-muted">
        {paragraph.join(' ')}
      </p>,
    );
    paragraph = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === '') {
      flushList();
      flushParagraph();
      continue;
    }
    if (line.startsWith('# ')) {
      flushList();
      flushParagraph();
      blocks.push(
        <h1 key={key++} className="mt-12 text-3xl font-semibold tracking-tight first:mt-0">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith('## ')) {
      flushList();
      flushParagraph();
      blocks.push(
        <h2 key={key++} className="mt-10 text-xl font-semibold tracking-tight">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith('### ')) {
      flushList();
      flushParagraph();
      blocks.push(
        <h3 key={key++} className="mt-6 text-base font-semibold uppercase tracking-wide text-cue-accent">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph();
      listItems ??= [];
      listItems.push(line.slice(2));
    } else {
      flushList();
      paragraph ??= [];
      paragraph.push(line);
    }
  }
  flushList();
  flushParagraph();
  return blocks;
}

export default async function ChangelogPage() {
  const md = await readChangelog();
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <article className="space-y-4">{renderChangelog(md)}</article>
      <Link
        href="/"
        className="mt-12 inline-block text-sm text-cue-muted underline transition hover:text-cue-text"
      >
        ← Back to home
      </Link>
    </main>
  );
}
```

- [ ] **Step 6.2: Verify**

```bash
pnpm --filter @cue/web dev
```

Visit `http://localhost:3000/changelog`. The CHANGELOG.md content from the repo root renders with proper heading hierarchy (Keep-a-Changelog format). Confirm the `[Unreleased]` heading appears as h2 and the "Added" subheading as h3.

If the build complains about `process.cwd()` differing in dev vs build, both fallback paths in `readChangelog` handle the two common cwd scenarios. If it still fails, check the actual cwd with `console.log(process.cwd())` and adjust.

- [ ] **Step 6.3: Commit**

```bash
git -C "cue" add apps/web/app/changelog
git -C "cue" commit -m "feat(web): /changelog page sourcing from CHANGELOG.md"
```

---

## Task 7: `/download` page (server-side OS detection)

**Files:**
- Create: `apps/web/lib/platform.ts`
- Create: `apps/web/app/download/page.tsx`

Detection happens server-side in a Server Component using `next/headers` — no client JS, no flash of incorrect download. We read the `User-Agent` header and map it to a platform key.

- [ ] **Step 7.1: Create `lib/platform.ts`**

```typescript
import type { ReleaseManifestPlatform } from '@cue/shared';

export interface DetectedPlatform {
  key: ReleaseManifestPlatform | null;
  label: string;
  fileType: 'dmg' | 'msi' | null;
}

export function detectPlatform(userAgent: string | null): DetectedPlatform {
  const ua = (userAgent ?? '').toLowerCase();

  // Apple Silicon Macs
  if (ua.includes('mac os') || ua.includes('macintosh')) {
    // Modern UA strings from Apple Silicon Macs include "AppleWebKit" but the
    // architecture isn't reliably exposed. Default to aarch64 (M-series) since
    // it's now the majority install base for new Macs in 2026; users on Intel
    // can pick the x86_64 build manually from the dropdown.
    return { key: 'darwin-aarch64', label: 'macOS (Apple Silicon)', fileType: 'dmg' };
  }

  if (ua.includes('windows')) {
    return { key: 'windows-x86_64', label: 'Windows', fileType: 'msi' };
  }

  return { key: null, label: 'your platform', fileType: null };
}

export const ALL_PLATFORMS: ReadonlyArray<{ key: ReleaseManifestPlatform; label: string; fileType: 'dmg' | 'msi' }> = [
  { key: 'darwin-aarch64', label: 'macOS (Apple Silicon, M-series)', fileType: 'dmg' },
  { key: 'darwin-x86_64', label: 'macOS (Intel)', fileType: 'dmg' },
  { key: 'windows-x86_64', label: 'Windows (x64)', fileType: 'msi' },
];
```

- [ ] **Step 7.2: Create `app/download/page.tsx`**

```typescript
import { headers } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ALL_PLATFORMS, detectPlatform } from '@/lib/platform';

export const metadata: Metadata = {
  title: 'Download — cue',
  description: 'Download cue for your platform.',
};

export default async function DownloadPage() {
  const ua = (await headers()).get('user-agent');
  const detected = detectPlatform(ua);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Download cue</h1>
      <p className="mt-4 text-cue-muted">
        Free, personal-use only. No account required. By installing, you agree to the{' '}
        <Link href="/eula" className="underline transition hover:text-cue-text">
          personal-use license
        </Link>
        .
      </p>

      {detected.key ? (
        <section className="mt-10 rounded-2xl border border-cue-subtle/60 bg-cue-surface/40 p-8">
          <p className="text-xs uppercase tracking-wide text-cue-accent">Detected</p>
          <h2 className="mt-2 text-2xl font-semibold">{detected.label}</h2>
          <a
            href={`/api/download/${detected.key}`}
            className="mt-6 inline-block rounded-md bg-cue-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-cue-accentHover"
          >
            Download {detected.fileType === 'dmg' ? '.dmg' : '.msi'}
          </a>
        </section>
      ) : (
        <section className="mt-10 rounded-2xl border border-cue-subtle/60 bg-cue-surface/40 p-8">
          <p className="text-cue-text">
            We could not detect your platform. Pick from the list below.
          </p>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">All downloads</h2>
        <ul className="mt-4 divide-y divide-cue-subtle/40 rounded-lg border border-cue-subtle/40">
          {ALL_PLATFORMS.map((p) => (
            <li
              key={p.key}
              className="flex items-center justify-between px-5 py-4 text-sm"
            >
              <span className="text-cue-text">{p.label}</span>
              <a
                href={`/api/download/${p.key}`}
                className="rounded-md border border-cue-subtle/60 px-4 py-1.5 text-xs font-medium transition hover:border-cue-subtle"
              >
                .{p.fileType}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-6 text-sm text-cue-muted">
        <p className="font-medium text-cue-text">No releases yet?</p>
        <p className="mt-2">
          If the download links return a 404, the first release has not yet been published. The{' '}
          <Link href="/changelog" className="underline transition hover:text-cue-text">
            changelog
          </Link>{' '}
          shows release history.
        </p>
      </section>

      <Link
        href="/"
        className="mt-12 inline-block text-sm text-cue-muted underline transition hover:text-cue-text"
      >
        ← Back to home
      </Link>
    </main>
  );
}
```

- [ ] **Step 7.3: Verify**

```bash
pnpm --filter @cue/web dev
```

Visit `http://localhost:3000/download` from a Windows browser — page should display "Detected: Windows" with a `.msi` button. Mac browsers see "Detected: macOS (Apple Silicon)" with `.dmg`. The "All downloads" list shows all three platforms regardless. Clicking any download link will 404 because `/api/download/[platform]` doesn't exist yet — that's Task 8.

- [ ] **Step 7.4: Commit**

```bash
git -C "cue" add apps/web/lib apps/web/app/download
git -C "cue" commit -m "feat(web): /download page with server-side OS detection"
```

---

## Task 8: `/api/download/[platform]` route handler

**Files:**
- Create: `apps/web/lib/github-release.ts`
- Create: `apps/web/app/api/download/[platform]/route.ts`

This route looks up the latest GitHub Release for the configured `GITHUB_REPO`, finds the asset matching the requested platform, and 302-redirects to the asset URL. If no releases exist yet (Plan 1 not done), it returns a 404 with a helpful body.

- [ ] **Step 8.1: Create `lib/github-release.ts`**

```typescript
import 'server-only';
import type { ReleaseManifestPlatform } from '@cue/shared';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubAsset[];
}

const PLATFORM_ASSET_PATTERNS: Record<ReleaseManifestPlatform, RegExp> = {
  // Tauri's default bundle naming: cue_<version>_<arch>.<ext>
  // Examples: cue_0.1.0_aarch64.dmg, cue_0.1.0_x64_en-US.msi
  'darwin-aarch64': /\.dmg$/i,
  'darwin-x86_64': /(_x64|_x86_64).*\.dmg$/i,
  'windows-x86_64': /\.msi$/i,
};

const SIGNATURE_ASSET_PATTERNS: Record<ReleaseManifestPlatform, RegExp> = {
  // Tauri updater signatures end in .sig
  'darwin-aarch64': /\.app\.tar\.gz\.sig$/i,
  'darwin-x86_64': /(_x64|_x86_64).*\.app\.tar\.gz\.sig$/i,
  'windows-x86_64': /\.zip\.sig$/i,
};

const UPDATER_BUNDLE_PATTERNS: Record<ReleaseManifestPlatform, RegExp> = {
  'darwin-aarch64': /\.app\.tar\.gz$/i,
  'darwin-x86_64': /(_x64|_x86_64).*\.app\.tar\.gz$/i,
  'windows-x86_64': /\.zip$/i,
};

function getRepo(): string | null {
  const repo = process.env.GITHUB_REPO;
  if (!repo || !repo.includes('/')) return null;
  return repo;
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  const repo = getRepo();
  if (!repo) return null;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
    // Cache with Next's data cache for 5 minutes
    next: { revalidate: 300 },
  });

  if (res.status === 404) return null; // no releases yet
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);

  return (await res.json()) as GitHubRelease;
}

export async function getInstallerUrl(platform: ReleaseManifestPlatform): Promise<string | null> {
  const release = await fetchLatestRelease();
  if (!release || release.draft) return null;
  const pattern = PLATFORM_ASSET_PATTERNS[platform];
  const asset = release.assets.find((a) => pattern.test(a.name));
  return asset?.browser_download_url ?? null;
}

export interface ManifestPlatformAsset {
  url: string;
  signature: string;
}

export interface UpstreamManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Partial<Record<ReleaseManifestPlatform, ManifestPlatformAsset>>;
}

async function fetchSignature(url: string): Promise<string> {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return '';
  return (await res.text()).trim();
}

export async function getUpdaterManifest(): Promise<UpstreamManifest | null> {
  const release = await fetchLatestRelease();
  if (!release || release.draft) return null;

  const platforms: Partial<Record<ReleaseManifestPlatform, ManifestPlatformAsset>> = {};
  for (const platform of Object.keys(UPDATER_BUNDLE_PATTERNS) as ReleaseManifestPlatform[]) {
    const bundlePattern = UPDATER_BUNDLE_PATTERNS[platform];
    const sigPattern = SIGNATURE_ASSET_PATTERNS[platform];
    const bundle = release.assets.find((a) => bundlePattern.test(a.name));
    const sig = release.assets.find((a) => sigPattern.test(a.name));
    if (!bundle || !sig) continue;
    platforms[platform] = {
      url: bundle.browser_download_url,
      signature: await fetchSignature(sig.browser_download_url),
    };
  }

  // Tauri's updater requires version without the leading "v"
  const version = release.tag_name.replace(/^v/, '');

  return {
    version,
    notes: release.body || release.name || '',
    pub_date: release.published_at,
    platforms,
  };
}
```

- [ ] **Step 8.2: Create `app/api/download/[platform]/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import type { ReleaseManifestPlatform } from '@cue/shared';
import { getInstallerUrl } from '@/lib/github-release';

const VALID_PLATFORMS: ReadonlySet<ReleaseManifestPlatform> = new Set([
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64',
]);

function isValidPlatform(value: string): value is ReleaseManifestPlatform {
  return VALID_PLATFORMS.has(value as ReleaseManifestPlatform);
}

interface RouteContext {
  params: Promise<{ platform: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { platform } = await context.params;

  if (!isValidPlatform(platform)) {
    return NextResponse.json(
      { error: 'Unknown platform', valid: Array.from(VALID_PLATFORMS) },
      { status: 400 },
    );
  }

  const url = await getInstallerUrl(platform);
  if (!url) {
    return NextResponse.json(
      {
        error: 'No release available yet',
        message:
          'The first cue release has not been published. Check back soon, or watch the GitHub repo for the v0.1.0 tag.',
      },
      { status: 404 },
    );
  }

  return NextResponse.redirect(url, { status: 302 });
}
```

- [ ] **Step 8.3: Verify**

Set a dummy `GITHUB_REPO` in `.env.local` (the repo doesn't have to exist; the route should handle 404 from GitHub gracefully):

```bash
echo "GITHUB_REPO=amdrentcorp/cue-stub" > apps/web/.env.local
pnpm --filter @cue/web dev
```

Then test:

```bash
curl -i http://localhost:3000/api/download/darwin-aarch64
# Expected: 404 with the JSON "No release available yet" body

curl -i http://localhost:3000/api/download/invalid
# Expected: 400 with "Unknown platform" + valid list

curl -i http://localhost:3000/api/download/windows-x86_64
# Expected: 404 (no real repo)
```

Stop dev server.

- [ ] **Step 8.4: Commit**

```bash
git -C "cue" add apps/web/lib/github-release.ts apps/web/app/api/download
git -C "cue" commit -m "feat(web): /api/download/[platform] redirects to GitHub Releases asset"
```

---

## Task 9: `/api/manifest` route handler (Tauri-updater feed)

**Files:**
- Create: `apps/web/app/api/manifest/route.ts`

This endpoint is what the Tauri auto-updater pings on app launch. It returns the JSON shape Tauri expects: `{ version, notes, pub_date, platforms: { "darwin-aarch64": { url, signature }, ... } }`. The updater then verifies the signature against the public key compiled into the binary.

- [ ] **Step 9.1: Create `app/api/manifest/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { getUpdaterManifest } from '@/lib/github-release';

export async function GET() {
  const manifest = await getUpdaterManifest();
  if (!manifest) {
    return NextResponse.json(
      {
        error: 'No release available',
        message: 'No published cue release was found.',
      },
      { status: 404 },
    );
  }
  return NextResponse.json(manifest, {
    headers: {
      // Defensive cache header — vercel.ts also sets these but we want them
      // even when running locally / on a non-Vercel host.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
```

- [ ] **Step 9.2: Verify**

```bash
pnpm --filter @cue/web dev
curl -i http://localhost:3000/api/manifest
# Expected without releases: 404 JSON
# Expected with releases: 200 with { version, notes, pub_date, platforms: {...} }
```

- [ ] **Step 9.3: Commit**

```bash
git -C "cue" add apps/web/app/api/manifest
git -C "cue" commit -m "feat(web): /api/manifest returns Tauri-updater-compatible feed"
```

---

## Task 10: GitHub Actions release workflow

**Files:**
- Create: `cue/.github/workflows/release.yml`

This workflow runs on tag push (`v*.*.*`), builds the Tauri app on macOS and Windows runners using the official `tauri-apps/tauri-action`, and uploads the built artifacts to a GitHub Release. It does NOT sign the macOS binary on day one — signing requires the user's Apple Developer cert + notarization secrets, which are added later via repo secrets.

- [ ] **Step 10.1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            target: aarch64-apple-darwin
            asset_label: macos-aarch64
          - platform: macos-13
            target: x86_64-apple-darwin
            asset_label: macos-x86_64
          - platform: windows-latest
            target: x86_64-pc-windows-msvc
            asset_label: windows-x86_64

    runs-on: ${{ matrix.platform }}
    name: Build ${{ matrix.asset_label }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9
          run_install: false

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_OUTPUT

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: ${{ runner.os }}-pnpm-

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Cache Cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry/index
            ~/.cargo/registry/cache
            ~/.cargo/git/db
            apps/desktop/src-tauri/target
          key: ${{ runner.os }}-cargo-${{ matrix.target }}-${{ hashFiles('apps/desktop/src-tauri/Cargo.lock') }}
          restore-keys: ${{ runner.os }}-cargo-${{ matrix.target }}-

      - name: Install workspace dependencies
        run: pnpm install --frozen-lockfile

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Tauri updater signing key (set via repo secret when ready):
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          # macOS notarization secrets (set via repo secrets when ready):
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          projectPath: apps/desktop
          args: --target ${{ matrix.target }}
          tagName: ${{ github.ref_name }}
          releaseName: 'cue ${{ github.ref_name }}'
          releaseBody: 'See [CHANGELOG.md](https://github.com/${{ github.repository }}/blob/main/CHANGELOG.md) for details.'
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: false
```

**Notes on the workflow:**
- `releaseDraft: true` means the release is published as a draft — you review and click "Publish" manually before it goes live. This is intentional safety for v0.1.0.
- All Apple signing secrets are referenced but optional. When unset, `tauri-action` skips signing and produces unsigned binaries (still runnable, just with the Gatekeeper warning).
- `includeUpdaterJson: false` because we serve the manifest from `/api/manifest` instead, sourced live from GitHub Releases. This is more flexible than a static JSON file.
- The `macos-13` runner is x86_64; `macos-latest` is currently arm64 (M-series). Both are needed for the universal mac story.

- [ ] **Step 10.2: Verify YAML syntax**

```bash
# If you have actionlint or yamllint installed:
yamllint cue/.github/workflows/release.yml || echo "yamllint not installed — skipping"

# Or use the GitHub CLI to validate:
gh workflow view release.yml --repo <owner>/<repo> 2>/dev/null || echo "gh CLI not configured for repo"
```

If neither tool is available, the YAML can be validated by GitHub itself once pushed: invalid syntax shows up in the Actions tab as a workflow parse error.

- [ ] **Step 10.3: Commit**

```bash
git -C "cue" add .github/
git -C "cue" commit -m "ci: GitHub Actions release workflow for tagged builds (mac+win matrix)"
```

---

## Task 11: Vercel deployment (manual user steps + verification)

**Files:** none (this task is a deployment runbook the user follows manually)

This task is a deployment guide because Vercel project creation requires the user's authenticated browser session — it cannot be fully automated from a subagent. The implementer documents the steps the user takes; the user runs them; the implementer then verifies the deployment is live.

- [ ] **Step 11.1: User: install Vercel CLI**

(If not already installed.)

```bash
pnpm add -g vercel
```

- [ ] **Step 11.2: User: authenticate to Vercel**

```bash
vercel login
```

Sign in with the email tied to the `amdrentcorp-5032s-projects` team.

- [ ] **Step 11.3: User: link the project**

From `cue/`:

```bash
cd apps/web
vercel link
```

Vercel prompts:
- "Set up and deploy?" → **No** (we want link-only first)
  - Or accept Yes; vercel will detect Next.js automatically
- "Which scope?" → choose `amdrentcorp-5032s-projects`
- "Link to existing project?" → No
- "What's your project's name?" → `cue-web`
- "In which directory is your code located?" → `./` (we're already in apps/web)

Vercel writes `apps/web/.vercel/project.json` (already gitignored).

- [ ] **Step 11.4: User: configure environment variables in Vercel**

```bash
# From apps/web/
vercel env add GITHUB_REPO production
# Paste: <your-github-username>/cue (or whatever you name the GH repo)

vercel env add GITHUB_TOKEN production
# Paste a fine-grained PAT with public_repo (or repo if private) scope
```

For preview deployments (every PR), repeat with `preview` and `development` if you want them populated.

- [ ] **Step 11.5: User: deploy a preview**

```bash
vercel
```

Wait for build to finish. Vercel prints the preview URL (something like `cue-web-<hash>-amdrentcorp-5032s-projects.vercel.app`).

- [ ] **Step 11.6: User: deploy to production**

```bash
vercel --prod
```

Vercel prints the production URL (e.g., `cue-web.vercel.app`).

- [ ] **Step 11.7: Implementer: verify the live deployment**

Run from any machine:

```bash
SITE=https://cue-web.vercel.app  # replace with actual production URL

curl -sf "$SITE/" > /dev/null && echo "✅ landing page renders"
curl -sf "$SITE/eula" > /dev/null && echo "✅ /eula renders"
curl -sf "$SITE/changelog" > /dev/null && echo "✅ /changelog renders"
curl -sf "$SITE/download" > /dev/null && echo "✅ /download renders"
curl -si "$SITE/api/download/windows-x86_64" | head -1 | grep -E "HTTP/.*40[04]" && echo "✅ /api/download/windows-x86_64 returns expected 404 (no release yet)"
curl -si "$SITE/api/download/invalid" | head -1 | grep "HTTP/.* 400" && echo "✅ /api/download/invalid returns 400"
curl -si "$SITE/api/manifest" | head -1 | grep -E "HTTP/.*40[04]" && echo "✅ /api/manifest returns expected 404 (no release yet)"
curl -si "$SITE/install" | head -1 | grep "HTTP/.* 30[78]" && echo "✅ /install redirect works"
```

All seven should print ✅. If any fail, check the Vercel build logs (`vercel logs <deployment-url>`) for the underlying error.

- [ ] **Step 11.8: User: optionally configure a custom domain**

If you have a domain (`usecue.io`, `trycue.app`, or whatever you registered):

```bash
vercel domains add usecue.io
vercel alias <production-url> usecue.io
```

DNS configuration follows Vercel's instructions in the dashboard.

- [ ] **Step 11.9: Commit deployment notes**

Document the production URL in the README:

```bash
# Edit cue/README.md to add a "Live" badge near the top:
#   **Live:** https://cue-web.vercel.app  (or your custom domain)
git -C "cue" add README.md
git -C "cue" commit -m "docs: add live deployment URL to README"
```

---

## Task 12: Acceptance test pass

**Files:** none — verification only.

- [ ] **Step 12.1: Confirm acceptance criteria**

For each, confirm ✅ on the live deployment:

1. ✅ `/` renders Hero, Features (6), HowItWorks (4 steps), DownloadCTA, Footer; no console errors in browser dev tools.
2. ✅ Nav appears on every page with working "Changelog · EULA · Download" links.
3. ✅ `/eula` renders the EULA_VERSION badge and the EULA_TEXT in a readable code block.
4. ✅ `/changelog` renders CHANGELOG.md content with proper heading hierarchy.
5. ✅ `/download` server-detects the visiting OS (test from a Mac and from Windows; iPhone/Android falls back to "All downloads" list, which is acceptable).
6. ✅ `/api/download/windows-x86_64` returns a 404 with helpful JSON when no release exists (will become 302 after Plan 1 + first tag push).
7. ✅ `/api/manifest` returns a 404 with helpful JSON when no release exists (will become 200 with manifest after first release).
8. ✅ `/install` legacy redirect → `/download`.
9. ✅ `/license` legacy redirect → `/eula`.
10. ✅ Static assets cached with `Cache-Control: public, max-age=31536000, immutable` (verify in browser DevTools → Network).
11. ✅ Lighthouse Performance score ≥ 95 on the landing page (test in Chrome DevTools → Lighthouse).
12. ✅ Lighthouse Accessibility score ≥ 95 on every page.

If any item fails, file an issue and patch the affected component / route handler. Re-deploy with `vercel --prod` after fixes.

- [ ] **Step 12.2: Tag**

```bash
git -C "cue" tag -a distribution-complete -m "Plan 3 (cue-distribution) complete: marketing site live on Vercel + GH Actions release workflow staged"
```

---

## Done

Plan 3 complete. Outcomes:

- Live Vercel deployment of the cue marketing site at the configured production URL
- Six pages live: `/`, `/download`, `/eula`, `/changelog`, plus the two API routes and a custom 404
- `vercel.ts` config with cache headers and legacy redirects
- GitHub Actions `release.yml` ready to fire when the first `v*.*.*` tag is pushed (no signing yet — those secrets get added when you have the Apple Developer cert)
- Auto-updater manifest endpoint operational and pulling live data from GitHub Releases
- All routes gracefully handle the "no release yet" state, so the site works even before Plan 1 produces binaries

**What this enables:**

- You have a public-facing portfolio site for `cue` immediately, even before any binary exists
- Once Plan 1 is finished and you push a `v0.1.0` tag, GitHub Actions builds + uploads binaries automatically
- The download page becomes functional the moment that release publishes — no further code changes needed
- The auto-updater starts working as soon as a second release exists (`v0.1.1` etc.)

**What is still deferred** (to a future plan or manual step):

- macOS code-signing + notarization (requires Apple Developer Program enrollment + credentials in repo secrets)
- Windows code-signing (requires SSL.com EV cert + credentials in repo secrets)
- Tauri auto-updater wiring on the desktop side (`updater` field in `tauri.conf.json` pointing to `/api/manifest` + Ed25519 public key compiled into binary) — this is one short task that lands as a Plan 1.5 or alongside Plan 2
- First-run consent flow inside the desktop app — surfaces the EULA before audio capture activates (Plan 2 territory)
- Custom domain procurement (`usecue.io` / `trycue.app` / etc.) — manual user step
- OG image / social-card design — replace the placeholder in `apps/web/public/`

**Next:** With Plan 1 finishing concurrently and Plan 3 deployed, the desktop binary builds on tag push and lands on a working download page. Plan 2 (`cue-intelligence`) is the remaining big build — audio capture, STT, LLM, question detection, three modes, settings panel, context loader.
