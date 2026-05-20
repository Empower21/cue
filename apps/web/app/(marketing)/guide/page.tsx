import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User guide — cue',
  description:
    'Install cue, paste your job description and resume, pick a mode, and let it help you through interviews and meetings. Walkthrough with screenshots-in-words.',
};

export const dynamic = 'force-static';

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-cue-accent">
          v0.1.0 alpha · Windows · personal use
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          User guide
        </h1>
        <p className="text-lg text-cue-muted">
          cue is a transparent desktop overlay that listens to your interview or meeting,
          shows a live transcript, and streams contextual answers when the other person
          asks a question. Your screen-share doesn&apos;t see it. Your interviewer
          doesn&apos;t see it. You see it.
        </p>
      </header>

      <Toc />

      <Section id="install" n="1" title="Install (Windows)">
        <ol className="ml-5 list-decimal space-y-2 text-cue-muted">
          <li>
            Click <strong className="text-cue-text">Download for your platform</strong>{' '}
            on the <Link href="/" className="underline hover:text-cue-text">home page</Link>{' '}
            (or visit <Link href="/download" className="underline hover:text-cue-text">/download</Link> directly). The
            site detects your OS and hands you the right file.
          </li>
          <li>
            Save <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">cue_0.1.0_x64_en-US.msi</code>{' '}
            to your Downloads folder.
          </li>
          <li>
            Double-click the MSI. Windows SmartScreen says{' '}
            <em>&ldquo;Windows protected your PC&rdquo;</em> — click{' '}
            <strong className="text-cue-text">More info</strong> →{' '}
            <strong className="text-cue-text">Run anyway</strong>. The binary is unsigned in
            this alpha; a code-signing cert is on the v0.2 roadmap.
          </li>
          <li>Follow the installer. cue lands in your Start menu.</li>
        </ol>
        <Callout tone="warn">
          <strong className="text-cue-text">macOS support:</strong> not in this release. The
          macOS Rust code has compile errors that need fixing without a Mac in the
          maintainer&apos;s hands. Tracking for v0.1.1 — see the{' '}
          <Link href="/changelog" className="underline hover:text-cue-text">changelog</Link>.
        </Callout>
      </Section>

      <Section id="keys" n="2" title="Paste your API keys (one-time, per machine)">
        <p className="text-cue-muted">
          cue ships with placeholder build-time keys, so you provide your own. Keys are
          stored locally in <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">%APPDATA%\cue\config.toml</code>{' '}
          and never leave your machine.
        </p>
        <ol className="ml-5 list-decimal space-y-2 text-cue-muted">
          <li>
            Open cue. Click the <KeyChip>⚙</KeyChip> gear icon in the header.
          </li>
          <li>
            Paste your <strong className="text-cue-text">Deepgram API key</strong>.{' '}
            <span className="text-cue-muted">
              Required for speech-to-text. Get one free at{' '}
              <a
                href="https://deepgram.com"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-cue-text"
              >
                deepgram.com
              </a>{' '}
              — they grant ~$200 in credit on signup.
            </span>
            <pre className="mt-2 overflow-x-auto rounded-md border border-cue-subtle/40 bg-cue-surface/60 p-3 text-xs">
              <code>Deepgram API key:  &lt;your-40-char-deepgram-key&gt;</code>
            </pre>
          </li>
          <li>
            Paste your <strong className="text-cue-text">Override Anthropic key</strong>.{' '}
            <span className="text-cue-muted">
              Required (the placeholder built-in key is empty). Create one at{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-cue-text"
              >
                console.anthropic.com
              </a>
              .
            </span>
            <pre className="mt-2 overflow-x-auto rounded-md border border-cue-subtle/40 bg-cue-surface/60 p-3 text-xs">
              <code>Override Anthropic key:  sk-ant-api03-&lt;your-anthropic-key&gt;</code>
            </pre>
          </li>
          <li>Click <strong className="text-cue-text">Save</strong>.</li>
        </ol>
        <Callout>
          <strong className="text-cue-text">Per-device, once.</strong> Keys persist in{' '}
          <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">config.toml</code> after
          the first save. The next time you launch cue on that machine, the keys are already
          loaded. You only repeat this step on each new machine you install cue on.
        </Callout>
      </Section>

      <Section id="context" n="3" title="Paste your context (per interview/meeting)">
        <ol className="ml-5 list-decimal space-y-2 text-cue-muted">
          <li>
            Click <KeyChip>Context</KeyChip> in the header.
          </li>
          <li>
            Fill in three fields:
            <ul className="ml-5 mt-2 list-disc space-y-1">
              <li>
                <strong className="text-cue-text">Job description</strong> — paste the full
                posting.
              </li>
              <li>
                <strong className="text-cue-text">Resume</strong> — paste your resume in
                plain text (no file upload yet).
              </li>
              <li>
                <strong className="text-cue-text">Role / company</strong> — short note like{' '}
                <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">
                  Staff PM, Acme Corp, Series C
                </code>
                .
              </li>
            </ul>
          </li>
          <li>Click <strong className="text-cue-text">Save</strong>.</li>
        </ol>
        <p className="text-cue-muted">
          These three strings get pinned in the Anthropic prompt cache, so every answer
          you generate stays grounded in them without paying full token cost each turn.
        </p>
      </Section>

      <Section id="modes" n="4" title="Pick a mode">
        <p className="text-cue-muted">Three modes. Pick the one that fits the situation.</p>

        <ModeCard
          name="Listen"
          tagline="Transcript only, no AI answers."
          body="Both sides of the conversation appear in real time, tagged 'you' and 'them.' Best for capturing meeting minutes or study sessions where you don't want the LLM in the loop."
        />
        <ModeCard
          name="Ask"
          tagline="You type, cue answers."
          body="While the transcript runs, type a question in the Ask box at the bottom and press Ctrl+Enter. cue sends your question plus your JD + resume + role + the last ~10 turns of transcript to Claude and streams back an answer. Each new Ask resets the answer card — no clutter, no history."
        />
        <ModeCard
          name="Auto"
          tagline="cue listens for questions and answers them."
          body="Listens to the 'them' channel (the other person on the call). When a question is detected (line ends with '?' or starts with what/how/why/tell/describe/etc.), cue streams an answer card. 3-second debounce prevents back-to-back triggers. Old answer cards stack newest-first — clear them with End Session."
        />
      </Section>

      <Section id="run" n="5" title="Run a session">
        <ol className="ml-5 list-decimal space-y-2 text-cue-muted">
          <li>
            Join your call (Zoom, Google Meet, Microsoft Teams, Webex, Slack Huddle,
            Discord, Loom — any of them).
          </li>
          <li>
            Position the cue overlay where you want it. Drag the header bar to move; click
            the <KeyChip>▢</KeyChip> button to collapse to a small pill.
          </li>
          <li>
            Click <span className="rounded bg-cue-accent px-2 py-0.5 text-xs text-white">Start</span>.
            The two voice-activity dots appear:
            <ul className="ml-5 mt-2 list-disc space-y-1">
              <li>
                <strong className="text-cue-text">you</strong> — flashes green when your
                mic hears voiced speech.
              </li>
              <li>
                <strong className="text-cue-text">them</strong> — flashes green when system
                audio (the other person) is talking.
              </li>
            </ul>
          </li>
          <li>Use cue as you would expect for the mode you picked.</li>
        </ol>
        <Callout>
          <strong className="text-cue-text">The interviewer cannot see cue.</strong>{' '}
          Windows&apos; <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">WDA_EXCLUDEFROMCAPTURE</code>{' '}
          excludes the cue window from every screen-capture API on the system. Zoom, Meet,
          Teams, Webex, Slack Huddle, Discord screen-share, OBS display capture, Loom —
          all of them see the desktop behind cue, not cue itself.
        </Callout>
      </Section>

      <Section id="hide" n="6" title="Hide and recall: the Ctrl+\\ hotkey">
        <p className="text-cue-muted">
          Press <KeyChip>Ctrl</KeyChip> + <KeyChip>\</KeyChip> from any application —
          including the call window — to hide cue. Press it again to show cue and refocus
          it. The hotkey is registered globally with the OS, so it fires even when cue
          itself isn&apos;t focused.
        </p>
        <p className="text-cue-muted">Three things to know:</p>
        <ul className="ml-5 list-disc space-y-1 text-cue-muted">
          <li>
            Position and mode are preserved across hide/show. cue picks up where you left
            off.
          </li>
          <li>
            Capture keeps running while hidden. If you toggle away mid-question in Auto
            mode, the answer will be waiting when you toggle back.
          </li>
          <li>
            On any keyboard layout where <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">\</code>{' '}
            isn&apos;t conveniently placed, the chord can be rebound in{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">
              apps/desktop/src-tauri/src/overlay/hotkeys.rs
            </code>{' '}
            (developer-only for now; UI setting on the v0.2 roadmap).
          </li>
        </ul>
      </Section>

      <Section id="end" n="7" title="End a session">
        <p className="text-cue-muted">
          When you&apos;re done — interview over, meeting wrapped, study session
          finished — click the <KeyChip>End</KeyChip> button in the header. A confirmation
          panel appears.
        </p>
        <div className="mt-4 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-4 font-mono text-xs leading-relaxed text-cue-muted">
          End this session?
          <br />
          <br />
          • Stops transcription
          <br />
          • Clears all answer cards
          <br />
          • Clears live transcript
          <br />
          <br />
          [ ] Also clear pasted Job Description, Resume, and Role/Company
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;API keys are kept either way.
          <br />
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[Cancel]
          &nbsp;[End Session]
        </div>
        <ul className="ml-5 mt-4 list-disc space-y-1 text-cue-muted">
          <li>
            <strong className="text-cue-text">Quick reset</strong> (checkbox unchecked):
            stops capture and wipes the transcript + answer cards. Keeps your pasted JD /
            Resume / Role-Company. Use between back-to-back interviews against the same
            prep.
          </li>
          <li>
            <strong className="text-cue-text">Full wipe</strong> (checkbox checked): same
            as above, plus blanks the Context fields. Use when you&apos;re done with a
            job-hunt cycle or handing the laptop to someone else.
          </li>
        </ul>
        <p className="text-cue-muted">
          Either way, your API keys stay safe in{' '}
          <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">config.toml</code>.
          The End Session flow never touches them — clear those manually via the gear if
          you need to.
        </p>
      </Section>

      <Section id="troubleshooting" n="8" title="Troubleshooting">
        <Trouble symptom="Pressing Start does nothing / says 'Deepgram API key not set'.">
          Open <KeyChip>⚙</KeyChip>, paste your Deepgram key, Save. Then try Start again.
        </Trouble>

        <Trouble symptom="The 'them' dot never lights up — cue isn't capturing the other person.">
          <p>cue captures the system audio loopback on your default output device. Checks:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li>Audio is actually playing out of your speakers/headphones.</li>
            <li>
              The call audio isn&apos;t routed to a virtual cable or Bluetooth device that
              isn&apos;t the default output.
            </li>
            <li>
              On Windows: <em>Sound settings → Output</em> shows the device the call audio
              is going through.
            </li>
          </ul>
        </Trouble>

        <Trouble symptom="Answers say 'Anthropic unavailable — falling back to HuggingFace Mistral-7B'.">
          <p>This means Claude returned no token within 8 seconds. Most likely:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li>
              Anthropic credit balance hit zero — top up at{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-cue-text"
              >
                console.anthropic.com
              </a>
              .
            </li>
            <li>API key invalid — re-paste in Settings.</li>
            <li>Network blip — retry.</li>
          </ul>
        </Trouble>

        <Trouble symptom="The Ctrl+\\ hotkey stops working after cue has been running for a long time.">
          <p>
            Known long-uptime issue on the alpha. The Windows{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">RegisterHotKey</code>{' '}
            binding can drop after many hours and several Vite hot-reloads of the dev
            build. <strong className="text-cue-text">Fix:</strong> fully quit and relaunch
            cue. Watch the terminal (or the Event Viewer log, for the installed MSI) for
            the line{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">
              global shortcut registered: CmdOrCtrl+Backslash
            </code>{' '}
            — that line proves the OS accepted the registration on the fresh launch.
          </p>
        </Trouble>

        <Trouble symptom="cue is visible in the Zoom/Meet share preview — invisibility broken.">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Confirm you&apos;re using a recent version of the conferencing app. Very old
              builds bypass the OS exclusion list.
            </li>
            <li>
              Confirm you&apos;re sharing your <em>screen</em>, not a virtual camera that
              re-captures the display.
            </li>
            <li>
              Restart cue — Windows sometimes drops the{' '}
              <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">WDA_EXCLUDEFROMCAPTURE</code>{' '}
              flag after a graphics-driver update.
            </li>
            <li>
              Remember: cue is hidden from <em>screen capture</em>, not from your webcam.
              If your camera physically points at your monitor, it sees cue.
            </li>
          </ul>
        </Trouble>

        <Trouble symptom="Window won't quit — clicking the X just hides it.">
          By design until v0.1.1 ships a system tray icon. To force quit:
          <pre className="mt-2 overflow-x-auto rounded-md border border-cue-subtle/40 bg-cue-surface/60 p-3 text-xs">
            <code>Stop-Process -Name cue -Force</code>
          </pre>
          <p className="mt-2">Or Task Manager → Details → end task on cue.exe.</p>
        </Trouble>
      </Section>

      <Section id="privacy" n="9" title="Privacy & compliance">
        <ul className="ml-5 list-disc space-y-2 text-cue-muted">
          <li>
            <strong className="text-cue-text">Your audio never leaves your machine</strong>{' '}
            except as streams to Deepgram (for transcription) and Anthropic (for answers).
            cue does not log audio, transcripts, or answers anywhere else.
          </li>
          <li>
            <strong className="text-cue-text">Your API keys live in{' '}
              <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">config.toml</code>{' '}
              only.</strong>{' '}
            They&apos;re not sync&apos;d, telemetry-ed, or transmitted to any third party
            besides Deepgram and Anthropic when you make calls.
          </li>
          <li>
            <strong className="text-cue-text">Personal use only.</strong> See the{' '}
            <Link href="/eula" className="underline hover:text-cue-text">
              license
            </Link>
            . You are responsible for compliance with local recording laws, two-party-consent
            statutes, and the terms of service of any platform you use cue with.
          </li>
          <li>
            <strong className="text-cue-text">Not invisible to webcams or remote
              proctoring.</strong>{' '}
            cue is hidden from standard OS screen-capture APIs only. Software that
            bypasses those APIs (some proctoring tools) and any camera pointed at your
            monitor will see it.
          </li>
        </ul>
      </Section>

      <div className="mt-16 flex items-center justify-between border-t border-cue-subtle/40 pt-8 text-sm text-cue-muted">
        <Link href="/" className="transition hover:text-cue-text">
          ← Back to home
        </Link>
        <Link href="/download" className="transition hover:text-cue-text">
          Go to download →
        </Link>
      </div>
    </main>
  );
}

function Toc() {
  const items: Array<{ id: string; label: string }> = [
    { id: 'install', label: '1. Install (Windows)' },
    { id: 'keys', label: '2. Paste your API keys' },
    { id: 'context', label: '3. Paste your context' },
    { id: 'modes', label: '4. Pick a mode' },
    { id: 'run', label: '5. Run a session' },
    { id: 'hide', label: '6. Hide and recall with Ctrl+\\' },
    { id: 'end', label: '7. End a session' },
    { id: 'troubleshooting', label: '8. Troubleshooting' },
    { id: 'privacy', label: '9. Privacy & compliance' },
  ];
  return (
    <nav
      aria-label="Table of contents"
      className="mt-10 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 px-5 py-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-cue-muted">Contents</p>
      <ol className="mt-2 space-y-1 text-sm">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className="text-cue-text transition hover:text-cue-accent"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-16 scroll-mt-24 space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm text-cue-accent">{n.padStart(2, '0')}</span>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ModeCard({
  name,
  tagline,
  body,
}: {
  name: string;
  tagline: string;
  body: string;
}) {
  return (
    <div className="mt-3 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-5">
      <h3 className="text-base font-semibold text-cue-text">
        {name} <span className="ml-2 text-xs font-normal text-cue-accent">{tagline}</span>
      </h3>
      <p className="mt-2 text-sm text-cue-muted">{body}</p>
    </div>
  );
}

function Trouble({
  symptom,
  children,
}: {
  symptom: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 p-5">
      <p className="text-sm font-medium text-cue-text">{symptom}</p>
      <div className="mt-2 text-sm text-cue-muted">{children}</div>
    </div>
  );
}

function Callout({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'warn';
}) {
  const borderColor = tone === 'warn' ? 'border-amber-400/40' : 'border-cue-accent/40';
  const bgColor = tone === 'warn' ? 'bg-amber-400/5' : 'bg-cue-accent/5';
  return (
    <div className={`mt-4 rounded-md border-l-2 ${borderColor} ${bgColor} px-4 py-3 text-sm text-cue-muted`}>
      {children}
    </div>
  );
}

function KeyChip({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-cue-subtle/60 bg-cue-surface px-1.5 py-0.5 font-mono text-xs text-cue-text">
      {children}
    </kbd>
  );
}
