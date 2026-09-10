import type { CodeRow } from "./types";

export const MAX_LINES = 10_000;
const CONTEXT_LINES = 3;

export function buildRows(
    lines: string[],
    changed: ReadonlySet<number>,
    collapsed: boolean,
    expanded: ReadonlySet<number> = new Set<number>(),
): CodeRow[] {
    if (!collapsed) {
        return lines.map((text, line) => ({ kind: "line", line, text }));
    }

    const visible = new Set<number>();
    for (const changedLine of changed) {
        for (
            let i = Math.max(0, changedLine - CONTEXT_LINES);
            i <= Math.min(lines.length - 1, changedLine + CONTEXT_LINES);
            i++
        ) {
            visible.add(i);
        }
    }

    const rows: CodeRow[] = [];
    let from = -1;
    let count = 0;
    const flush = () => {
        if (count === 0) return;
        if (expanded.has(from)) {
            for (let i = from; i < from + count; i++) {
                rows.push({ kind: "line", line: i, text: lines[i] });
            }
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
