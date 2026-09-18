export interface Repository {
    id: string;
    path: string;
    name: string;
    branch: string;
    head: string | null;
    files: string[];
}

export interface Commit {
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    email: string;
    date: string;
    path: string;
    status: string;
}

export interface RepositoryTimelineCommit {
    hash: string;
    shortHash: string;
    subject: string;
    date: string;
    changes: Array<{
        file: string;
        status: string;
    }>;
}

export interface Revision {
    content: string | null;
    binary: boolean;
    missing: boolean;
    truncated: boolean;
    byteLength: number;
}

export interface GitvolutionAPI {
    chooseRepository(): Promise<Repository | null>;
    openPath(path: string): Promise<Repository>;
    getTimeline(id: string): Promise<RepositoryTimelineCommit[]>;
    chooseFile(id: string): Promise<string | null>;
    getHistory(id: string, file: string): Promise<Commit[]>;
    getRevision(id: string, hash: string, file: string): Promise<Revision>;
    minimizeWindow(): Promise<void>;
    toggleMaximizeWindow(): Promise<boolean>;
    closeWindow(): Promise<void>;
}

export interface RecentRepository {
    path: string;
    name: string;
    branch: string;
}

export interface RecentFile {
    repoPath: string;
    repoName: string;
    branch: string;
    file: string;
}

declare global {
    interface Window {
        gitvolution?: GitvolutionAPI;
    }
}
