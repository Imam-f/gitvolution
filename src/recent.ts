import type { RecentFile, RecentRepository } from "./types";

const RECENT_KEY = "gitvolution.recent";
const RECENT_LIMIT = 5;
const RECENT_FILES_KEY = "gitvolution.recentFiles";
const RECENT_FILES_LIMIT = 30;

export function loadRecent(): RecentRepository[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (entry) =>
                    entry &&
                    typeof entry.path === "string" &&
                    typeof entry.name === "string",
            )
            .slice(0, RECENT_LIMIT);
    } catch {
        return [];
    }
}

export function saveRecent(list: RecentRepository[]) {
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
        // Storage is unavailable; recents remain available for this session only.
    }
}

export function loadRecentFiles(): RecentFile[] {
    try {
        const raw = localStorage.getItem(RECENT_FILES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (entry) =>
                    entry &&
                    typeof entry.repoPath === "string" &&
                    typeof entry.repoName === "string" &&
                    typeof entry.branch === "string" &&
                    typeof entry.file === "string",
            )
            .slice(0, RECENT_FILES_LIMIT);
    } catch {
        return [];
    }
}

export function saveRecentFiles(list: RecentFile[]) {
    try {
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(list));
    } catch {
        // Storage is unavailable; recents remain available for this session only.
    }
}

export { RECENT_FILES_LIMIT, RECENT_LIMIT };
