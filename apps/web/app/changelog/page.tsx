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
