import type { Commit, Repository, Revision } from "./types";
import { MAX_LINES, type DisplayLine } from "./code";

export function errorMessage(error: unknown) {
    return error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
}

export function revisionContent(value: Revision | undefined): string | null {
    if (!value) return null;
    const text = value.missing ? "" : value.content;
    return text ?? null;
}

export function changedRows(lines: DisplayLine[]) {
    const rows: number[] = [];
    for (let i = 0; i < lines.length && i < MAX_LINES; i++) {
        if (lines[i].changed) rows.push(i);
    }
    return rows;
}

export function cacheKey(repository: Repository, commit: Commit) {
    return `${repository.id}:${commit.hash}:${commit.path}`;
}
