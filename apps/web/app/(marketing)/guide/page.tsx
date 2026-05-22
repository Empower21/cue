import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User guide — cue',
  description:
    'Install cue on Windows or macOS, paste your own API keys, pick a Purpose (Interview / Meeting / Study), and run a session. Privacy-first by design.',
};

export const dynamic = 'force-static';

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-cue-accent">
          v0.1.11 · Windows + macOS (Apple Silicon) · personal use
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          User guide
        </h1>
        <p className="text-lg text-cue-muted">
          cue is a transparent desktop overlay that listens to your interview, meeting,
          or study session, shows a live transcript, and streams contextual answers
          when a question comes up. Your screen-share doesn&apos;t see it. Your
          interviewer doesn&apos;t see it. You see it.
        </p>
      </header>

      <Toc />

      <Section id="safety" n="1" title="Why cue is safe to use">
        <p className="text-cue-muted">
          Six properties that, taken together, make cue safe to install and run on
          your personal machine.
        </p>
        <ul className="ml-5 list-disc space-y-2 text-cue-muted">
          <li>
            <strong className="text-cue-text">No telemetry, no analytics, no account.</strong>{' '}
            cue does not phone home. It does not have a backend you log into. Run it
            offline and the only outbound network calls are to Deepgram (transcription)
            and Anthropic (answers) — both only while you have a session active, both
            only on requests you initiate.
          </li>
          <li>
            <strong className="text-cue-text">Bring your own keys.</strong> The public
            binary ships with empty placeholder keys. You paste your own Deepgram and
            Anthropic keys into Settings; they are stored locally in{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">config.toml</code>{' '}
            and never sent anywhere except as the <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">Authorization</code>{' '}
            header to those two providers.
          </li>
          <li>
            <strong className="text-cue-text">Invisible to screen-share APIs.</strong>{' '}
            Windows uses{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">WDA_EXCLUDEFROMCAPTURE</code>;
            macOS uses the equivalent content-protection flag. Zoom, Meet, Teams,
            Webex, Slack Huddle, Discord, OBS, Loom — all of them capture the desktop
            behind cue, not cue itself.
          </li>
          <li>
            <strong className="text-cue-text">No audio, transcripts, or answers are stored on disk.</strong>{' '}
            Live audio streams to Deepgram (ephemeral on their servers per their TOS);
            text streams to Anthropic. cue&apos;s own memory is a rolling in-RAM
            window that clears on End Session or app close.
          </li>
          <li>
            <strong className="text-cue-text">Open binary, easy uninstall.</strong>{' '}
            Windows: <em>Apps &amp; Features → cue → Uninstall</em>. macOS: drag{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">cue.app</code>{' '}
            to Trash and remove the config folder. No DRM, no licence server.
          </li>
          <li>
            <strong className="text-cue-text">You control consent.</strong> Recording
            laws vary. Some jurisdictions require two-party consent. cue does not
            record audio to disk — it transcribes for display only — but you are still
            responsible for using it lawfully. See the{' '}
            <Link href="/eula" className="underline hover:text-cue-text">licence</Link>.
          </li>
        </ul>
      </Section>

      <Section id="install" n="2" title="Install">
        <h3 className="text-base font-semibold text-cue-text">
          Windows <span className="ml-2 text-xs font-normal text-emerald-400">stable</span>
        </h3>
        <ol className="ml-5 list-decimal space-y-2 text-cue-muted">
          <li>
            Click <strong className="text-cue-text">Download for your platform</strong>{' '}
            on the <Link href="/" className="underline hover:text-cue-text">home page</Link>{' '}
            (or visit <Link href="/download" className="underline hover:text-cue-text">/download</Link>).
            The page detects Windows and serves the MSI.
          </li>
          <li>
            Save{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">cue_0.1.x_x64_en-US.msi</code>{' '}
            and double-click. SmartScreen warns{' '}
            <em>&ldquo;Windows protected your PC&rdquo;</em> because the binary is
            unsigned in this alpha — click{' '}
            <strong className="text-cue-text">More info → Run anyway</strong>. Code
            signing is on the v0.2 roadmap.
          </li>
          <li>cue lands in your Start menu. Launch it.</li>
        </ol>

        <h3 className="mt-6 text-base font-semibold text-cue-text">
          macOS (Apple Silicon){' '}
          <span className="ml-2 text-xs font-normal text-amber-400">experimental</span>
        </h3>
        <ol className="ml-5 list-decimal space-y-2 text-cue-muted">
          <li>
            From <Link href="/download" className="underline hover:text-cue-text">/download</Link>,
            grab the <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">.dmg</code>{' '}
            for &ldquo;macOS (Apple Silicon)&rdquo;.
          </li>
          <li>
            Open the DMG, drag{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">cue.app</code>{' '}
            to Applications. First launch is blocked by Gatekeeper — right-click{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">cue.app</code>{' '}
            → <strong className="text-cue-text">Open</strong>, then confirm in the
            dialog.
          </li>
          <li>
            Grant <em>Screen Recording</em> and <em>Microphone</em> permissions in{' '}
            System Settings → Privacy &amp; Security when prompted. Screen Recording
            is required for the &ldquo;them&rdquo; channel (system audio loopback) and
            the screenshot feature.
          </li>
        </ol>
        <Callout tone="warn">
          <strong className="text-cue-text">macOS caveat:</strong> the maintainer
          does not currently have a Mac for QA, so the Apple Silicon DMG is shipped
          experimentally. Intel Macs are not supported in v0.1.x. Issues:{' '}
          <a
            href="https://github.com/Empower21/cue/issues"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-cue-text"
          >
            github.com/Empower21/cue/issues
          </a>
          .
        </Callout>
      </Section>

      <Section id="keys" n="3" title="Add your own API keys (one-time, per machine)">
        <p className="text-cue-muted">
          cue ships with empty placeholder keys — every user provides their own.
          There are no shared keys baked into the public binary, by design.
        </p>
        <ol className="ml-5 list-decimal space-y-2 text-cue-muted">
          <li>
            Open cue. Click the <KeyChip>⚙</KeyChip> gear icon in the header.
          </li>
          <li>
            Paste your <strong className="text-cue-text">Deepgram API key</strong>.{' '}
            <span>
              Required for speech-to-text. Get one free at{' '}
              <a
                href="https://console.deepgram.com/signup"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-cue-text"
              >
                console.deepgram.com/signup
              </a>{' '}
              — they grant ~$200 in credit on signup (~750 hours of streaming).
            </span>
            <pre className="mt-2 overflow-x-auto rounded-md border border-cue-subtle/40 bg-cue-surface/60 p-3 text-xs">
              <code>Deepgram API key:  &lt;your-40-char-deepgram-key&gt;</code>
            </pre>
          </li>
          <li>
            Paste your <strong className="text-cue-text">Override Anthropic key</strong>.{' '}
            <span>
              Required for Claude answers. Create one at{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-cue-text"
              >
                console.anthropic.com
              </a>
              . Add ~$5 prepaid credit to start; 4-tier prompt caching keeps
              per-question cost low.
            </span>
            <pre className="mt-2 overflow-x-auto rounded-md border border-cue-subtle/40 bg-cue-surface/60 p-3 text-xs">
              <code>Override Anthropic key:  sk-ant-api03-&lt;your-anthropic-key&gt;</code>
            </pre>
          </li>
          <li>Click <strong className="text-cue-text">Save</strong>.</li>
        </ol>
        <Callout>
          <strong className="text-cue-text">Per-device, once.</strong> Keys persist
          across launches in{' '}
          <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">config.toml</code>:
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li>
              Windows:{' '}
              <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">
                %APPDATA%\cue\config.toml
              </code>
            </li>
            <li>
              macOS:{' '}
              <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">
                ~/Library/Application Support/cue/config.toml
              </code>
            </li>
          </ul>
        </Callout>
      </Section>

      <Section id="purpose" n="4" title="Pick a Purpose: Interview / Meeting / Study">
        <p className="text-cue-muted">
          cue ships three system prompts, each tuned for a different conversation
          shape. Click the Purpose pill row above the mode selector to switch.
        </p>
        <PurposeCard
          name="Interview"
          tagline="Verbatim deliverable in your voice."
          body="STAR-format opener referencing your résumé. 2–4 supporting bullets grounded in your background. Closes with a push-back hint suggesting the next question you might steer toward. Treats every 'them' line as a question to you."
        />
        <PurposeCard
          name="Meeting"
          tagline="Decision verdict + transcript-grounded bullets."
          body="Leads with a paraphraseable answer or cut-scope verdict. 2–4 bullets attributed to who said what in the call. Closes with an incisive question you could ask next. Use for working meetings, stand-ups, client calls."
        />
        <PurposeCard
          name="Study"
          tagline="Plain-English explanation + check question."
          body="Leads with a plain-English explanation. 2–4 worked-example bullets. Closes with a check question to test your understanding. Use for tutorials, lectures, learning sessions."
        />
      </Section>

      <Section id="modes" n="5" title="Pick a Mode: Listen / Ask / Auto">
        <p className="text-cue-muted">
          Purpose shapes the answer. Mode controls when cue speaks.
        </p>
        <ModeCard
          name="Listen"
          tagline="Transcript only, no AI."
          body="Both sides of the conversation appear in real time, tagged 'you' and 'them.' Zero LLM cost beyond Deepgram. Best for capturing minutes."
        />
        <ModeCard
          name="Ask"
          tagline="You type, cue answers."
          body="Type a question, press Ctrl+Enter (or ⌘+Enter on Mac). cue sends your question plus JD + résumé + role + last ~10 turns of transcript to Claude and streams back an answer in the Purpose shape you picked."
        />
        <ModeCard
          name="Auto"
          tagline="cue listens for questions and answers them."
          body="Watches the 'them' channel for question patterns (line ends with '?', starts with what/how/why/tell/describe, etc.). 3-second debounce prevents back-to-back triggers. New answer card per question; old cards stack newest-first."
        />
      </Section>

      <Section id="hotkey" n="6" title="Hotkey: Ctrl+\\ / ⌘+\\">
        <p className="text-cue-muted">
          Press <KeyChip>Ctrl</KeyChip> + <KeyChip>\</KeyChip> on Windows or{' '}
          <KeyChip>⌘</KeyChip> + <KeyChip>\</KeyChip> on macOS from any application —
          including the call window — to hide cue. Press again to show. The hotkey
          is registered globally, so it fires even when cue isn&apos;t focused.
        </p>
        <ul className="ml-5 list-disc space-y-1 text-cue-muted">
          <li>Position, mode, and Purpose are preserved across hide/show.</li>
          <li>
            Capture keeps running while hidden. Toggle away mid-question in Auto mode
            and the answer will be waiting when you toggle back.
          </li>
        </ul>
      </Section>

      <Section id="screenshot" n="7" title="Screenshot — visual picker for monitors + windows">
        <p className="text-cue-muted">
          cue can read what&apos;s on your screen and feed it to Claude&apos;s vision
          model. Click <strong className="text-cue-text">Screenshot</strong> — within
          1–3 seconds a 2-column thumbnail grid opens:
        </p>
        <ul className="ml-5 list-disc space-y-1 text-cue-muted">
          <li>
            <strong className="text-cue-text">Entire screen</strong> — every monitor
            as a tile (primary chip marks the default).
          </li>
          <li>
            <strong className="text-cue-text">Window</strong> — every open window
            with a live preview.
          </li>
        </ul>
        <p className="text-cue-muted">
          Click any tile → cue captures only that surface at full resolution → vision
          call streams the answer into the answer card. The picker mirrors what
          Chrome&apos;s <em>Share screen</em> dialog shows.
        </p>
        <Callout>
          <strong className="text-cue-text">Custom prompt:</strong> type into the Ask
          box <em>before</em> clicking Screenshot to override the default &ldquo;explain
          what&apos;s on screen&rdquo; instruction. Useful for &ldquo;summarise this
          contract&rdquo;, &ldquo;is this code correct?&rdquo;, &ldquo;what&apos;s the
          answer to question 3?&rdquo;.
        </Callout>
        <Callout tone="warn">
          <strong className="text-cue-text">Single-flight gate:</strong> double-clicks
          on Screenshot are debounced. Only one vision call runs at a time; rapid
          clicks cancel any in-flight call before starting the next. Fixed in v0.1.9
          to prevent the interleaved-streams bug.
        </Callout>
      </Section>

      <Section id="mobile" n="8" title="Mobile second screen (web /app on your phone)">
        <p className="text-cue-muted">
          Open <Link href="/app" className="underline hover:text-cue-text">/app</Link>{' '}
          on your phone for a second-screen view of the same Purpose / Ask /
          Screenshot interface. Use case: you&apos;re on a laptop interview, the
          desktop overlay is on your laptop, and your phone shows the same picker as
          a glance-down companion.
        </p>
        <Callout tone="warn">
          <strong className="text-cue-text">Desktop browser gate.</strong> Visiting{' '}
          <Link href="/app" className="underline hover:text-cue-text">/app</Link> from
          a desktop browser shows a gate with a QR code to open on your phone. Reason:
          browser screen-capture APIs <em>do</em> capture browser tabs, so a desktop
          web overlay would be visible to Zoom/Meet&apos;s &ldquo;Share window&rdquo;
          picker. The desktop app uses an OS-level invisibility flag that browsers
          cannot use. Use the desktop app on the call machine; use the web app only
          on a separate phone.
        </Callout>
        <p className="text-cue-muted">
          The mobile web app supports all three Purpose modes, 9 languages, screenshot
          capture (via the browser&apos;s{' '}
          <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">getDisplayMedia</code>{' '}
          picker), and the same <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">/api/ask</code>{' '}
          backend. Bring-your-own-key works here too — paste your Deepgram key under
          ⚙ Settings; it&apos;s stored only in your phone&apos;s{' '}
          <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">localStorage</code>.
        </p>
      </Section>

      <Section id="languages" n="9" title="9 languages">
        <p className="text-cue-muted">
          UI translations ship for: English, Spanish, French, Chinese, Hindi, Arabic,
          Italian, German, Dutch. Toggle in ⚙ Settings → Language. The Deepgram
          model is set to Nova-2 multilingual by default, so transcription works for
          most of these too.
        </p>
      </Section>

      <Section id="run" n="10" title="Run a session">
        <ol className="ml-5 list-decimal space-y-2 text-cue-muted">
          <li>
            Join your call (Zoom, Meet, Teams, Webex, Slack Huddle, Discord, Loom —
            any of them).
          </li>
          <li>
            Position the cue overlay where you want it. Drag the header bar to move;
            click the <KeyChip>▢</KeyChip> button to collapse to a small pill.
          </li>
          <li>Pick a Purpose and a Mode (see sections 4 and 5).</li>
          <li>
            Click{' '}
            <span className="rounded bg-cue-accent px-2 py-0.5 text-xs text-white">
              Start
            </span>
            . The two voice-activity dots appear:
            <ul className="ml-5 mt-2 list-disc space-y-1">
              <li>
                <strong className="text-cue-text">you</strong> — flashes green when
                your mic hears voiced speech.
              </li>
              <li>
                <strong className="text-cue-text">them</strong> — flashes green when
                system audio (the other person) is talking.
              </li>
            </ul>
          </li>
        </ol>
        <Callout>
          <strong className="text-cue-text">The interviewer cannot see cue.</strong>{' '}
          Windows&apos; <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">WDA_EXCLUDEFROMCAPTURE</code>{' '}
          and macOS&apos; equivalent content-protection flag exclude the cue window
          from every screen-capture API on the system. The conferencing app sees the
          desktop behind cue, not cue itself.
        </Callout>
      </Section>

      <Section id="end" n="11" title="End a session">
        <p className="text-cue-muted">
          When you&apos;re done, click the <KeyChip>End</KeyChip> button in the
          header. A confirmation panel appears.
        </p>
        <ul className="ml-5 list-disc space-y-1 text-cue-muted">
          <li>
            <strong className="text-cue-text">Quick reset</strong> (checkbox
            unchecked): stops capture and wipes transcript + answer cards. Keeps
            your pasted JD / Résumé / Role-Company. Use between back-to-back
            interviews against the same prep.
          </li>
          <li>
            <strong className="text-cue-text">Full wipe</strong> (checkbox checked):
            same as above, plus blanks the Context fields. Use when you&apos;re done
            with a job-hunt cycle or handing the laptop to someone else.
          </li>
        </ul>
        <p className="text-cue-muted">
          Either way, your API keys stay in{' '}
          <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">config.toml</code>.
          The End Session flow never touches them — clear those via the gear if
          needed.
        </p>
      </Section>

      <Section id="troubleshooting" n="12" title="Troubleshooting">
        <Trouble symptom="Pressing Start does nothing / says 'Deepgram API key not set'.">
          Open <KeyChip>⚙</KeyChip>, paste your Deepgram key, Save. Then try Start
          again.
        </Trouble>

        <Trouble symptom="The 'them' dot never lights up — cue isn't capturing the other person.">
          <p>cue captures system audio loopback. Checks:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li>Audio is actually playing out of your speakers/headphones.</li>
            <li>
              macOS: confirm <em>Screen Recording</em> permission is granted to cue
              in System Settings → Privacy &amp; Security.
            </li>
            <li>
              Windows: confirm there&apos;s a default output device in Sound
              Settings.
            </li>
          </ul>
        </Trouble>

        <Trouble symptom="Screenshot picker shows text labels with no thumbnails.">
          Fixed in v0.1.11. If you&apos;re on an older build, update from{' '}
          <Link href="/download" className="underline hover:text-cue-text">/download</Link>.
        </Trouble>

        <Trouble symptom="Three rapid Screenshot clicks produced interleaved jumbled output.">
          Fixed in v0.1.9 with a single-flight streaming gate (useRef synchronous
          guard on the frontend + Rust AbortHandle on the backend). If you can
          reproduce on v0.1.11, please open an issue.
        </Trouble>

        <Trouble symptom="The Ctrl+\\ hotkey stops working after cue has been running for a long time.">
          <p>
            Known long-uptime issue on the alpha. Windows{' '}
            <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">RegisterHotKey</code>{' '}
            can drop after many hours.{' '}
            <strong className="text-cue-text">Fix:</strong> fully quit and relaunch.
          </p>
        </Trouble>

        <Trouble symptom="cue is visible in the Zoom/Meet share preview — invisibility broken.">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Confirm you&apos;re on a recent version of the conferencing app. Very
              old builds bypass the OS exclusion list.
            </li>
            <li>
              Confirm you&apos;re sharing your <em>screen</em>, not a virtual camera
              that re-captures the display.
            </li>
            <li>
              Restart cue — Windows occasionally drops the{' '}
              <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">WDA_EXCLUDEFROMCAPTURE</code>{' '}
              flag after a graphics-driver update.
            </li>
            <li>
              Reminder: cue is hidden from <em>screen capture</em>, not from your
              webcam. A camera pointed at your monitor sees cue.
            </li>
          </ul>
        </Trouble>
      </Section>

      <Section id="data" n="13" title="Data flow — what leaves your machine">
        <p className="text-cue-muted">
          The full list of outbound data when you run cue. Everything else stays on
          your disk.
        </p>
        <div className="mt-4 overflow-x-auto rounded-md border border-cue-subtle/40 bg-cue-surface/40">
          <table className="w-full text-left text-sm">
            <thead className="bg-cue-surface/60 text-xs uppercase tracking-wide text-cue-muted">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Retention</th>
              </tr>
            </thead>
            <tbody className="text-cue-muted">
              <tr className="border-t border-cue-subtle/40">
                <td className="px-4 py-3">Mic + system audio</td>
                <td className="px-4 py-3">Deepgram (WebSocket STT)</td>
                <td className="px-4 py-3">Ephemeral on their servers per TOS</td>
              </tr>
              <tr className="border-t border-cue-subtle/40">
                <td className="px-4 py-3">
                  Transcript + JD + résumé + last ~10 turns
                </td>
                <td className="px-4 py-3">Anthropic (Claude Sonnet 4.6)</td>
                <td className="px-4 py-3">
                  Per Anthropic API policy; cue does not log them
                </td>
              </tr>
              <tr className="border-t border-cue-subtle/40">
                <td className="px-4 py-3">Screenshot PNG (if used)</td>
                <td className="px-4 py-3">Anthropic vision endpoint</td>
                <td className="px-4 py-3">
                  Same as above — review before clicking
                </td>
              </tr>
              <tr className="border-t border-cue-subtle/40">
                <td className="px-4 py-3">Your API keys</td>
                <td className="px-4 py-3">
                  <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">
                    config.toml
                  </code>{' '}
                  on local disk only
                </td>
                <td className="px-4 py-3">Until you delete the file</td>
              </tr>
              <tr className="border-t border-cue-subtle/40">
                <td className="px-4 py-3">JD / résumé / role-company context</td>
                <td className="px-4 py-3">
                  <code className="rounded bg-cue-surface px-1.5 py-0.5 text-xs">
                    config.toml
                  </code>{' '}
                  on local disk only
                </td>
                <td className="px-4 py-3">
                  Until you clear via End Session (full wipe) or delete the file
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-cue-muted">
          Many jurisdictions require two-party consent for recording. cue does not
          record audio to disk, but you should still check local law before using it
          in any conversation. See the{' '}
          <Link href="/eula" className="underline hover:text-cue-text">EULA</Link>.
        </p>
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
    { id: 'safety', label: '1. Why cue is safe to use' },
    { id: 'install', label: '2. Install (Windows + macOS)' },
    { id: 'keys', label: '3. Add your own API keys' },
    { id: 'purpose', label: '4. Pick a Purpose' },
    { id: 'modes', label: '5. Pick a Mode' },
    { id: 'hotkey', label: '6. Hotkey: Ctrl+\\ / ⌘+\\' },
    { id: 'screenshot', label: '7. Screenshot picker' },
    { id: 'mobile', label: '8. Mobile second screen' },
    { id: 'languages', label: '9. 9 languages' },
    { id: 'run', label: '10. Run a session' },
    { id: 'end', label: '11. End a session' },
    { id: 'troubleshooting', label: '12. Troubleshooting' },
    { id: 'data', label: '13. Data flow' },
  ];
  return (
    <nav
      aria-label="Table of contents"
      className="mt-10 rounded-lg border border-cue-subtle/40 bg-cue-surface/40 px-5 py-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-cue-muted">
        Contents
      </p>
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
        <span className="font-mono text-sm text-cue-accent">
          {n.padStart(2, '0')}
        </span>
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
        {name}{' '}
        <span className="ml-2 text-xs font-normal text-cue-accent">{tagline}</span>
      </h3>
      <p className="mt-2 text-sm text-cue-muted">{body}</p>
    </div>
  );
}

function PurposeCard({
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
        {name}{' '}
        <span className="ml-2 text-xs font-normal text-emerald-400">{tagline}</span>
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
  const borderColor =
    tone === 'warn' ? 'border-amber-400/40' : 'border-cue-accent/40';
  const bgColor = tone === 'warn' ? 'bg-amber-400/5' : 'bg-cue-accent/5';
  return (
    <div
      className={`mt-4 rounded-md border-l-2 ${borderColor} ${bgColor} px-4 py-3 text-sm text-cue-muted`}
    >
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
