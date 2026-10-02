// frontend/lib/format.ts
// Lightweight, dependency-free code formatter used by the Monaco editor.
// Priority is SAFETY: formatted code is executed by Judge0, so formatting
// must never change program behaviour.

const SUPPORTED: Record<string, string> = {
  python: "python",
  javascript: "javascript",
  java: "java",
  c: "c",
};

function stripTrailingWhitespace(lines: string[]): string[] {
  return lines.map(l => l.replace(/\s+$/, ""));
}

function normalizeBlankLines(lines: string[]): string[] {
  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blanks += 1;
      if (blanks <= 2) out.push("");
    } else {
      blanks = 0;
      out.push(line);
    }
  }
  return out;
}

function charOccurs(line: string, ch: string): number {
  let count = 0;
  let inStr: string | null = null;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === ch) count += 1;
  }
  return count;
}

function braceIndent(lines: string[]): string[] {
  const out: string[] = [];
  let depth = 0;
  for (const raw of lines) {
    const trimmed = raw.trim();

    if (trimmed === "") {
      out.push("");
      continue;
    }

    const open = charOccurs(trimmed, "{");
    const close = charOccurs(trimmed, "}");

    // Lines starting with "}" (e.g. "}", "} else {") belong to the parent depth
    const startsWithClose = trimmed.startsWith("}");
    const effectiveDepth = startsWithClose ? Math.max(depth - close, 0) : depth;

    out.push(" ".repeat(effectiveDepth * 4) + trimmed);
    depth = Math.max(depth + open - close, 0);
  }
  return out;
}

function cleanLines(lines: string[]): string[] {
  let l = lines.map(line => line.replace(/^\t+/, m => " ".repeat(m.length * 4)));
  l = stripTrailingWhitespace(l);
  l = normalizeBlankLines(l);
  return l;
}

export function formatCode(code: string, language: string): string {
  const text = code.replace(/\r\n/g, "\n");
  let lines = text.split("\n");

  lines = cleanLines(lines);

  const lang = SUPPORTED[language];
  if (lang === "javascript" || lang === "java" || lang === "c") {
    lines = braceIndent(lines);
  }
  // python: keep original indentation (whitespace-sensitive), only the cleanups above.

  return lines.join("\n").replace(/\s+$/, "") + "\n";
}