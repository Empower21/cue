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
