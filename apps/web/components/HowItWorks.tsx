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
