//! Text extraction for the Context tab's "upload writing sample" feature.
//!
//! Supports .txt / .md (plain read), .docx (zip → word/document.xml, strip XML
//! tags), and .pdf (pdf-extract). Anything else returns an error the UI can
//! show the user.

use std::io::Read;
use std::path::Path;

/// Max accepted file size — 5 MB. Voice samples are typically short essays; a
/// 5 MB cap protects against accidentally uploading a giant PDF that would
/// blow the prompt cache and the user's tokens.
const MAX_BYTES: usize = 5 * 1024 * 1024;

#[tauri::command]
pub async fn read_document(path: String) -> Result<DocumentExtract, String> {
    let path = Path::new(&path).to_path_buf();
    tokio::task::spawn_blocking(move || extract(&path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join: {e}"))?
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct DocumentExtract {
    pub text: String,
    pub source_name: String,
    pub bytes: usize,
}

fn extract(path: &Path) -> anyhow::Result<DocumentExtract> {
    let meta = std::fs::metadata(path)?;
    let size = meta.len() as usize;
    if size > MAX_BYTES {
        anyhow::bail!("file is {} MB; max is 5 MB", size / 1024 / 1024);
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();

    let text = match ext.as_str() {
        "txt" | "md" | "markdown" | "rst" => std::fs::read_to_string(path)?,
        "docx" => read_docx(path)?,
        "pdf" => read_pdf(path)?,
        other => anyhow::bail!(
            "unsupported file type '.{other}' — supported: .txt, .md, .docx, .pdf"
        ),
    };

    let source_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document")
        .to_string();

    Ok(DocumentExtract {
        text: normalise(&text),
        source_name,
        bytes: size,
    })
}

fn read_docx(path: &Path) -> anyhow::Result<String> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let mut doc = zip.by_name("word/document.xml")?;
    let mut xml = String::new();
    doc.read_to_string(&mut xml)?;
    Ok(strip_docx_xml(&xml))
}

/// docx text lives inside `<w:t>...</w:t>` runs, with paragraphs delimited by
/// `<w:p>`. A full XML parser would be more correct, but the structure is
/// simple enough that a focused string scan handles 99% of real-world files
/// without pulling in a heavyweight dep.
fn strip_docx_xml(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len() / 2);
    let bytes = xml.as_bytes();
    let mut i = 0;
    let para_open = b"<w:p ";
    let para_open_short = b"<w:p>";
    let para_close = b"</w:p>";
    let t_open = b"<w:t";
    let t_close = b"</w:t>";

    while i < bytes.len() {
        if starts_with_at(bytes, i, para_open) || starts_with_at(bytes, i, para_open_short) {
            if !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            i = skip_to(bytes, i, b">") + 1;
        } else if starts_with_at(bytes, i, para_close) {
            out.push('\n');
            i += para_close.len();
        } else if starts_with_at(bytes, i, t_open) {
            let close = skip_to(bytes, i, b">");
            let text_start = close + 1;
            let text_end = find_at(bytes, text_start, t_close).unwrap_or(text_start);
            out.push_str(&decode_entities(
                std::str::from_utf8(&bytes[text_start..text_end]).unwrap_or(""),
            ));
            i = text_end + t_close.len();
        } else {
            i += 1;
        }
    }
    out
}

fn starts_with_at(buf: &[u8], i: usize, needle: &[u8]) -> bool {
    i + needle.len() <= buf.len() && &buf[i..i + needle.len()] == needle
}

fn skip_to(buf: &[u8], i: usize, needle: &[u8]) -> usize {
    find_at(buf, i, needle).unwrap_or(buf.len() - 1)
}

fn find_at(buf: &[u8], i: usize, needle: &[u8]) -> Option<usize> {
    if needle.is_empty() {
        return Some(i);
    }
    let first = needle[0];
    let mut j = i;
    while j + needle.len() <= buf.len() {
        if buf[j] == first && &buf[j..j + needle.len()] == needle {
            return Some(j);
        }
        j += 1;
    }
    None
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn read_pdf(path: &Path) -> anyhow::Result<String> {
    let bytes = std::fs::read(path)?;
    pdf_extract::extract_text_from_mem(&bytes).map_err(|e| anyhow::anyhow!("pdf parse: {e}"))
}

/// Collapse Windows line endings, drop trailing whitespace per line, and cap
/// runs of blank lines to two — keeps the prompt tidy without losing
/// structure.
fn normalise(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_run = 0usize;
    for line in text.replace('\r', "").lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            blank_run += 1;
            if blank_run <= 2 {
                out.push('\n');
            }
        } else {
            blank_run = 0;
            out.push_str(trimmed);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_docx_runs() {
        let xml = r#"<w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p><w:p><w:r><w:t>Line 2</w:t></w:r></w:p>"#;
        let got = strip_docx_xml(xml);
        assert!(got.contains("Hello world"));
        assert!(got.contains("Line 2"));
    }

    #[test]
    fn decodes_entities() {
        assert_eq!(decode_entities("a &amp; b"), "a & b");
    }
}
