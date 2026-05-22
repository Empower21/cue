//! Streaming Anthropic proxy for the web copilot.
//!
//! The browser POSTs a JSON body with the same shape that the desktop builds
//! locally. We re-shape it into Messages-API content blocks (system prompt +
//! context + transcript + trigger, optional image) and stream SSE back.
//!
//! Auth precedence:
//!   1. Authorization: Bearer <key> header from the browser (user override
//!      from Settings).
//!   2. ANTHROPIC_API_KEY env var on the server (the deploy's default key).
//!
//! On primary failure (5xx, timeout, missing key) we fall back to HuggingFace
//! Mistral-7B-Instruct using HUGGINGFACE_TOKEN — same self-healing pattern as
//! the desktop binary.

import Anthropic from '@anthropic-ai/sdk';

// Local content-block types. The SDK's TextBlockParam in 0.32.1 doesn't
// include `cache_control` even though the runtime API supports it (gated by
// the prompt-caching beta header). We intentionally type these ourselves
// and cast at the .create() call site.
interface CachedTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}
interface ImageBlock {
  type: 'image';
  source: { type: 'base64'; media_type: 'image/png'; data: string };
}
type UserContentBlock = CachedTextBlock | ImageBlock;

export const runtime = 'edge';

interface AskBody {
  mode: 'interview' | 'meeting' | 'study';
  trigger: string;
  jd?: string;
  resume?: string;
  roleContext?: string;
  voiceSample?: string;
  language?: string;
  transcript?: { channel: 'mic' | 'system'; text: string }[];
  imageB64?: string;
}

const SYSTEM_PROMPTS: Record<AskBody['mode'], string> = {
  interview:
    "You are a real-time interview coach. The candidate has pasted their JD, resume, and any role context. You receive rolling transcript labelled [you]=candidate, [them]=interviewer. When prompted, produce EXACTLY this 3-part shape — no headers, just content in order: (1) Opening line — one sentence the candidate can deliver verbatim, confident and not hedged. (2) 2-4 supporting bullets — each grounded in a NAMED resume project, a JD requirement, or recognized practice; no platitudes. (3) Follow-through — one short line for if the interviewer pushes deeper. If a screenshot is attached: treat it as a coding problem/technical artifact. Opening = your verdict/approach, bullets = implementation walk-through, follow-through = edge case to mention. Compact markdown, no preamble.",
  meeting:
    'You are a real-time meeting copilot in a live professional meeting. Transcript labelled [you]=user, [them]=other participants. When prompted, produce EXACTLY this 3-part shape — no headers, just content in order: (1) Opening line — one sentence the user can paraphrase aloud (their take/answer/decision in one breath). (2) 2-3 supporting bullets — facts/decisions from transcript with owners if mentioned, OR action items starting with a verb + name, OR relevant brought-in context. Never fabricate names or commitments. (3) Follow-through — one incisive follow-up question, or a thoughtful boundary if being asked to commit. If a screenshot is attached: it is a slide/doc/dashboard. Opening summarises it; bullets pull out 2-3 key items; follow-through is the smartest question. Compact markdown, no preamble.',
  study:
    'You are a real-time study tutor. The user is reviewing material. Transcript labelled [you]=user, [them]=teacher/tutor/lecturer. When prompted, produce EXACTLY this 3-part shape — no headers, just content in order: (1) Opening line — the core idea in plain English, one sentence, define jargon inline if used. (2) 2-4 supporting bullets — a worked example with each step shown (no skipped algebra) OR analogies connecting to something familiar, with at least one concrete example. (3) Follow-through — a single check question the user can answer in 1-2 sentences to verify understanding. If a screenshot is attached: it is a textbook page/problem/slide. Opening states what the page is about; bullets walk through key steps; follow-through is a check question on what is shown. Prefer correctness over breadth. Compact markdown, no preamble.',
};

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  zh: 'Mandarin Chinese',
  hi: 'Hindi',
  ar: 'Arabic',
  it: 'Italian',
  de: 'German',
  nl: 'Dutch',
};

const FIRST_TOKEN_TIMEOUT_MS = 8_000;

