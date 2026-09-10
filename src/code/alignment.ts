import { diffLines } from "diff";
import { normalize } from "./format";
import type { DisplayLine } from "./types";

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
    previous: string | null,
    current: string,
    next: string | null,
): { rows: AlignedRow[]; limited: boolean } {
    const previousCurrent = toAlignment(previous, current);
    const currentNext = toAlignment(current, next);
    if (previousCurrent.limited || currentNext.limited) {
        return { rows: [], limited: true };
    }

    const rows: AlignedRow[] = [];
    let i = 0;
    let j = 0;
    while (i < previousCurrent.rows.length || j < currentNext.rows.length) {
        const previousRow =
            i < previousCurrent.rows.length ? previousCurrent.rows[i] : null;
        const nextRow =
            j < currentNext.rows.length ? currentNext.rows[j] : null;
        if (previousRow && previousRow.b == null) {
            rows.push({ p: previousRow.a, c: null, n: null });
            i++;
        } else if (nextRow && nextRow.a == null) {
            rows.push({ p: null, c: null, n: nextRow.b });
            j++;
        } else if (previousRow && nextRow) {
            rows.push({ p: previousRow.a, c: previousRow.b, n: nextRow.b });
            i++;
            j++;
        } else if (previousRow) {
            rows.push({ p: previousRow.a, c: null, n: null });
            i++;
        } else if (nextRow) {
            rows.push({ p: null, c: null, n: nextRow.b });
            j++;
        }
    }
    return { rows, limited: false };
}

function fillColumn(lines: string[], total: number): DisplayLine[] {
    return Array.from({ length: total }, (_, i) =>
        i < lines.length
            ? { text: lines[i], number: i + 1, changed: false }
            : { text: "", number: null, changed: false },
    );
}

export function alignPanels(
    previous: string | null,
    current: string | null,
    next: string | null,
): { columns: DisplayLine[][]; limited: boolean } {
    const previousLines = splitLines(previous);
    const currentLines = splitLines(current);
    const nextLines = splitLines(next);

    if (current == null) {
        const previousNext = toAlignment(previous, next);
        if (previousNext.limited) {
            const total = Math.max(previousLines.length, nextLines.length);
            return {
                columns: [
                    fillColumn(previousLines, total),
                    fillColumn(currentLines, total),
                    fillColumn(nextLines, total),
                ],
                limited: true,
            };
        }

        const column = (
            lines: string[],
            pick: (row: PairRow) => number | null,
            isChanged: (row: PairRow) => boolean,
        ) =>
            previousNext.rows.map((row) => {
                const index = pick(row);
                if (index == null) {
                    return { text: "", number: null, changed: false };
                }
                return {
                    text: lines[index] ?? "",
                    number: index + 1,
                    changed: isChanged(row),
                };
            });

        return {
            columns: [
                column(
                    previousLines,
                    (row) => row.a,
                    (row) => row.b == null && row.a != null,
                ),
                Array.from({ length: previousNext.rows.length }, () => ({
                    text: "",
                    number: null,
                    changed: false,
                })),
                column(
                    nextLines,
                    (row) => row.b,
                    (row) => row.a == null && row.b != null,
                ),
            ],
            limited: false,
        };
    }

    const { rows, limited } = alignThree(previous, current, next);
    if (limited) {
        const total = Math.max(
            previousLines.length,
            currentLines.length,
            nextLines.length,
        );
        return {
            columns: [
                fillColumn(previousLines, total),
                fillColumn(currentLines, total),
                fillColumn(nextLines, total),
            ],
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
            if (index == null) {
                return { text: "", number: null, changed: false };
            }
            return {
                text: lines[index] ?? "",
                number: index + 1,
                changed: isChanged(row),
            };
        });

    return {
        columns: [
            column(
                previousLines,
                (row) => row.p,
                (row) => row.c == null && row.p != null,
            ),
            column(
                currentLines,
                (row) => row.c,
                (row) => row.p == null && row.c != null,
            ),
            column(
                nextLines,
                (row) => row.n,
                (row) => row.c == null && row.n != null,
            ),
        ],
        limited: false,
    };
}

export function alignPair(
    previous: string | null,
    current: string | null,
): { columns: [DisplayLine[], DisplayLine[]]; limited: boolean } {
    const previousLines = splitLines(previous);
    const currentLines = splitLines(current);
    const pair = toAlignment(previous, current);
    if (pair.limited) {
        const total = Math.max(previousLines.length, currentLines.length);
        return {
            columns: [
                fillColumn(previousLines, total),
                fillColumn(currentLines, total),
            ],
            limited: true,
        };
    }

    const previousColumn = pair.rows.map((row) => {
        const index = row.a;
        if (index == null) return { text: "", number: null, changed: false };
        return {
            text: previousLines[index] ?? "",
            number: index + 1,
            changed: row.b == null,
        };
    });
    const currentColumn = pair.rows.map((row) => {
        const index = row.b;
        if (index == null) return { text: "", number: null, changed: false };
        return {
            text: currentLines[index] ?? "",
            number: index + 1,
            changed: row.a == null,
        };
    });
    return { columns: [previousColumn, currentColumn], limited: false };
}

export function unionChangedRows(
    columns: DisplayLine[][],
): ReadonlySet<number> {
    const rows = new Set<number>();
    for (const column of columns) {
        for (let i = 0; i < column.length; i++) {
            if (column[i].changed) rows.add(i);
        }
    }
    return rows;
}
