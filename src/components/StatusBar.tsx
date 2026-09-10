import { Code2, GitCommitHorizontal } from "lucide-react";
import type { Repository } from "../types";

interface Props {
    repository: Repository | null;
    loadingHistory: boolean;
    loadingRevisions: boolean;
}

export default function StatusBar({
    repository,
    loadingHistory,
    loadingRevisions,
}: Props) {
    return (
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
    );
}
