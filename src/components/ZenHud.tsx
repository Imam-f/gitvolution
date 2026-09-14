import { useEffect, useRef, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    FileCode2,
    Pause,
    Play,
    X,
} from "lucide-react";
import { formatDate } from "../code";
import type { Commit } from "../types";

interface Props {
    fileName: string;
    fileDirectory: string;
    repositoryName?: string;
    history: Commit[];
    current: Commit | undefined;
    currentIndex: number;
    playing: boolean;
    onNavigate: (index: number) => void;
    onPlayingChange: (playing: boolean) => void;
    onExit: () => void;
}

const IDLE_MS = 2400;

export default function ZenHud({
    fileName,
    fileDirectory,
    repositoryName,
    history,
    current,
    currentIndex,
    playing,
    onNavigate,
    onPlayingChange,
    onExit,
}: Props) {
    const [visible, setVisible] = useState(true);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        function wake() {
            setVisible(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setVisible(false), IDLE_MS);
        }
        wake();
        window.addEventListener("pointermove", wake);
        window.addEventListener("keydown", wake);
        return () => {
            window.removeEventListener("pointermove", wake);
            window.removeEventListener("keydown", wake);
            clearTimeout(timer.current);
        };
    }, []);

    const canStepBack = currentIndex > 0;
    const canStepForward = currentIndex < history.length - 1;

    return (
        <div className={`zen-hud ${visible ? "is-visible" : ""}`}>
            <div className="zen-hud-left">
                <FileCode2 size={15} />
                <span className="zen-dir" title={fileDirectory}>
                    {fileDirectory
                        ? `${fileDirectory} /`
                        : repositoryName
                          ? `${repositoryName} /`
                          : ""}
                </span>
                <strong title={fileName}>{fileName}</strong>
            </div>
            <div className="zen-hud-center">
                <button
                    className="icon-button"
                    onClick={() => onNavigate(currentIndex - 1)}
                    disabled={!history.length || !canStepBack}
                    aria-label="Previous commit"
                    title="Previous commit (←)"
                >
                    <ChevronLeft size={18} />
                </button>
                <button
                    className={`zen-play ${playing ? "playing" : ""}`}
                    disabled={history.length < 2}
                    onClick={() => {
                        if (!playing && currentIndex === history.length - 1) {
                            onNavigate(0);
                        }
                        onPlayingChange(!playing);
                    }}
                    aria-label={playing ? "Pause timeline" : "Play timeline"}
                    title={playing ? "Pause timeline" : "Play timeline"}
                >
                    {playing ? (
                        <Pause size={14} fill="currentColor" />
                    ) : (
                        <Play size={14} fill="currentColor" />
                    )}
                </button>
                <button
                    className="icon-button"
                    onClick={() => onNavigate(currentIndex + 1)}
                    disabled={!history.length || !canStepForward}
                    aria-label="Next commit"
                    title="Next commit (→)"
                >
                    <ChevronRight size={18} />
                </button>
                <span className="zen-commit" title={current?.subject}>
                    {current
                        ? `${current.shortHash} · ${current.subject}`
                        : "No history yet"}
                </span>
                <span className="zen-meta">
                    {current ? formatDate(current.date) : ""}
                </span>
            </div>
            <div className="zen-hud-right">
                <span className="zen-counter">
                    {String(currentIndex + 1).padStart(2, "0")} /{" "}
                    {String(history.length).padStart(2, "0")}
                </span>
                <span className="zen-legend" title="Removed and added lines">
                    <span className="legend-removed" />
                    <span className="legend-added" />
                </span>
                <button
                    className="icon-button"
                    onClick={onExit}
                    aria-label="Exit focus mode"
                    title="Exit focus mode (Esc)"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
