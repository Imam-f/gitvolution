import {
    ArrowDown,
    ArrowDownUp,
    ArrowUp,
    Check,
    Columns2,
    Columns3,
    Link2,
    Maximize2,
    Minimize2,
} from "lucide-react";

interface Props {
    viewMode: "compare" | "diff";
    showChanges: boolean;
    collapsed: boolean;
    syncScroll: boolean;
    changeIndex: number;
    currentHunks: number[];
    onViewModeChange: (mode: "compare" | "diff") => void;
    onShowChangesChange: () => void;
    onCollapse: () => void;
    onJump: (step: 1 | -1) => void;
    onSyncScrollChange: () => void;
    onToggleZen: () => void;
}

export default function ViewerToolbar({
    viewMode,
    showChanges,
    collapsed,
    syncScroll,
    changeIndex,
    currentHunks,
    onViewModeChange,
    onShowChangesChange,
    onCollapse,
    onJump,
    onSyncScrollChange,
    onToggleZen,
}: Props) {
    return (
        <div className="viewer-options">
            <div
                className="view-mode-switch"
                role="group"
                aria-label="View mode"
            >
                <button
                    className={viewMode === "compare" ? "active" : ""}
                    onClick={() => onViewModeChange("compare")}
                    aria-pressed={viewMode === "compare"}
                    title="Three panels: previous, current, and next revisions"
                >
                    <Columns3 size={14} />
                    <span>Evolution</span>
                </button>
                <button
                    className={viewMode === "diff" ? "active" : ""}
                    onClick={() => onViewModeChange("diff")}
                    aria-pressed={viewMode === "diff"}
                    title="Two panels: what this commit changed (previous vs current)"
                >
                    <Columns2 size={14} />
                    <span>Change</span>
                </button>
            </div>
            <button
                className={`toolbar-toggle ${showChanges ? "active" : ""}`}
                onClick={onShowChangesChange}
                aria-label="Changes"
                aria-pressed={showChanges}
                title="Highlight removed lines on the left and added lines in the current and next revisions"
            >
                <ArrowDownUp size={14} />
                <span>Changes</span>
                {showChanges && <Check size={12} />}
            </button>
            <button
                className={`toolbar-toggle ${collapsed ? "active" : ""}`}
                onClick={onCollapse}
                aria-label="Collapse unchanged lines"
                aria-pressed={collapsed}
                title="Collapse unchanged code so only changes and their context are shown"
            >
                <Minimize2 size={14} />
                <span>Collapse</span>
            </button>
            <div className="jump-controls" title="Jump between changes (N / P)">
                <button
                    className="icon-button"
                    onClick={() => onJump(-1)}
                    disabled={!currentHunks.length}
                    aria-label="Jump to previous change"
                    title="Jump to previous change (P)"
                >
                    <ArrowUp size={15} />
                </button>
                <span className="jump-count">
                    {currentHunks.length
                        ? changeIndex < 0
                            ? currentHunks.length
                            : `${changeIndex + 1} / ${currentHunks.length}`
                        : "0"}
                </span>
                <button
                    className="icon-button"
                    onClick={() => onJump(1)}
                    disabled={!currentHunks.length}
                    aria-label="Jump to next change"
                    title="Jump to next change (N)"
                >
                    <ArrowDown size={15} />
                </button>
            </div>
            <button
                className={`toolbar-toggle ${syncScroll ? "active" : ""}`}
                onClick={onSyncScrollChange}
                aria-label="Sync scroll"
                aria-pressed={syncScroll}
                title="Synchronize code scrolling"
            >
                <Link2 size={14} />
                <span>Sync scroll</span>
            </button>
            <button
                className="toolbar-toggle"
                onClick={onToggleZen}
                aria-label="Focus mode"
                title="Focus mode (Ctrl Shift F)"
            >
                <Maximize2 size={14} />
                <span>Focus</span>
            </button>
        </div>
    );
}
