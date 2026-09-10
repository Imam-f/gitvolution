import { FolderOpen, GitBranch } from "lucide-react";
import type { Repository } from "../types";

interface Props {
    repository: Repository | null;
    opening: boolean;
    onOpenRepository: () => void;
}

export default function AppHeader({
    repository,
    opening,
    onOpenRepository,
}: Props) {
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
