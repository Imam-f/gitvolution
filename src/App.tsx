import {
    startTransition,
    useCallback,
    useDeferredValue,
    useEffect,
    useEffectEvent,
    useMemo,
    useRef,
    useState,
} from "react";
import type { UIEvent } from "react";
import { CircleAlert, X } from "lucide-react";
import {
    alignPair,
    alignPanels,
    unionChangedRows,
    type DisplayLine,
} from "./code";
import {
    cacheKey,
    changedRows,
    errorMessage,
    revisionContent,
} from "./app-utils";
import AppHeader from "./components/AppHeader";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import Viewer from "./components/Viewer";
import Welcome from "./components/Welcome";
import {
    loadRecent,
    loadRecentFiles,
    saveRecent,
    saveRecentFiles,
    RECENT_FILES_LIMIT,
    RECENT_LIMIT,
} from "./recent";
import type {
    Commit,
    RecentFile,
    RecentRepository,
    Repository,
    Revision,
} from "./types";

const noLines: DisplayLine[] = [];
const api = window.gitvolution;
const CACHE_LIMIT = 80;
const PRELOAD_RADIUS = 4;

export default function App() {
    const [repository, setRepository] = useState<Repository | null>(null);
    const [recent, setRecent] = useState<RecentRepository[]>(loadRecent);
    const [recentFiles, setRecentFiles] =
        useState<RecentFile[]>(loadRecentFiles);
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
    const [collapsed, setCollapsed] = useState(true);
    const [zen, setZen] = useState(false);
    const [viewMode, setViewMode] = useState<"compare" | "diff">("diff");
    const [expanded, setExpanded] = useState<ReadonlySet<number>>(
        new Set<number>(),
    );
    const [changeIndex, setChangeIndex] = useState(-1);
    const [jumpStamp, setJumpStamp] = useState(0);
    const [revisions, setRevisions] = useState<{
        key: string;
        values: (Revision | undefined)[];
        columns: DisplayLine[][];
        limited: boolean;
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
    const diff = viewMode === "diff";
    const pairColumns = useMemo(() => {
        if (!diff || !loaded) return null;
        return alignPair(
            revisionContent(loaded.values[0]),
            revisionContent(loaded.values[1]),
        );
    }, [diff, loaded]);
    const prevLines = pairColumns
        ? pairColumns.columns[0]
        : (loaded?.columns[0] ?? noLines);
    const currentLines = pairColumns
        ? pairColumns.columns[1]
        : (loaded?.columns[1] ?? noLines);
    const nextLines = diff ? noLines : (loaded?.columns[2] ?? noLines);
    const collapseChanged = useMemo(
        () =>
            unionChangedRows(
                diff
                    ? [prevLines, currentLines]
                    : [prevLines, currentLines, nextLines],
            ),
        [diff, prevLines, currentLines, nextLines],
    );
    const currentChanges = changedRows(currentLines);
    const currentHunks = currentChanges.reduce<number[]>((hunks, row, i) => {
        if (i === 0 || row !== currentChanges[i - 1] + 1) hunks.push(row);
        return hunks;
    }, []);
    const jumpLine =
        changeIndex >= 0 && changeIndex < currentHunks.length
            ? currentHunks[changeIndex]
            : null;
    const filteredFiles =
        repository?.files.filter((file) =>
            file.toLowerCase().includes(deferredSearch.toLowerCase()),
        ) ?? [];
    const currentRecentFiles = repository
        ? recentFiles.filter((entry) => entry.repoPath === repository.path)
        : [];

    function addRecent(repo: Repository) {
        setRecent((previous) => {
            const next = [
                { path: repo.path, name: repo.name, branch: repo.branch },
                ...previous.filter((entry) => entry.path !== repo.path),
            ].slice(0, RECENT_LIMIT);
            saveRecent(next);
            return next;
        });
    }

    function removeRecent(path: string) {
        setRecent((previous) => {
            const next = previous.filter((entry) => entry.path !== path);
            saveRecent(next);
            return next;
        });
    }

    function addRecentFile(repo: Repository, file: string) {
        setRecentFiles((previous) => {
            const next = [
                {
                    repoPath: repo.path,
                    repoName: repo.name,
                    branch: repo.branch,
                    file,
                },
                ...previous.filter(
                    (entry) =>
                        entry.repoPath !== repo.path || entry.file !== file,
                ),
            ].slice(0, RECENT_FILES_LIMIT);
            saveRecentFiles(next);
            return next;
        });
    }

    function applyRepository(repo: Repository) {
        setRepository(repo);
        setSelectedFile("");
        setHistoryState(null);
        setRevisions(null);
        setSearch("");
        setIndex(0);
        setChangeIndex(-1);
        setSidebarOpen(true);
        cache.current.clear();
        addRecent(repo);
    }

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
            applyRepository(repo);
        } catch (error) {
            setError(errorMessage(error));
        } finally {
            setOpening(false);
        }
    }

    async function openRepositoryPath(path: string) {
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
            const repo = await api.openPath(path);
            if (!repo) return;
            applyRepository(repo);
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
        if (repository) addRecentFile(repository, file);
    }

    async function openRecentFile(entry: RecentFile) {
        if (!api) {
            setError(
                "Open the desktop app with npm start to access local Git repositories.",
            );
            return;
        }
        if (repository?.path === entry.repoPath) {
            selectFile(entry.file);
            return;
        }
        setOpening(true);
        setPlaying(false);
        setError("");
        try {
            const repo = await api.openPath(entry.repoPath);
            if (!repo) return;
            applyRepository(repo);
            selectFile(entry.file);
        } catch (error) {
            setError(errorMessage(error));
        } finally {
            setOpening(false);
        }
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
        api.getHistory(repository.id, selectedFile)
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
        const commits = [
            historyState.commits[currentIndex - 1],
            current,
            historyState.commits[currentIndex + 1],
        ];
        const allCached = commits.every(
            (commit) =>
                !commit || cache.current.has(cacheKey(repository, commit)),
        );
        const delay = allCached ? 0 : 90;
        const timer = setTimeout(async () => {
            try {
                const values = await Promise.all(
                    commits.map(async (commit) => {
                        if (!commit) return undefined;
                        const revisionCacheKey = cacheKey(repository, commit);
                        const cached = cache.current.get(revisionCacheKey);
                        if (cached) return cached;
                        const value = await api.getRevision(
                            repository.id,
                            commit.hash,
                            commit.path,
                        );
                        if (!canceled) {
                            cache.current.set(revisionCacheKey, value);
                            if (cache.current.size > CACHE_LIMIT) {
                                cache.current.delete(
                                    cache.current.keys().next().value!,
                                );
                            }
                        }
                        return value;
                    }),
                );
                if (canceled) return;
                const aligned = alignPanels(
                    revisionContent(values[0]),
                    revisionContent(values[1]),
                    revisionContent(values[2]),
                );
                setRevisions({
                    key: revisionKey,
                    values,
                    columns: aligned.columns,
                    limited: aligned.limited,
                });
            } catch (error) {
                if (canceled) return;
                setRevisions({
                    key: revisionKey,
                    values: [],
                    columns: [noLines, noLines, noLines],
                    limited: false,
                });
                setError(errorMessage(error));
                setPlaying(false);
            }
        }, delay);
        return () => {
            canceled = true;
            clearTimeout(timer);
        };
    }, [repository, current, currentIndex, historyState, revisionKey]);

    useEffect(() => {
        if (!api || !repository || !historyState) return;
        if (historyState.key !== key) return;
        let canceled = false;
        const timer = setTimeout(async () => {
            const commits = historyState.commits;
            const start = Math.max(0, currentIndex - PRELOAD_RADIUS);
            const end = Math.min(
                commits.length - 1,
                currentIndex + PRELOAD_RADIUS,
            );
            for (let i = start; i <= end; i++) {
                if (canceled) return;
                const commit = commits[i];
                if (!commit) continue;
                const preloadKey = cacheKey(repository, commit);
                if (cache.current.has(preloadKey)) continue;
                try {
                    const value = await api.getRevision(
                        repository.id,
                        commit.hash,
                        commit.path,
                    );
                    if (canceled) return;
                    cache.current.set(preloadKey, value);
                    if (cache.current.size > CACHE_LIMIT) {
                        cache.current.delete(
                            cache.current.keys().next().value!,
                        );
                    }
                } catch {
                    // Prefetching is best-effort; failures surface on the active commit.
                }
            }
        }, 220);
        return () => {
            canceled = true;
            clearTimeout(timer);
        };
    }, [repository, key, historyState, currentIndex]);

    useEffect(() => {
        if (!playing || loadingRevisions) return;
        if (currentIndex >= history.length - 1) {
            setPlaying(false);
            return;
        }
        const timer = setTimeout(() => setIndex((value) => value + 1), 1400);
        return () => clearTimeout(timer);
    }, [playing, currentIndex, history.length, loadingRevisions]);

    useEffect(() => {
        setChangeIndex(-1);
        setExpanded(new Set<number>());
    }, [revisionKey, viewMode, collapsed]);

    const expandGap = useCallback((from: number) => {
        setExpanded((previous) => new Set(previous).add(from));
    }, []);

    function navigate(nextIndex: number) {
        setPlaying(false);
        setIndex(Math.max(0, Math.min(history.length - 1, nextIndex)));
    }

    function jumpToChange(step: 1 | -1) {
        if (!currentHunks.length) return;
        const next =
            changeIndex < 0
                ? step === 1
                    ? 0
                    : currentHunks.length - 1
                : (changeIndex + step + currentHunks.length) %
                  currentHunks.length;
        setChangeIndex(next);
        setJumpStamp((stamp) => stamp + 1);
    }

    function toggleCollapse() {
        const next = !collapsed;
        setCollapsed(next);
        if (next) setShowChanges(true);
        setChangeIndex(-1);
    }

    const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "o"
        ) {
            event.preventDefault();
            if (!opening) void openRepository();
            return;
        }
        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "p"
        ) {
            event.preventDefault();
            setSidebarOpen(true);
            requestAnimationFrame(() => searchInput.current?.focus());
            return;
        }
        if (
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === "f"
        ) {
            event.preventDefault();
            setZen((value) => !value);
            return;
        }
        if (event.key === "Escape" && zen) {
            event.preventDefault();
            setZen(false);
            return;
        }
        if (
            event.target instanceof HTMLElement &&
            (event.target.matches("input, textarea, select") ||
                event.target.isContentEditable)
        ) {
            return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey || !history.length)
            return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            navigate(currentIndex + (event.key === "ArrowLeft" ? -1 : 1));
            return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            if (!currentHunks.length) return;
            event.preventDefault();
            jumpToChange(event.key === "ArrowDown" ? 1 : -1);
            return;
        }
        if (event.key === "n" || event.key === "N") {
            if (!currentHunks.length) return;
            event.preventDefault();
            jumpToChange(1);
        } else if (event.key === "p" || event.key === "P") {
            if (!currentHunks.length) return;
            event.preventDefault();
            jumpToChange(-1);
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

    return (
        <div className={`app-shell ${zen ? "zen" : ""}`}>
            <AppHeader
                repository={repository}
                opening={opening}
                zen={zen}
                onOpenRepository={openRepository}
                onToggleZen={() => setZen((value) => !value)}
            />
            <div
                className={`workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}
            >
                {sidebarOpen && (
                    <Sidebar
                        repository={repository}
                        recent={recent}
                        currentRecentFiles={currentRecentFiles}
                        selectedFile={selectedFile}
                        search={search}
                        filteredFiles={filteredFiles}
                        opening={opening}
                        searchInput={searchInput}
                        onClose={() => setSidebarOpen(false)}
                        onOpenRepository={openRepository}
                        onOpenRepositoryPath={openRepositoryPath}
                        onRemoveRecent={removeRecent}
                        onOpenRecentFile={openRecentFile}
                        onBrowseFile={browseFile}
                        onSelectFile={selectFile}
                        onSearchChange={setSearch}
                    />
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
                        <Welcome
                            repository={repository}
                            recent={recent}
                            currentRecentFiles={currentRecentFiles}
                            opening={opening}
                            sidebarOpen={sidebarOpen}
                            searchInput={searchInput}
                            onOpenRepository={openRepository}
                            onOpenRepositoryPath={openRepositoryPath}
                            onRemoveRecent={removeRecent}
                            onOpenRecentFile={openRecentFile}
                            onShowSidebar={() => setSidebarOpen(true)}
                        />
                    ) : (
                        <Viewer
                            repository={repository}
                            selectedFile={selectedFile}
                            sidebarOpen={sidebarOpen}
                            history={history}
                            currentIndex={currentIndex}
                            current={current}
                            loadingHistory={loadingHistory}
                            loadingRevisions={loadingRevisions}
                            loaded={loaded}
                            prevLines={prevLines}
                            currentLines={currentLines}
                            nextLines={nextLines}
                            viewMode={viewMode}
                            showChanges={showChanges}
                            collapsed={collapsed}
                            syncScroll={syncScroll}
                            expanded={expanded}
                            collapseChanged={collapseChanged}
                            currentHunks={currentHunks}
                            changeIndex={changeIndex}
                            jumpLine={jumpLine}
                            jumpStamp={jumpStamp}
                            playing={playing}
                            panels={panels}
                            zen={zen}
                            onShowSidebar={() => setSidebarOpen(true)}
                            onViewModeChange={setViewMode}
                            onShowChangesChange={() =>
                                setShowChanges(!showChanges)
                            }
                            onCollapse={toggleCollapse}
                            onJump={jumpToChange}
                            onSyncScrollChange={() =>
                                setSyncScroll(!syncScroll)
                            }
                            onExpand={expandGap}
                            onScroll={handleScroll}
                            onNavigate={navigate}
                            onPlayingChange={setPlaying}
                            onToggleZen={() => setZen((value) => !value)}
                            onExitZen={() => setZen(false)}
                        />
                    )}
                </main>
            </div>
            <StatusBar
                repository={repository}
                loadingHistory={loadingHistory}
                loadingRevisions={loadingRevisions}
            />
        </div>
    );
}
