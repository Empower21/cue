//! Server-side text extraction for the web copilot's "Upload writing sample".
//!
//! The browser cannot parse .docx or .pdf natively, so we accept a multipart
//! upload and extract the text here. Plain .txt/.md files are streamed back
//! verbatim. Anything else is rejected with a 415.
//!
//! No persistence — the response body IS the extracted text and the file is
//! discarded immediately.

import JSZip from 'jszip';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const entry = form.get('file');
  if (!(entry instanceof File)) {
    return new Response('Missing file', { status: 400 });
  }
  if (entry.size > MAX_BYTES) {
    return new Response('File too large (max 5 MB)', { status: 413 });
  }
  const name = entry.name;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';

  try {
    let text = '';
    if (['txt', 'md', 'markdown', 'rst'].includes(ext)) {
      text = await entry.text();
    } else if (ext === 'docx') {
      text = await extractDocx(entry);
    } else if (ext === 'pdf') {
      // PDF parsing on Edge/Node is non-trivial without a heavy dep. We tell
      // the user to drop the PDF into the textarea by hand for now, or use
      // the desktop app which has pdf-extract bundled.
      return new Response(
        'PDF extraction is only available in the cue desktop app right now. Paste the text directly, or open the .pdf and copy-paste.',
        { status: 415 },
      );
    } else {
      return new Response(`Unsupported file type .${ext}`, { status: 415 });
    }

    return Response.json({
      text: normalise(text),
      sourceName: name,
      bytes: entry.size,
    });
  } catch (err) {
    return new Response(
      `Could not read that file: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 },
    );
  }
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('document.xml not found in .docx');
  const xml = await doc.async('text');
  return stripDocxXml(xml);
}

function stripDocxXml(xml: string): string {
  let out = '';
  let i = 0;
  while (i < xml.length) {
    if (xml.startsWith('<w:p', i)) {
      if (out && !out.endsWith('\n')) out += '\n';
      i = xml.indexOf('>', i) + 1;
      continue;
    }
    if (xml.startsWith('</w:p>', i)) {
      out += '\n';
      i += 6;
      continue;
    }
    if (xml.startsWith('<w:t', i)) {
      const close = xml.indexOf('>', i);
      const tEnd = xml.indexOf('</w:t>', close);
      if (tEnd === -1) break;
      out += decodeEntities(xml.slice(close + 1, tEnd));
      i = tEnd + 6;
      continue;
    }
    i += 1;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function normalise(text: string): string {
  const lines: string[] = [];
  let blanks = 0;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) {
      blanks += 1;
      if (blanks <= 2) lines.push('');
    } else {
      blanks = 0;
      lines.push(trimmed);
    }
  }
  return lines.join('\n').trim();
}
