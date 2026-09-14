import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    FileCode2,
    FolderGit2,
    FolderOpen,
    History,
    LoaderCircle,
    PanelLeftOpen,
    ShieldCheck,
    X,
} from "lucide-react";
import type { RefObject } from "react";
import { version } from "../../package.json";
import type { RecentFile, RecentRepository, Repository } from "../types";

interface Props {
    repository: Repository | null;
    recent: RecentRepository[];
    currentRecentFiles: RecentFile[];
    opening: boolean;
    sidebarOpen: boolean;
    searchInput: RefObject<HTMLInputElement | null>;
    onOpenRepository: () => void;
    onOpenRepositoryPath: (path: string) => void;
    onRemoveRecent: (path: string) => void;
    onOpenRecentFile: (entry: RecentFile) => void;
    onShowSidebar: () => void;
}

export default function Welcome({
    repository,
    recent,
    currentRecentFiles,
    opening,
    sidebarOpen,
    searchInput,
    onOpenRepository,
    onOpenRepositoryPath,
    onRemoveRecent,
    onOpenRecentFile,
    onShowSidebar,
}: Props) {
    const focusFileSearch = () => {
        onShowSidebar();
        requestAnimationFrame(() => searchInput.current?.focus());
    };

    return (
        <section className="welcome">
            <div className="welcome-topline">
                {!sidebarOpen && (
                    <button
                        className="icon-button"
                        onClick={onShowSidebar}
                        aria-label="Show file explorer"
                    >
                        <PanelLeftOpen size={18} />
                    </button>
                )}
                <span>THE FILE HISTORY EXPLORER</span>
                <span className="welcome-version">v{version}</span>
            </div>
            <div className="welcome-content">
                <div className="eyebrow">
                    <span />A DIFFERENT PERSPECTIVE ON GIT
                </div>
                <h1>
                    Good code takes time.
                    <br />
                    <span>See how it got here.</span>
                </h1>
                <p className="welcome-description">
                    Move through a file's history, one commit at a time.
                    <br />
                    The before, the moment, and the after. All in one view.
                </p>
                <button
                    className="button primary-button"
                    onClick={repository ? focusFileSearch : onOpenRepository}
                    disabled={opening}
                >
                    {opening ? (
                        <LoaderCircle size={17} className="spin" />
                    ) : repository ? (
                        <FileCode2 size={17} />
                    ) : (
                        <FolderOpen size={17} />
                    )}
                    {repository
                        ? "Choose a file to explore"
                        : "Open a Git repository"}
                    <ArrowUpRight size={17} />
                </button>
                <div className="welcome-note">
                    <ShieldCheck size={13} />
                    No uploads. No checkouts. Just your local history.
                </div>
                {recent.length > 0 && (
                    <div className="welcome-recent">
                        <span className="eyebrow">RECENT REPOSITORIES</span>
                        {recent.map((entry) => (
                            <div key={entry.path} className="recent-item-wrap">
                                <button
                                    className="recent-item"
                                    onClick={() =>
                                        onOpenRepositoryPath(entry.path)
                                    }
                                    disabled={opening}
                                    title={entry.path}
                                >
                                    <FolderGit2 size={16} />
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
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {repository && currentRecentFiles.length > 0 && (
                    <div className="welcome-recent">
                        <span className="eyebrow">RECENT FILES</span>
                        {currentRecentFiles.map((entry) => (
                            <button
                                key={entry.file}
                                className="recent-item"
                                onClick={() => onOpenRecentFile(entry)}
                                disabled={opening}
                                title={`${entry.file} · ${entry.repoName}`}
                            >
                                <FileCode2 size={16} />
                                <span>
                                    <strong>
                                        {entry.file.split("/").at(-1)}
                                    </strong>
                                    <small>{entry.file}</small>
                                </span>
                                <ArrowUpRight size={14} />
                            </button>
                        ))}
                    </div>
                )}
                <div className="preview-diagram" aria-hidden="true">
                    <div className="diagram-card">
                        <span>
                            <ArrowLeft size={12} />
                            PREVIOUS
                        </span>
                        <div className="diagram-line w70" />
                        <div className="diagram-line w50" />
                        <div className="diagram-line faded w80" />
                        <div className="diagram-line w40" />
                    </div>
                    <div className="diagram-connector" />
                    <div className="diagram-card diagram-current">
                        <span>
                            <span className="current-dot" />
                            CURRENT
                        </span>
                        <div className="diagram-line w70" />
                        <div className="diagram-line mint w60" />
                        <div className="diagram-line mint w80" />
                        <div className="diagram-line w40" />
                        <span className="diagram-here">
                            THE MOMENT YOU PICK
                        </span>
                    </div>
                    <div className="diagram-connector" />
                    <div className="diagram-card">
                        <span>
                            NEXT
                            <ArrowRight size={12} />
                        </span>
                        <div className="diagram-line w70" />
                        <div className="diagram-line w60" />
                        <div className="diagram-line w80" />
                        <div className="diagram-line faded w50" />
                    </div>
                </div>
            </div>
            <div className="welcome-steps">
                <div>
                    <span>01</span>
                    <p>Open a repository</p>
                    <FolderGit2 size={17} />
                </div>
                <div>
                    <span>02</span>
                    <p>Pick a tracked file</p>
                    <FileCode2 size={17} />
                </div>
                <div>
                    <span>03</span>
                    <p>Travel through time</p>
                    <History size={17} />
                </div>
            </div>
        </section>
    );
}
