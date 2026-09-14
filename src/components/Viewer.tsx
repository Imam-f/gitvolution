import { FileCode2, PanelLeftOpen } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type {
    CSSProperties,
    PointerEvent as ReactPointerEvent,
    RefObject,
    UIEventHandler,
} from "react";
import RevisionPanel from "../RevisionPanel";
import type { DisplayLine } from "../code";
import type { Commit, Repository, Revision } from "../types";
import Timeline from "./Timeline";
import ViewerToolbar from "./ViewerToolbar";
import ZenHud from "./ZenHud";

const MIN_FRACTION = 0.2;
const SNAP_PX = 8;

function gridColumnsFor(splits: number[]) {
    return splits
        .flatMap((fraction, i) =>
            i === 0
                ? [`minmax(0, ${fraction}fr)`]
                : ["var(--divider)", `minmax(0, ${fraction}fr)`],
        )
        .join(" ");
}

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
    zen: boolean;
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
    onToggleZen: () => void;
    onExitZen: () => void;
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
    zen,
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
    onToggleZen,
    onExitZen,
}: Props) {
    const diff = viewMode === "diff";
    const fileName = selectedFile.split("/").at(-1);
    const fileDirectory = selectedFile.includes("/")
        ? selectedFile.slice(0, selectedFile.lastIndexOf("/"))
        : "";
    const positions = diff
        ? (["previous", "current"] as const)
        : (["previous", "current", "next"] as const);

    const [splits, setSplits] = useState<number[]>(() =>
        diff ? [1, 1.08] : [1, 1.08, 1],
    );
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const dragRef = useRef<{
        index: number;
        startX: number;
        startSplits: number[];
        currentSplits: number[];
        contentWidth: number;
        dividerWidth: number;
    } | null>(null);

    useEffect(() => {
        setSplits(diff ? [1, 1.08] : [1, 1.08, 1]);
        setDraggingIndex(null);
    }, [diff]);

    useEffect(() => {
        if (draggingIndex === null) return;
        function onMove(event: PointerEvent) {
            const drag = dragRef.current;
            const container = panels.current;
            if (!drag || !container) return;
            const count = drag.startSplits.length;
            const total = drag.startSplits.reduce(
                (sum, value) => sum + value,
                0,
            );
            const usableWidth =
                drag.contentWidth - drag.dividerWidth * (count - 1);
            const delta =
                ((event.clientX - drag.startX) * total) / usableWidth;
            const pair =
                drag.startSplits[drag.index] +
                drag.startSplits[drag.index + 1];
            const min = MIN_FRACTION * pair;
            let left = drag.startSplits[drag.index] + delta;
            left = Math.max(min, Math.min(pair - min, left));
            const snapThreshold = (SNAP_PX * total) / usableWidth;
            if (!event.shiftKey && Math.abs(left - pair / 2) < snapThreshold) {
                left = pair / 2;
            }
            const next = [...drag.startSplits];
            next[drag.index] = left;
            next[drag.index + 1] = pair - left;
            drag.currentSplits = next;
            container.style.gridTemplateColumns = gridColumnsFor(next);
        }
        function onEnd() {
            const finalSplits = dragRef.current?.currentSplits;
            dragRef.current = null;
            if (finalSplits) setSplits(finalSplits);
            setDraggingIndex(null);
        }
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onEnd);
        window.addEventListener("pointercancel", onEnd);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onEnd);
            window.removeEventListener("pointercancel", onEnd);
        };
    }, [draggingIndex, panels]);

    function startResize(
        event: ReactPointerEvent<HTMLDivElement>,
        index: number,
    ) {
        const container = panels.current;
        if (!container) return;
        event.preventDefault();
        const style = getComputedStyle(container);
        const contentWidth =
            container.getBoundingClientRect().width -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight);
        dragRef.current = {
            index,
            startX: event.clientX,
            startSplits: [...splits],
            currentSplits: [...splits],
            contentWidth,
            dividerWidth: (event.currentTarget as HTMLDivElement).offsetWidth,
        };
        setDraggingIndex(index);
    }

    const gridColumns = gridColumnsFor(splits);

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
                    onToggleZen={onToggleZen}
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
                className={`revision-panels ${diff ? "two-panel" : ""} ${
                    draggingIndex !== null ? "is-resizing" : ""
                }`}
                ref={panels}
                style={{ gridTemplateColumns: gridColumns } as CSSProperties}
            >
                {positions.map((position, i) => (
                    <Fragment key={position}>
                        {i > 0 && (
                            <div
                                className={`panel-divider ${
                                    draggingIndex === i - 1
                                        ? "is-dragging"
                                        : ""
                                }`}
                                onPointerDown={(event) =>
                                    startResize(event, i - 1)
                                }
                                role="separator"
                                aria-orientation="vertical"
                                aria-label="Resize panels"
                            />
                        )}
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
                    </Fragment>
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
            {zen && (
                <ZenHud
                    fileName={fileName ?? ""}
                    fileDirectory={fileDirectory}
                    repositoryName={repository?.name}
                    history={history}
                    current={current}
                    currentIndex={currentIndex}
                    playing={playing}
                    onNavigate={onNavigate}
                    onPlayingChange={onPlayingChange}
                    onExit={onExitZen}
                />
            )}
        </>
    );
}
