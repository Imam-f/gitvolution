import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    GitBranch,
    History,
    Keyboard,
    Pause,
    Play,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { formatDate } from "../code";
import type { Commit, Repository } from "../types";

interface Props {
    repository: Repository | null;
    history: Commit[];
    current: Commit | undefined;
    currentIndex: number;
    playing: boolean;
    onNavigate: (index: number) => void;
    onPlayingChange: (playing: boolean) => void;
}

export default function Timeline({
    repository,
    history,
    current,
    currentIndex,
    playing,
    onNavigate,
    onPlayingChange,
}: Props) {
    const [collapsed, setCollapsed] = useState(false);
    const percent =
        history.length > 1
            ? (currentIndex / (history.length - 1)) * 100
            : history.length
              ? 100
              : 0;

    return (
        <section
            className={`timeline ${collapsed ? "collapsed" : ""}`}
            aria-label="File history timeline"
        >
            <div
                className="timeline-top"
                role="button"
                tabIndex={0}
                aria-expanded={!collapsed}
                title={collapsed ? "Expand timeline" : "Collapse timeline"}
                onClick={() => setCollapsed((value) => !value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setCollapsed((value) => !value);
                    }
                }}
            >
                <div className="timeline-label">
                    <History size={15} />
                    <span>TIME TRAVEL</span>
                    <span className="timeline-subtitle">
                        Drag to explore this file's history
                    </span>
                </div>
                <div className="timeline-controls">
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
                    <ChevronDown
                        className="timeline-chevron"
                        size={15}
                        aria-hidden="true"
                    />
                </div>
            </div>
            {!collapsed && (
                <>
                    <div className="timeline-main">
                        <div className="playback-controls">
                    <button
                        className="icon-button"
                        onClick={() => onNavigate(0)}
                        disabled={!history.length || currentIndex === 0}
                        title="First commit"
                        aria-label="First commit"
                    >
                        <ChevronsLeft size={17} />
                    </button>
                    <button
                        className="icon-button"
                        onClick={() => onNavigate(currentIndex - 1)}
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
                            if (
                                !playing &&
                                currentIndex === history.length - 1
                            ) {
                                onNavigate(0);
                            }
                            onPlayingChange(!playing);
                        }}
                        title={playing ? "Pause timeline" : "Play timeline"}
                        aria-label={
                            playing ? "Pause timeline" : "Play timeline"
                        }
                    >
                        {playing ? (
                            <Pause size={17} fill="currentColor" />
                        ) : (
                            <Play size={17} fill="currentColor" />
                        )}
                    </button>
                    <button
                        className="icon-button"
                        onClick={() => onNavigate(currentIndex + 1)}
                        disabled={
                            !history.length ||
                            currentIndex === history.length - 1
                        }
                        title="Next commit"
                        aria-label="Next commit"
                    >
                        <ChevronRight size={20} />
                    </button>
                    <button
                        className="icon-button"
                        onClick={() => onNavigate(history.length - 1)}
                        disabled={
                            !history.length ||
                            currentIndex === history.length - 1
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
                                {
                                    length: Math.min(
                                        Math.max(history.length, 2),
                                        60,
                                    ),
                                },
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
                                onNavigate(Number(event.target.value))
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
                    to step commits
                    <span className="subtle-dot" />
                    <kbd>
                        <ArrowUp size={10} />
                    </kbd>
                    <kbd>
                        <ArrowDown size={10} />
                    </kbd>{" "}
                    jump changes
                </span>
            </div>
                </>
            )}
        </section>
    );
}
