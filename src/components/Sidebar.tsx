import {
    ChevronRight,
    FileCode2,
    Files,
    FolderGit2,
    FolderOpen,
    GitBranch,
    PanelLeftClose,
    Search,
    ShieldCheck,
    X,
} from "lucide-react";
import type { RefObject } from "react";
import type { RecentFile, RecentRepository, Repository } from "../types";

interface Props {
    repository: Repository | null;
    recent: RecentRepository[];
    currentRecentFiles: RecentFile[];
    selectedFile: string;
    search: string;
    filteredFiles: string[];
    opening: boolean;
    searchInput: RefObject<HTMLInputElement | null>;
    onClose: () => void;
    onOpenRepository: () => void;
    onOpenRepositoryPath: (path: string) => void;
    onRemoveRecent: (path: string) => void;
    onOpenRecentFile: (entry: RecentFile) => void;
    onBrowseFile: () => void;
    onSelectFile: (file: string) => void;
    onSearchChange: (value: string) => void;
}

export default function Sidebar({
    repository,
    recent,
    currentRecentFiles,
    selectedFile,
    search,
    filteredFiles,
    opening,
    searchInput,
    onClose,
    onOpenRepository,
    onOpenRepositoryPath,
    onRemoveRecent,
    onOpenRecentFile,
    onBrowseFile,
    onSelectFile,
    onSearchChange,
}: Props) {
    return (
        <aside className="sidebar">
            <div className="sidebar-label">
                <span>EXPLORER</span>
                <button
                    className="icon-button"
                    onClick={onClose}
                    title="Hide file explorer"
                    aria-label="Hide file explorer"
                >
                    <PanelLeftClose size={16} />
                </button>
            </div>
            <button
                className="repository-card"
                onClick={onOpenRepository}
                disabled={opening}
                title={repository?.path ?? "Open a Git repository"}
            >
                <span className="repo-icon">
                    <FolderGit2 size={20} />
                </span>
                <span className="repo-info">
                    <strong>{repository?.name ?? "Your repository"}</strong>
                    <span>
                        <GitBranch size={12} />
                        {repository?.branch ?? "No repository open"}
                    </span>
                </span>
                <ChevronRight size={15} />
            </button>
            {repository && currentRecentFiles.length > 0 && (
                <div className="recent-section">
                    <div className="file-section-heading">
                        <span>RECENT FILES</span>
                    </div>
                    {currentRecentFiles.map((entry) => (
                        <button
                            key={entry.file}
                            className={`recent-item ${entry.file === selectedFile ? "selected" : ""}`}
                            onClick={() => onOpenRecentFile(entry)}
                            disabled={opening}
                            title={`${entry.file} · ${entry.repoName}`}
                        >
                            <FileCode2 size={15} />
                            <span>
                                <strong>{entry.file.split("/").at(-1)}</strong>
                                <small>{entry.file}</small>
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {!repository && recent.length > 0 && (
                <div className="recent-section">
                    <div className="file-section-heading">
                        <span>RECENT</span>
                    </div>
                    {recent.map((entry) => (
                        <div key={entry.path} className="recent-item-wrap">
                            <button
                                className="recent-item"
                                onClick={() => onOpenRepositoryPath(entry.path)}
                                disabled={opening}
                                title={entry.path}
                            >
                                <FolderGit2 size={15} />
                                <span>
                                    <strong>{entry.name}</strong>
                                    <small>{entry.path}</small>
                                </span>
                            </button>
                            <button
                                className="recent-remove"
                                onClick={() => onRemoveRecent(entry.path)}
                                title="Remove from recents"
                                aria-label={`Remove ${entry.name} from recents`}
                            >
                                <X size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="file-section-heading">
                <span>TRACKED FILES</span>
                <span className="count">{repository?.files.length ?? 0}</span>
                {repository && (
                    <button
                        className="icon-button"
                        onClick={onBrowseFile}
                        title="Select a file from disk"
                        aria-label="Select a file from disk"
                    >
                        <FolderOpen size={14} />
                    </button>
                )}
            </div>
            <div className="search-field">
                <Search size={14} />
                <input
                    ref={searchInput}
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Find a file..."
                    aria-label="Find a file"
                    disabled={!repository}
                />
                {search ? (
                    <button
                        className="icon-button"
                        onClick={() => onSearchChange("")}
                        aria-label="Clear file search"
                    >
                        <X size={12} />
                    </button>
                ) : (
                    <kbd>Ctrl P</kbd>
                )}
            </div>
            <nav className="file-list" aria-label="Repository files">
                {!repository ? (
                    <div className="sidebar-empty">
                        <Files size={27} strokeWidth={1.2} />
                        <p>
                            A whole history.
                            <br />
                            One file at a time.
                        </p>
                        <span>Open a repository to get started.</span>
                    </div>
                ) : !filteredFiles.length ? (
                    <div className="sidebar-empty">
                        <Search size={24} strokeWidth={1.3} />
                        <p>
                            {search
                                ? "No matching files"
                                : "No tracked files yet"}
                        </p>
                        <span>
                            {search
                                ? "Try a different filename."
                                : "Add and commit a file in Git, then reopen this repository."}
                        </span>
                    </div>
                ) : (
                    filteredFiles.slice(0, 300).map((file) => (
                        <button
                            key={file}
                            className={`file-item ${file === selectedFile ? "selected" : ""}`}
                            onClick={() => onSelectFile(file)}
                            title={file}
                            aria-current={
                                file === selectedFile ? "true" : undefined
                            }
                        >
                            <FileCode2 size={15} />
                            <span>
                                <span className="file-name">
                                    {file.split("/").at(-1)}
                                </span>
                                {file.includes("/") && (
                                    <span className="file-directory">
                                        {file.slice(0, file.lastIndexOf("/"))}
                                    </span>
                                )}
                            </span>
                            {file === selectedFile && (
                                <span className="file-selected-dot" />
                            )}
                        </button>
                    ))
                )}
                {filteredFiles.length > 300 && (
                    <p className="file-list-note">
                        Showing 300 of {filteredFiles.length.toLocaleString()}{" "}
                        files. Search to narrow the list.
                    </p>
                )}
            </nav>
            <div className="sidebar-bottom">
                <div className="read-only-icon">
                    <ShieldCheck size={17} />
                </div>
                <div>
                    <strong>Look back. Leave no trace.</strong>
                    <p>Your working tree stays untouched.</p>
                </div>
            </div>
        </aside>
    );
}
