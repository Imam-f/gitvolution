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

export interface Revision {
  content: string | null;
  binary: boolean;
  missing: boolean;
  truncated: boolean;
  byteLength: number;
}

export interface GitvolutionAPI {
  chooseRepository(): Promise<Repository | null>;
  chooseFile(id: string): Promise<string | null>;
  getHistory(id: string, file: string): Promise<Commit[]>;
  getRevision(id: string, hash: string, file: string): Promise<Revision>;
}

declare global {
  interface Window {
    gitvolution?: GitvolutionAPI;
  }
}
