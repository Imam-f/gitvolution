import { useEffect, useState } from "react";
import {
    Focus,
    FolderOpen,
    Fullscreen,
    GitBranch,
    Minimize,
} from "lucide-react";
import type { Repository } from "../types";

interface Props {
    repository: Repository | null;
    opening: boolean;
    zen: boolean;
    onOpenRepository: () => void;
    onToggleZen: () => void;
}

export default function AppHeader({
    repository,
    opening,
    zen,
    onOpenRepository,
    onToggleZen,
}: Props) {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        function onChange() {
            setIsFullscreen(Boolean(document.fullscreenElement));
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === "F11") {
                event.preventDefault();
                toggleFullscreen();
            }
        }
        document.addEventListener("fullscreenchange", onChange);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("fullscreenchange", onChange);
            window.removeEventListener("keydown", onKey);
        };
    }, []);

    function toggleFullscreen() {
        if (document.fullscreenElement) {
            void document.exitFullscreen();
        } else if (document.documentElement.requestFullscreen) {
            void document.documentElement.requestFullscreen();
        }
    }

    return (
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
                    className={`header-icon-button ${zen ? "active" : ""}`}
                    onClick={onToggleZen}
                    aria-pressed={zen}
                    title={
                        zen
                            ? "Exit focus mode (Ctrl Shift F)"
                            : "Focus mode (Ctrl Shift F)"
                    }
                    aria-label="Focus mode"
                >
                    <Focus size={16} />
                </button>
                <button
                    className="header-icon-button"
                    onClick={toggleFullscreen}
                    aria-pressed={isFullscreen}
                    title={
                        isFullscreen
                            ? "Exit fullscreen (F11)"
                            : "Fullscreen (F11)"
                    }
                    aria-label="Fullscreen"
                >
                    {isFullscreen ? (
                        <Minimize size={16} />
                    ) : (
                        <Fullscreen size={16} />
                    )}
                </button>
                <button
                    className="button repo-button"
                    onClick={onOpenRepository}
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
    );
}
