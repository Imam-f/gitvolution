import {
    GitCommitHorizontal,
    History,
    LoaderCircle,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { formatDate } from "../code";
import type { Repository, RepositoryTimelineCommit } from "../types";

interface Props {
    repository: Repository;
    commits: RepositoryTimelineCommit[];
    loading: boolean;
    onSelectFile: (file: string) => void;
}

const ZOOM_LEVELS = [0.7, 0.85, 1, 1.25, 1.5];
const DEFAULT_ZOOM_INDEX = 2;

export default function RepositoryTimeline({
    repository,
    commits,
    loading,
    onSelectFile,
}: Props) {
    const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
    const zoom = ZOOM_LEVELS[zoomIndex];
    const newestFirst = commits.slice().reverse();
    const lastChanged = new Map<string, number>();
    commits.forEach((commit, index) => {
        for (const change of commit.changes) {
            lastChanged.set(change.file, index);
        }
    });
    const files = repository.files.slice().sort((left, right) => {
        const activity =
            (lastChanged.get(right) ?? -1) - (lastChanged.get(left) ?? -1);
        return activity || left.localeCompare(right);
    });
    const fileRows = new Map(
        files.map((file, index) => [file, index + 2]),
    );
    const style = {
        "--repository-file-count": repository.files.length,
        "--repository-commit-count": newestFirst.length,
        "--repository-time-width": `${Math.round(118 * zoom)}px`,
        "--repository-file-height": `${Math.round(46 * zoom)}px`,
    } as CSSProperties;

    return (
        <section
            className="repository-timeline"
            aria-label="Repository file timeline"
        >
            <header className="repository-timeline-heading">
                <div>
                    <span className="eyebrow">
                        <History size={13} /> REPOSITORY TIMELINE
                    </span>
                    <h2>When every file changed</h2>
                </div>
                <div className="repository-timeline-actions">
                    <div
                        className="repository-zoom-controls"
                        role="group"
                        aria-label="Timeline zoom"
                    >
                        <button
                            onClick={() =>
                                setZoomIndex((value) => Math.max(0, value - 1))
                            }
                            disabled={zoomIndex === 0}
                            aria-label="Zoom timeline out"
                            title="Zoom timeline out"
                        >
                            <ZoomOut size={14} />
                        </button>
                        <button
                            className="repository-zoom-value"
                            onClick={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
                            disabled={zoomIndex === DEFAULT_ZOOM_INDEX}
                            aria-label="Reset timeline zoom"
                            title="Reset timeline zoom"
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            onClick={() =>
                                setZoomIndex((value) =>
                                    Math.min(ZOOM_LEVELS.length - 1, value + 1),
                                )
                            }
                            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                            aria-label="Zoom timeline in"
                            title="Zoom timeline in"
                        >
                            <ZoomIn size={14} />
                        </button>
                    </div>
                </div>
            </header>
            {loading ? (
                <div className="repository-timeline-state">
                    <LoaderCircle className="spin" size={18} />
                    Reading repository history...
                </div>
            ) : newestFirst.length === 0 ? (
                <div className="repository-timeline-state">
                    <GitCommitHorizontal size={18} />
                    No committed file changes yet.
                </div>
            ) : (
                <div className="repository-timeline-scroll">
                    <div className="repository-timeline-grid" style={style}>
                        <div className="repository-timeline-corner">FILES</div>
                        {newestFirst.map((commit, index) => (
                            <div
                                key={commit.hash}
                                className="repository-time-heading"
                                style={{ gridColumn: index + 2, gridRow: 1 }}
                                title={`${commit.subject} (${commit.shortHash})`}
                            >
                                <time dateTime={commit.date}>
                                    {formatDate(commit.date)}
                                </time>
                                <small>{commit.shortHash}</small>
                            </div>
                        ))}
                        {files.map((file, index) => {
                            const fileName = file.split("/").at(-1);
                            const directory = file.includes("/")
                                ? file.slice(0, file.lastIndexOf("/"))
                                : ".";
                            return (
                                <button
                                    key={file}
                                    className="repository-file-label"
                                    style={{ gridColumn: 1, gridRow: index + 2 }}
                                    onClick={() => onSelectFile(file)}
                                    title={`Open ${file}`}
                                >
                                    <strong>{fileName}</strong>
                                    <small>{directory}</small>
                                </button>
                            );
                        })}
                        {newestFirst.map((commit, index) => (
                            <div
                                key={`track:${commit.hash}`}
                                className="repository-time-track"
                                style={{
                                    gridColumn: index + 2,
                                    gridRow: `2 / ${files.length + 2}`,
                                }}
                            />
                        ))}
                        {files.map((file, index) => (
                            <div
                                key={`row:${file}`}
                                className="repository-file-row"
                                style={{
                                    gridColumn: "1 / -1",
                                    gridRow: index + 2,
                                }}
                            />
                        ))}
                        {newestFirst.map((commit, column) => (
                            <div
                                key={commit.hash}
                                className="repository-timeline-contents"
                            >
                                {commit.changes.map((change) => (
                                    <button
                                        key={change.file}
                                        className={`repository-change status-${change.status[0].toLowerCase()}`}
                                        style={{
                                            gridColumn: column + 2,
                                            gridRow: fileRows.get(change.file),
                                        }}
                                        onClick={() =>
                                            onSelectFile(change.file)
                                        }
                                        aria-label={`${change.file} changed on ${formatDate(commit.date)} in ${commit.subject}`}
                                        title={`${change.file}\n${commit.subject}\n${formatDate(commit.date)} · ${commit.shortHash}`}
                                    >
                                        <span />
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
