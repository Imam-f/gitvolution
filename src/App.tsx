import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type { CSSProperties, UIEvent } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  Code2,
  FileCode2,
  Files,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  History,
  Keyboard,
  Link2,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import RevisionPanel from "./RevisionPanel";
import { compare, formatDate } from "./code";
import type { Commit, Repository, Revision } from "./types";

const noMarks: number[] = [];
const emptyDiff = { removed: noMarks, added: noMarks, limited: false };
const api = window.gitvolution;

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function App() {
  const [repository, setRepository] = useState<Repository | null>(null);
  const [selectedFile, setSelectedFile] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [historyState, setHistoryState] = useState<{
    key: string;
    commits: Commit[];
  } | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [syncScroll, setSyncScroll] = useState(true);
  const [showChanges, setShowChanges] = useState(true);
  const [revisions, setRevisions] = useState<{
    key: string;
    values: (Revision | undefined)[];
    before: ReturnType<typeof compare>;
    after: ReturnType<typeof compare>;
  } | null>(null);
  const cache = useRef(new Map<string, Revision>());
  const panels = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const scrollOrigin = useRef<EventTarget | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const key =
    repository && selectedFile ? `${repository.id}:${selectedFile}` : "";
  const history = historyState?.key === key ? historyState.commits : [];
  const loadingHistory = Boolean(key && historyState?.key !== key);
  const currentIndex = Math.min(index, Math.max(0, history.length - 1));
  const current = history[currentIndex];
  const revisionKey = current ? `${key}:${current.hash}` : "";
  const loaded = revisions?.key === revisionKey ? revisions : null;
  const loadingRevisions = Boolean(revisionKey && !loaded);
  const filteredFiles =
    repository?.files.filter((file) =>
      file.toLowerCase().includes(deferredSearch.toLowerCase()),
    ) ?? [];

  async function openRepository() {
    if (!api) {
      setError(
        "Open the desktop app with npm start to access local Git repositories.",
      );
      return;
    }
    setOpening(true);
    setPlaying(false);
    setError("");
    try {
      const repo = await api.chooseRepository();
      if (!repo) return;
      setRepository(repo);
      setSelectedFile("");
      setHistoryState(null);
      setRevisions(null);
      setSearch("");
      setIndex(0);
      setSidebarOpen(true);
      cache.current.clear();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setOpening(false);
    }
  }

  function selectFile(file: string) {
    if (file === selectedFile) return;
    setSelectedFile(file);
    setIndex(0);
    setPlaying(false);
    setError("");
  }

  async function browseFile() {
    if (!api || !repository) return;
    const repoId = repository.id;
    try {
      const file = await api.chooseFile(repoId);
      if (file) selectFile(file);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  useEffect(() => {
    if (!api || !repository || !selectedFile) return;
    let canceled = false;
    api
      .getHistory(repository.id, selectedFile)
      .then((commits) => {
        if (canceled) return;
        startTransition(() => {
          setHistoryState({ key, commits });
          setIndex(Math.max(0, commits.length - 1));
        });
      })
      .catch((error) => {
        if (canceled) return;
        setHistoryState({ key, commits: [] });
        setError(errorMessage(error));
      });
    return () => {
      canceled = true;
    };
  }, [repository, selectedFile, key]);

  useEffect(() => {
    if (!api || !repository || !current || !historyState) return;
    let canceled = false;
    // Coalesce quick scrubbing so every pointer movement does not spawn Git processes.
    const timer = setTimeout(async () => {
      try {
        const commits = [
          historyState.commits[currentIndex - 1],
          current,
          historyState.commits[currentIndex + 1],
        ];
        const values = await Promise.all(
          commits.map(async (commit) => {
            if (!commit) return undefined;
            const cacheKey = `${repository.id}:${commit.hash}:${commit.path}`;
            const cached = cache.current.get(cacheKey);
            if (cached) return cached;
            const value = await api.getRevision(
              repository.id,
              commit.hash,
              commit.path,
            );
            if (!canceled) {
              cache.current.set(cacheKey, value);
              if (cache.current.size > 24)
                cache.current.delete(cache.current.keys().next().value!);
            }
            return value;
          }),
        );
        if (canceled) return;
        const content = (value: Revision | undefined) =>
          value?.missing ? "" : value?.content;
        setRevisions({
          key: revisionKey,
          values,
          before: compare(content(values[0]), content(values[1])),
          after: compare(content(values[1]), content(values[2])),
        });
      } catch (error) {
        if (canceled) return;
        setRevisions({
          key: revisionKey,
          values: [],
          before: emptyDiff,
          after: emptyDiff,
        });
        setError(errorMessage(error));
        setPlaying(false);
      }
    }, 90);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [repository, current, currentIndex, historyState, revisionKey]);

  useEffect(() => {
    if (!playing || loadingRevisions) return;
    if (currentIndex >= history.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((value) => value + 1), 1400);
    return () => clearTimeout(timer);
  }, [playing, currentIndex, history.length, loadingRevisions]);

  function navigate(nextIndex: number) {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(history.length - 1, nextIndex)));
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
      event.preventDefault();
      if (!opening) void openRepository();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
      event.preventDefault();
      setSidebarOpen(true);
      requestAnimationFrame(() => searchInput.current?.focus());
      return;
    }
    if (
      event.target instanceof HTMLElement &&
      (event.target.matches("input, textarea, select") ||
        event.target.isContentEditable)
    )
      return;
    if (event.altKey || event.ctrlKey || event.metaKey || !history.length)
      return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      navigate(currentIndex + (event.key === "ArrowLeft" ? -1 : 1));
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(scrollTimer.current);
    };
  }, []);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (!syncScroll || !panels.current) return;
    const source = event.currentTarget;
    if (scrollOrigin.current && scrollOrigin.current !== source) return;
    scrollOrigin.current = source;
    for (const target of panels.current.querySelectorAll<HTMLDivElement>(
      ".code-scroll",
    )) {
      if (target !== source) {
        target.scrollTop = source.scrollTop;
        target.scrollLeft = source.scrollLeft;
      }
    }
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      scrollOrigin.current = null;
    }, 100);
  }

  const percent =
    history.length > 1
      ? (currentIndex / (history.length - 1)) * 100
      : history.length
        ? 100
        : 0;
  const fileName = selectedFile.split("/").at(-1);
  const fileDirectory = selectedFile.includes("/")
    ? selectedFile.slice(0, selectedFile.lastIndexOf("/"))
    : "";

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(event) => event.preventDefault()}
          aria-label="Gitvolution"
        >
          <span className="brand-mark">
            <GitBranch size={21} strokeWidth={2.2} />
          </span>
          <span>
            gitvolution<span className="brand-period">.</span>
          </span>
        </a>
        <div className="header-divider" />
        <span className="app-tagline">Every file has a story.</span>
        <div className="header-right">
          <span className="local-badge">
            <span />
            LOCAL & PRIVATE
          </span>
          <button
            className="button repo-button"
            onClick={openRepository}
            disabled={opening}
          >
            <FolderOpen size={15} />
            {opening
              ? "Opening..."
              : repository
                ? "Switch repository"
                : "Open repository"}
            <kbd>Ctrl O</kbd>
          </button>
        </div>
      </header>

      <div className={`workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-label">
              <span>EXPLORER</span>
              <button
                className="icon-button"
                onClick={() => setSidebarOpen(false)}
                title="Hide file explorer"
                aria-label="Hide file explorer"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <button
              className="repository-card"
              onClick={openRepository}
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
            <div className="file-section-heading">
              <span>TRACKED FILES</span>
              <span className="count">{repository?.files.length ?? 0}</span>
              {repository && (
                <button
                  className="icon-button"
                  onClick={browseFile}
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a file..."
                aria-label="Find a file"
                disabled={!repository}
              />
              {search ? (
                <button
                  className="icon-button"
                  onClick={() => setSearch("")}
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
                  <p>{search ? "No matching files" : "No tracked files yet"}</p>
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
                    onClick={() => selectFile(file)}
                    title={file}
                    aria-current={file === selectedFile ? "true" : undefined}
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
                  Showing 300 of {filteredFiles.length.toLocaleString()} files.
                  Search to narrow the list.
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
        )}

        <main className="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={17} />
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {!selectedFile ? (
            <section className="welcome">
              <div className="welcome-topline">
                {!sidebarOpen && (
                  <button
                    className="icon-button"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="Show file explorer"
                  >
                    <PanelLeftOpen size={18} />
                  </button>
                )}
                <span>THE FILE HISTORY EXPLORER</span>
                <span className="welcome-version">v1.0</span>
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
                  onClick={
                    repository
                      ? () => {
                          setSidebarOpen(true);
                          requestAnimationFrame(() =>
                            searchInput.current?.focus(),
                          );
                        }
                      : openRepository
                  }
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
                    <span className="diagram-here">THE MOMENT YOU PICK</span>
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
          ) : (
            <>
              <div className="viewer-toolbar">
                <div className="file-breadcrumb">
                  {!sidebarOpen && (
                    <button
                      className="icon-button"
                      onClick={() => setSidebarOpen(true)}
                      aria-label="Show file explorer"
                    >
                      <PanelLeftOpen size={17} />
                    </button>
                  )}
                  <FileCode2 size={17} />
                  <span className="breadcrumb-directory" title={fileDirectory}>
                    {fileDirectory
                      ? `${fileDirectory} /`
                      : repository?.name
                        ? `${repository.name} /`
                        : ""}
                  </span>
                  <strong title={selectedFile}>{fileName}</strong>
                </div>
                <div className="viewer-options">
                  <button
                    className={`toolbar-toggle ${showChanges ? "active" : ""}`}
                    onClick={() => setShowChanges(!showChanges)}
                    aria-label="Changes"
                    aria-pressed={showChanges}
                    title="Highlight removed lines on the left and added lines in the current and next revisions"
                  >
                    <ArrowDownUp size={14} />
                    <span>Changes</span>
                    {showChanges && <Check size={12} />}
                  </button>
                  <button
                    className={`toolbar-toggle ${syncScroll ? "active" : ""}`}
                    onClick={() => setSyncScroll(!syncScroll)}
                    aria-label="Sync scroll"
                    aria-pressed={syncScroll}
                    title="Synchronize code scrolling"
                  >
                    <Link2 size={14} />
                    <span>Sync scroll</span>
                  </button>
                </div>
              </div>
              <div className="history-heading">
                <div>
                  <span className="eyebrow">FILE EVOLUTION</span>
                  <span className="history-count">
                    {loadingHistory
                      ? "Reading history..."
                      : `${history.length} ${history.length === 1 ? "commit" : "commits"}`}
                  </span>
                </div>
                <span className="diff-legend">
                  <span className="legend-removed" />
                  Removed
                  <span className="legend-added" />
                  Added
                  {(loaded?.before.limited || loaded?.after.limited) && (
                    <span title="Change highlighting was skipped for a large diff">
                      (large diff skipped)
                    </span>
                  )}
                </span>
              </div>
              <div className="revision-panels" ref={panels}>
                {(["previous", "current", "next"] as const).map(
                  (position, i) => (
                    <RevisionPanel
                      key={position}
                      position={position}
                      commit={history[currentIndex + i - 1]}
                      revision={loaded?.values[i]}
                      loading={
                        loadingHistory ||
                        (Boolean(history[currentIndex + i - 1]) &&
                          loadingRevisions)
                      }
                      hasFile={Boolean(selectedFile)}
                      marks={
                        i === 0
                          ? (loaded?.before.removed ?? noMarks)
                          : i === 1
                            ? (loaded?.before.added ?? noMarks)
                            : (loaded?.after.added ?? noMarks)
                      }
                      showChanges={showChanges}
                      onScroll={handleScroll}
                    />
                  ),
                )}
              </div>
              <section className="timeline" aria-label="File history timeline">
                <div className="timeline-top">
                  <div className="timeline-label">
                    <History size={15} />
                    <span>TIME TRAVEL</span>
                    <span className="timeline-subtitle">
                      Drag to explore this file's history
                    </span>
                  </div>
                  <div className="timeline-counter">
                    <span>
                      {history.length
                        ? String(currentIndex + 1).padStart(2, "0")
                        : "00"}
                    </span>
                    <span>/</span>
                    {String(history.length).padStart(2, "0")}
                    <span>commits</span>
                  </div>
                </div>
                <div className="timeline-main">
                  <div className="playback-controls">
                    <button
                      className="icon-button"
                      onClick={() => navigate(0)}
                      disabled={!history.length || currentIndex === 0}
                      title="First commit"
                      aria-label="First commit"
                    >
                      <ChevronsLeft size={17} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => navigate(currentIndex - 1)}
                      disabled={!history.length || currentIndex === 0}
                      title="Previous commit"
                      aria-label="Previous commit"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      className={`play-button ${playing ? "playing" : ""}`}
                      disabled={history.length < 2}
                      onClick={() => {
                        if (!playing && currentIndex === history.length - 1)
                          setIndex(0);
                        setPlaying(!playing);
                      }}
                      title={playing ? "Pause timeline" : "Play timeline"}
                      aria-label={playing ? "Pause timeline" : "Play timeline"}
                    >
                      {playing ? (
                        <Pause size={17} fill="currentColor" />
                      ) : (
                        <Play size={17} fill="currentColor" />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => navigate(currentIndex + 1)}
                      disabled={
                        !history.length || currentIndex === history.length - 1
                      }
                      title="Next commit"
                      aria-label="Next commit"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => navigate(history.length - 1)}
                      disabled={
                        !history.length || currentIndex === history.length - 1
                      }
                      title="Latest commit"
                      aria-label="Latest commit"
                    >
                      <ChevronsRight size={17} />
                    </button>
                  </div>
                  <div className="slider-section">
                    <div className="slider-caption">
                      <span>
                        {current
                          ? formatDate(current.date, true)
                          : "No history yet"}
                      </span>
                      <span>{current?.shortHash ?? "-------"}</span>
                    </div>
                    <div
                      className="slider-track"
                      style={{ "--progress": `${percent}%` } as CSSProperties}
                    >
                      <div className="slider-rail" />
                      <div className="slider-progress" />
                      <div className="slider-ticks">
                        {Array.from(
                          { length: Math.min(Math.max(history.length, 2), 60) },
                          (_, i) => (
                            <span key={i} />
                          ),
                        )}
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, history.length - 1)}
                        step={1}
                        value={currentIndex}
                        onChange={(event) =>
                          navigate(Number(event.target.value))
                        }
                        disabled={history.length < 2}
                        aria-label="Commit timeline"
                        aria-valuetext={
                          current
                            ? `Commit ${currentIndex + 1} of ${history.length}: ${current.subject}, ${formatDate(current.date)}`
                            : "No commits"
                        }
                      />
                    </div>
                    <div className="slider-dates">
                      <span>
                        {history[0]
                          ? formatDate(history[0].date)
                          : "First commit"}
                        <span className="date-label">THE BEGINNING</span>
                      </span>
                      <span>
                        {history.at(-1)
                          ? formatDate(history.at(-1)!.date)
                          : "Latest commit"}
                        <span className="date-label">MOST RECENT</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="timeline-bottom">
                  <span>
                    <GitBranch size={12} />
                    {repository?.branch}
                    <span className="subtle-dot" />
                    File changes only
                    <span className="subtle-dot" />
                    Follows renames
                  </span>
                  <span>
                    <Keyboard size={13} />
                    Use{" "}
                    <kbd>
                      <ArrowLeft size={10} />
                    </kbd>
                    <kbd>
                      <ArrowRight size={10} />
                    </kbd>{" "}
                    to step through commits
                  </span>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
      <footer className="status-bar">
        <span>
          <span className="status-dot" />
          {loadingHistory || loadingRevisions
            ? "Reading Git history"
            : repository
              ? "Connected to local repository"
              : "Ready to explore"}
          {repository && (
            <span className="status-path" title={repository.path}>
              {repository.path}
            </span>
          )}
        </span>
        <span>
          <Code2 size={12} />
          Built for the curious
          <span className="status-divider" />
          <GitCommitHorizontal size={13} />
          GITVOLUTION
        </span>
      </footer>
    </div>
  );
}