export async function POST(req: Request) {
  const headerKey = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const anthropicKey = headerKey || process.env.ANTHROPIC_API_KEY?.trim();
  const hfToken = process.env.HUGGINGFACE_TOKEN?.trim();

  let body: AskBody;
  try {
    body = (await req.json()) as AskBody;
  } catch {
    return new Response('Bad JSON body', { status: 400 });
  }
  if (!body.trigger?.trim()) {
    return new Response('Missing trigger', { status: 400 });
  }

  const systemText = buildSystem(body);
  const contextBlock = buildContext(body);
  const userContent = buildUserContent(body);

  const systemBlocks: CachedTextBlock[] = contextBlock
    ? [
        { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: contextBlock, cache_control: { type: 'ephemeral' } },
      ]
    : [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      // Try Anthropic first, with a first-token timeout. On any failure path
      // before a token reaches the client, drop into HuggingFace fallback.
      const anthropicOk = await tryAnthropic({
        apiKey: anthropicKey,
        systemBlocks,
        userContent,
        send,
        timeoutMs: FIRST_TOKEN_TIMEOUT_MS,
      });

      if (!anthropicOk) {
        send({ type: 'fallback', text: 'Anthropic unavailable — falling back to HuggingFace Mistral-7B' });
        await runHuggingFace({
          token: hfToken,
          systemText,
          contextBlock,
          trigger: body.trigger,
          transcript: body.transcript ?? [],
          send,
        });
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

interface TryAnthropicArgs {
  apiKey: string | undefined;
  systemBlocks: CachedTextBlock[];
  userContent: UserContentBlock[];
  send: (obj: unknown) => void;
  timeoutMs: number;
}

/// Returns true iff at least one token was forwarded to the client. Anything
/// else (missing key, network error, 5xx, no token before timeout) returns
/// false so the caller can decide whether to fall back.
async function tryAnthropic({
  apiKey,
  systemBlocks,
  userContent,
  send,
  timeoutMs,
}: TryAnthropicArgs): Promise<boolean> {
  if (!apiKey) return false;
  let delivered = false;
  try {
    const anthropic = new Anthropic({
      apiKey,
      defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
    });
    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      stream: true,
      system: systemBlocks as unknown as Anthropic.TextBlockParam[],
      messages: [
        { role: 'user', content: userContent as unknown as Anthropic.ContentBlock[] },
      ],
    });

    const firstTokenDeadline = Date.now() + timeoutMs;
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        delivered = true;
        send({ type: 'token', text: event.delta.text });
      } else if (event.type === 'message_stop') {
        send({ type: 'done' });
        return true;
      }
      if (!delivered && Date.now() > firstTokenDeadline) {
        return false;
      }
    }
    return delivered;
  } catch (err) {
    if (delivered) {
      send({
        type: 'error',
        reason: err instanceof Error ? err.message : String(err),
      });
      // Mid-stream error after partial output — don't double up with fallback.
      return true;
    }
    return false;
  }
}

interface RunHfArgs {
  token: string | undefined;
  systemText: string;
  contextBlock: string;
  trigger: string;
  transcript: { channel: 'mic' | 'system'; text: string }[];
  send: (obj: unknown) => void;
}

async function runHuggingFace({ token, systemText, contextBlock, trigger, transcript, send }: RunHfArgs) {
  if (!token) {
    send({ type: 'error', reason: 'No Anthropic key and HUGGINGFACE_TOKEN not configured.' });
    return;
  }
  const rolling = transcript
    .map((t) => `[${t.channel === 'mic' ? 'you' : 'them'}] ${t.text}`)
    .join('\n');
  const prompt = `<s>[INST] ${systemText}\n\n${contextBlock}\n\n## Recent transcript\n${rolling}\n\n## Trigger\n${trigger} [/INST]`;
  try {
    const resp = await fetch(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 800, return_full_text: false, temperature: 0.4 },
          options: { wait_for_model: true },
        }),
      },
    );
    if (!resp.ok) {
      send({ type: 'error', reason: `HF ${resp.status}: ${await resp.text()}` });
      return;
    }
    const arr = (await resp.json()) as { generated_text?: string }[];
    const text = arr[0]?.generated_text ?? '';
    // Chunk the result so the UI still feels live.
    for (let i = 0; i < text.length; i += 30) {
      send({ type: 'token', text: text.slice(i, i + 30) });
      await new Promise((r) => setTimeout(r, 20));
    }
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', reason: err instanceof Error ? err.message : String(err) });
  }
}

function buildSystem(body: AskBody): string {
  let sys = SYSTEM_PROMPTS[body.mode] ?? SYSTEM_PROMPTS.interview;
  const langShort = body.language?.split('-')[0];
  if (langShort && langShort !== 'en' && LANGUAGE_NAMES[langShort]) {
    sys += `\n\nRespond in ${LANGUAGE_NAMES[langShort]}. The transcript may be in any language; your answer must be in ${LANGUAGE_NAMES[langShort]}.`;
  }
  return sys;
}

function buildContext(body: AskBody): string {
  const parts: string[] = [];
  if (body.jd?.trim()) parts.push(`## Job description\n${body.jd.trim()}`);
  if (body.resume?.trim()) parts.push(`## Candidate resume\n${body.resume.trim()}`);
  if (body.roleContext?.trim()) parts.push(`## Role context\n${body.roleContext.trim()}`);
  if (body.voiceSample?.trim()) {
    parts.push(
      `## Voice & tone reference (the user's own writing)\nMatch the cadence, vocabulary, hedging, and idioms in this sample. Do not copy phrases verbatim — internalise the voice.\n\n${body.voiceSample.trim()}`,
    );
  }
  return parts.join('\n\n');
}

function buildUserContent(body: AskBody): UserContentBlock[] {
  const content: UserContentBlock[] = [];
  const rolling =
    body.transcript
      ?.map((t) => `[${t.channel === 'mic' ? 'you' : 'them'}] ${t.text}`)
      .join('\n') ?? '';
  if (rolling) {
    content.push({
      type: 'text',
      text: `## Recent transcript\n${rolling}`,
      cache_control: { type: 'ephemeral' },
    });
  }
  if (body.imageB64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: body.imageB64 },
    });
  }
  content.push({ type: 'text', text: `## Trigger\n${body.trigger}` });
  return content;
}
