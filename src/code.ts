import { diffLines } from "diff";
import hljs from "highlight.js/lib/common";

export function normalize(content: string) {
  return content.replace(/\r\n/g, "\n");
}

export function compare(
  before: string | null | undefined,
  after: string | null | undefined,
) {
  const removed: number[] = [];
  const added: number[] = [];
  if (before == null && after != null) {
    const text = normalize(after);
    if (text) {
      const lines = text.replace(/\n$/, "").split("\n");
      for (let i = 0; i < lines.length; i++) added.push(i);
    }
    return { removed, added, limited: false };
  }
  if (before == null || after == null)
    return { removed, added, limited: false };
  const changes = diffLines(normalize(before), normalize(after), {
    timeout: 60,
    maxEditLength: 3000,
  });
  if (!changes) return { removed, added, limited: true };
  let oldLine = 0;
  let newLine = 0;
  for (const change of changes) {
    const count = change.count ?? 0;
    if (change.added) {
      for (let i = 0; i < count; i++) added.push(newLine++);
    } else if (change.removed) {
      for (let i = 0; i < count; i++) removed.push(oldLine++);
    } else {
      oldLine += count;
      newLine += count;
    }
  }
  return { removed, added, limited: false };
}

const languages: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  vue: "xml",
  svelte: "xml",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  md: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  ini: "ini",
  toml: "ini",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

export function languageFor(path: string) {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return languages[name.split(".").at(-1) ?? ""] ?? "plaintext";
}

