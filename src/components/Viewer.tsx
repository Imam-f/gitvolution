import { FileCode2, PanelLeftOpen } from "lucide-react";
import type { RefObject, UIEventHandler } from "react";
import RevisionPanel from "../RevisionPanel";
import type { DisplayLine } from "../code";
import type { Commit, Repository, Revision } from "../types";
import Timeline from "./Timeline";
import ViewerToolbar from "./ViewerToolbar";

export interface LoadedRevisions {
    values: (Revision | undefined)[];
    columns: DisplayLine[][];
    limited: boolean;
}

interface Props {
    repository: Repository | null;
    selectedFile: string;
    sidebarOpen: boolean;
    history: Commit[];
    currentIndex: number;
    current: Commit | undefined;
    loadingHistory: boolean;
    loadingRevisions: boolean;
    loaded: LoadedRevisions | null;
    prevLines: DisplayLine[];
    currentLines: DisplayLine[];
    nextLines: DisplayLine[];
    viewMode: "compare" | "diff";
    showChanges: boolean;
    collapsed: boolean;
    syncScroll: boolean;
    expanded: ReadonlySet<number>;
    collapseChanged: ReadonlySet<number>;
    currentHunks: number[];
    changeIndex: number;
    jumpLine: number | null;
    jumpStamp: number;
    playing: boolean;
    panels: RefObject<HTMLDivElement | null>;
    onShowSidebar: () => void;
    onViewModeChange: (mode: "compare" | "diff") => void;
    onShowChangesChange: () => void;
    onCollapse: () => void;
    onJump: (step: 1 | -1) => void;
    onSyncScrollChange: () => void;
    onExpand: (from: number) => void;
    onScroll: UIEventHandler<HTMLDivElement>;
    onNavigate: (index: number) => void;
    onPlayingChange: (playing: boolean) => void;
}

export default function Viewer({
    repository,
    selectedFile,
    sidebarOpen,
    history,
    currentIndex,
    current,
    loadingHistory,
    loadingRevisions,
    loaded,
    prevLines,
    currentLines,
    nextLines,
    viewMode,
    showChanges,
    collapsed,
    syncScroll,
    expanded,
    collapseChanged,
    currentHunks,
    changeIndex,
    jumpLine,
    jumpStamp,
    playing,
    panels,
    onShowSidebar,
    onViewModeChange,
    onShowChangesChange,
    onCollapse,
    onJump,
    onSyncScrollChange,
    onExpand,
    onScroll,
    onNavigate,
    onPlayingChange,
}: Props) {
    const diff = viewMode === "diff";
    const fileName = selectedFile.split("/").at(-1);
    const fileDirectory = selectedFile.includes("/")
        ? selectedFile.slice(0, selectedFile.lastIndexOf("/"))
        : "";
    const positions = diff
        ? (["previous", "current"] as const)
        : (["previous", "current", "next"] as const);

    return (
        <>
            <div className="viewer-toolbar">
                <div className="file-breadcrumb">
                    {!sidebarOpen && (
                        <button
                            className="icon-button"
                            onClick={onShowSidebar}
                            aria-label="Show file explorer"
                        >
                            <PanelLeftOpen size={17} />
                        </button>
                    )}
                    <FileCode2 size={17} />
                    <span
                        className="breadcrumb-directory"
                        title={fileDirectory}
                    >
                        {fileDirectory
                            ? `${fileDirectory} /`
                            : repository?.name
                              ? `${repository.name} /`
                              : ""}
                    </span>
                    <strong title={selectedFile}>{fileName}</strong>
                </div>
                <ViewerToolbar
                    viewMode={viewMode}
                    showChanges={showChanges}
                    collapsed={collapsed}
                    syncScroll={syncScroll}
                    changeIndex={changeIndex}
                    currentHunks={currentHunks}
                    onViewModeChange={onViewModeChange}
                    onShowChangesChange={onShowChangesChange}
                    onCollapse={onCollapse}
                    onJump={onJump}
                    onSyncScrollChange={onSyncScrollChange}
                />
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
                    {loaded?.limited && (
                        <span title="Change highlighting was skipped for a large diff">
                            (large diff skipped)
                        </span>
                    )}
                </span>
            </div>
            <div
                className={`revision-panels ${diff ? "two-panel" : ""}`}
                ref={panels}
            >
                {positions.map((position, i) => (
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
                        lines={
                            i === 0
                                ? prevLines
                                : i === 1
                                  ? currentLines
                                  : nextLines
                        }
                        showChanges={showChanges}
                        collapsed={collapsed}
                        collapseChanged={collapseChanged}
                        expanded={expanded}
                        onExpand={onExpand}
                        jumpLine={i === 1 ? jumpLine : null}
                        jumpStamp={i === 1 ? jumpStamp : 0}
                        onScroll={onScroll}
                    />
                ))}
            </div>
            <Timeline
                repository={repository}
                history={history}
                current={current}
                currentIndex={currentIndex}
                playing={playing}
                onNavigate={onNavigate}
                onPlayingChange={onPlayingChange}
            />
        </>
    );
}