export function highlight(content: string, path: string) {
  const language = languageFor(path);
  if (content.length <= 160_000 && hljs.getLanguage(language)) {
    return hljs.highlight(content, { language, ignoreIllegals: true }).value;
  }
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const MAX_LINES = 10_000;
const CONTEXT_LINES = 3;

export interface LineRow {
  kind: "line";
  line: number;
  text: string;
}

export interface GapRow {
  kind: "gap";
  from: number;
  count: number;
}

export type CodeRow = LineRow | GapRow;

export function buildRows(
  lines: string[],
  changed: ReadonlySet<number>,
  collapsed: boolean,
  expanded: ReadonlySet<number> = new Set<number>(),
): CodeRow[] {
  if (!collapsed)
    return lines.map((text, line) => ({ kind: "line", line, text }));
  const visible = new Set<number>();
  for (const changedLine of changed) {
    for (
      let i = Math.max(0, changedLine - CONTEXT_LINES);
      i <= Math.min(lines.length - 1, changedLine + CONTEXT_LINES);
      i++
    )
      visible.add(i);
  }
  const rows: CodeRow[] = [];
  let from = -1;
  let count = 0;
  const flush = () => {
    if (count === 0) return;
    if (expanded.has(from)) {
      for (let i = from; i < from + count; i++)
        rows.push({ kind: "line", line: i, text: lines[i] });
    } else {
      rows.push({ kind: "gap", from, count });
    }
    count = 0;
  };
  for (let line = 0; line < lines.length; line++) {
    if (visible.has(line)) {
      flush();
      rows.push({ kind: "line", line, text: lines[line] });
    } else {
      if (count === 0) from = line;
      count++;
    }
  }
  flush();
  return rows;
}

export interface DisplayLine {
  text: string;
  number: number | null;
  changed: boolean;
}

interface PairRow {
  a: number | null;
  b: number | null;
}

export interface AlignedRow {
  p: number | null;
  c: number | null;
  n: number | null;
}

function splitLines(content: string | null) {
  if (!content) return [];
  return normalize(content).replace(/\n$/, "").split("\n");
}

function toAlignment(
  before: string | null,
  after: string | null,
): { rows: PairRow[]; limited: boolean } {
  if (before == null && after == null) return { rows: [], limited: false };
  if (before == null) {
    return {
      rows: splitLines(after).map((_, i) => ({ a: null, b: i })),
      limited: false,
    };
  }
  if (after == null) {
    return {
      rows: splitLines(before).map((_, i) => ({ a: i, b: null })),
      limited: false,
    };
  }
  const changes = diffLines(normalize(before), normalize(after), {
    timeout: 60,
    maxEditLength: 3000,
  });
  if (!changes) return { rows: [], limited: true };
  const rows: PairRow[] = [];
  let a = 0;
  let b = 0;
  for (const change of changes) {
    const count = change.count ?? 0;
    if (change.added) {
      for (let k = 0; k < count; k++) rows.push({ a: null, b: b++ });
    } else if (change.removed) {
      for (let k = 0; k < count; k++) rows.push({ a: a++, b: null });
    } else {
      for (let k = 0; k < count; k++) rows.push({ a: a++, b: b++ });
    }
  }
  return { rows, limited: false };
}

function alignThree(
  p: string | null,
  c: string,
  n: string | null,
): { rows: AlignedRow[]; limited: boolean } {
  const pc = toAlignment(p, c);
  const cn = toAlignment(c, n);
  if (pc.limited || cn.limited) return { rows: [], limited: true };
  const rows: AlignedRow[] = [];
  let i = 0;
  let j = 0;
  while (i < pc.rows.length || j < cn.rows.length) {
    const pcr = i < pc.rows.length ? pc.rows[i] : null;
    const cnr = j < cn.rows.length ? cn.rows[j] : null;
    if (pcr && pcr.b == null) {
      rows.push({ p: pcr.a, c: null, n: null });
      i++;
    } else if (cnr && cnr.a == null) {
      rows.push({ p: null, c: null, n: cnr.b });
      j++;
    } else if (pcr && cnr) {
      rows.push({ p: pcr.a, c: pcr.b, n: cnr.b });
      i++;
      j++;
    } else if (pcr) {
      rows.push({ p: pcr.a, c: null, n: null });
      i++;
    } else if (cnr) {
      rows.push({ p: null, c: null, n: cnr.b });
      j++;
    }
  }
  return { rows, limited: false };
}

export function alignPanels(
  p: string | null,
  c: string | null,
  n: string | null,
): { columns: DisplayLine[][]; limited: boolean } {
  const pLines = splitLines(p);
  const cLines = splitLines(c);
  const nLines = splitLines(n);
  if (c == null) {
    const pn = toAlignment(p, n);
    if (pn.limited) {
      const total = Math.max(pLines.length, nLines.length);
      const column = (arr: string[]) =>
        Array.from({ length: total }, (_, i) =>
          i < arr.length
            ? { text: arr[i], number: i + 1, changed: false }
            : { text: "", number: null, changed: false },
        );
      return {
        columns: [column(pLines), column(cLines), column(nLines)],
        limited: true,
      };
    }
    const column = (
      lines: string[],
      pick: (row: PairRow) => number | null,
      isChanged: (row: PairRow) => boolean,
    ) =>
      pn.rows.map((row) => {
        const index = pick(row);
        if (index == null) return { text: "", number: null, changed: false };
        return {
          text: lines[index] ?? "",
          number: index + 1,
          changed: isChanged(row),
        };
      });
    return {
      columns: [
        column(
          pLines,
          (row) => row.a,
          (row) => row.b == null && row.a != null,
        ),
        Array.from({ length: pn.rows.length }, () => ({
          text: "",
          number: null,
          changed: false,
        })),
        column(
          nLines,
          (row) => row.b,
          (row) => row.a == null && row.b != null,
        ),
      ],
      limited: false,
    };
  }
  const { rows, limited } = alignThree(p, c, n);
  if (limited) {
    const total = Math.max(pLines.length, cLines.length, nLines.length);
    const column = (arr: string[]) =>
      Array.from({ length: total }, (_, i) =>
        i < arr.length
          ? { text: arr[i], number: i + 1, changed: false }
          : { text: "", number: null, changed: false },
      );
    return {
      columns: [column(pLines), column(cLines), column(nLines)],
      limited: true,
    };
  }
  const column = (
    lines: string[],
    pick: (row: AlignedRow) => number | null,
    isChanged: (row: AlignedRow) => boolean,
  ) =>
    rows.map((row) => {
      const index = pick(row);
      if (index == null) return { text: "", number: null, changed: false };
      return {
        text: lines[index] ?? "",
        number: index + 1,
        changed: isChanged(row),
      };
    });
  return {
    columns: [
      column(
        pLines,
        (row) => row.p,
        (row) => row.c == null && row.p != null,
      ),
      column(
        cLines,
        (row) => row.c,
        (row) => row.p == null && row.c != null,
      ),
      column(
        nLines,
        (row) => row.n,
        (row) => row.c == null && row.n != null,
      ),
    ],
    limited: false,
  };
}

export function alignPair(
  p: string | null,
  c: string | null,
): { columns: [DisplayLine[], DisplayLine[]]; limited: boolean } {
  const pLines = splitLines(p);
  const cLines = splitLines(c);
  const pc = toAlignment(p, c);
  if (pc.limited) {
    const total = Math.max(pLines.length, cLines.length);
    const fill = (arr: string[]) =>
      Array.from({ length: total }, (_, i) =>
        i < arr.length
          ? { text: arr[i], number: i + 1, changed: false }
          : { text: "", number: null, changed: false },
      );
    return { columns: [fill(pLines), fill(cLines)], limited: true };
  }
  const col0 = pc.rows.map((row) => {
    const index = row.a;
    if (index == null) return { text: "", number: null, changed: false };
    return {
      text: pLines[index] ?? "",
      number: index + 1,
      changed: row.b == null,
    };
  });
  const col1 = pc.rows.map((row) => {
    const index = row.b;
    if (index == null) return { text: "", number: null, changed: false };
    return {
      text: cLines[index] ?? "",
      number: index + 1,
      changed: row.a == null,
    };
  });
  return { columns: [col0, col1], limited: false };
}

export function unionChangedRows(columns: DisplayLine[][]): ReadonlySet<number> {
  const rows = new Set<number>();
  for (const column of columns)
    for (let i = 0; i < column.length; i++)
      if (column[i].changed) rows.add(i);
  return rows;
}

export function formatDate(date: string, long = false) {
  return new Intl.DateTimeFormat(undefined, {
    month: long ? "long" : "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}
