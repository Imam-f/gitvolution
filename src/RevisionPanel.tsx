import { memo, useEffect, useRef } from "react";
import type { UIEventHandler } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileCode2,
  GitCommitHorizontal,
  LoaderCircle,
} from "lucide-react";
import {
  buildRows,
  formatDate,
  highlight,
  languageFor,
  MAX_LINES,
  normalize,
  type DisplayLine,
} from "./code";
import type { Commit, Revision } from "./types";

interface Props {
  position: "previous" | "current" | "next";
  commit?: Commit;
  revision?: Revision;
  loading: boolean;
  hasFile: boolean;
  lines: DisplayLine[];
  showChanges: boolean;
  collapsed: boolean;
  collapseChanged: ReadonlySet<number>;
  expanded: ReadonlySet<number>;
  onExpand: (from: number) => void;
  jumpLine: number | null;
  jumpStamp: number;
  onScroll: UIEventHandler<HTMLDivElement>;
}

const Code = memo(function Code({
  lines,
  path,
  position,
  showChanges,
  collapsed,
  collapseChanged,
  expanded,
  onExpand,
  jumpLine,
  jumpStamp,
}: {
  lines: DisplayLine[];
  path: string;
  position: Props["position"];
  showChanges: boolean;
  collapsed: boolean;
  collapseChanged: ReadonlySet<number>;
  expanded: ReadonlySet<number>;
  onExpand: (from: number) => void;
  jumpLine: number | null;
  jumpStamp: number;
}) {
  const limited = lines.length > MAX_LINES;
  const displayLines = lines.slice(0, MAX_LINES);
  const kind = position === "previous" ? "removed" : "added";
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (jumpLine == null || !gridRef.current) return;
    const container = gridRef.current.parentElement;
    if (!container) return;
    const target = gridRef.current.querySelector(`[data-line="${jumpLine}"]`);
    if (!target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    container.scrollTop +=
      targetRect.top - containerRect.top - container.clientHeight * 0.25;
  }, [jumpLine, jumpStamp]);

  const changedAt = (i: number) => showChanges && displayLines[i].changed;
  const padAt = (i: number) => displayLines[i].number == null;
  const fullLineClass = (i: number) =>
    `${changedAt(i) ? kind : ""} ${padAt(i) ? "pad" : ""} ${jumpLine === i ? "jumped" : ""}`;

  if (!collapsed) {
    const html = highlight(
      displayLines.map((line) => line.text).join("\n"),
      path,
    );
    return (
      <>
        {limited && (
          <div className="preview-notice">
            Preview limited to the first {MAX_LINES.toLocaleString()} lines.
          </div>
        )}
        <div className="source-grid" ref={gridRef}>
          <div className="line-gutter" aria-hidden="true">
            {displayLines.map((line, i) => (
              <div data-line={i} className={fullLineClass(i)} key={i}>
                <span className="change-symbol">
                  {changedAt(i) ? (kind === "added" ? "+" : "-") : ""}
                </span>
                {line.number ?? ""}
              </div>
            ))}
          </div>
          <div className="source-body">
            <div className="line-highlights" aria-hidden="true">
              {displayLines.map((_, i) => (
                <div className={fullLineClass(i)} key={i} />
              ))}
            </div>
            <pre>
              <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          </div>
        </div>
      </>
    );
  }

  const changedSet = new Set<number>();
  displayLines.forEach((line, i) => {
    if (line.changed) changedSet.add(i);
  });
  if (collapseChanged.size === 0) {
    return (
      <div className="no-changes-note">No changed lines on this side.</div>
    );
  }

  const rows = buildRows(
    displayLines.map((line) => line.text),
    collapseChanged,
    true,
    expanded,
  );
  const collapsedLineClass = (i: number) =>
    `${changedSet.has(i) ? kind : ""} ${displayLines[i].number == null ? "pad" : ""} ${jumpLine === i ? "jumped" : ""}`;
  return (
    <>
      {limited && (
        <div className="preview-notice">
          Preview limited to the first {MAX_LINES.toLocaleString()} lines.
        </div>
      )}
      <div className="source-grid" ref={gridRef}>
        <div className="line-gutter" aria-hidden="true">
          {rows.map((row) =>
            row.kind === "gap" ? (
              <div className="gap-gutter" key={`gap-${row.from}`}>
                ···
              </div>
            ) : (
              <div
                data-line={row.line}
                className={collapsedLineClass(row.line)}
                key={`line-${row.line}`}
              >
                <span className="change-symbol">
                  {changedSet.has(row.line)
                    ? kind === "added"
                      ? "+"
                      : "-"
                    : ""}
                </span>
                {displayLines[row.line].number ?? ""}
              </div>
            ),
          )}
        </div>
        <div className="source-body">
          <div className="line-highlights" aria-hidden="true">
            {rows.map((row) =>
              row.kind === "gap" ? (
                <div className="gap-space" key={`gap-${row.from}`} />
              ) : (
                <div
                  className={collapsedLineClass(row.line)}
                  key={`line-${row.line}`}
                />
              ),
            )}
          </div>
          <pre className="collapsed-pre">
            <code>
              {rows.map((row) =>
                row.kind === "gap" ? (
                  <button
                    type="button"
                    className="gap-marker"
                    key={`gap-${row.from}`}
                    onClick={() => onExpand(row.from)}
                    title={`Show ${row.count} unchanged lines`}
                  >
                    <span>
                      ··· {row.count} unchanged line
                      {row.count === 1 ? "" : "s"} hidden
                    </span>
                    <span className="gap-action">click to show</span>
                  </button>
                ) : (
                  <span
                    className={`code-line ${jumpLine === row.line ? "jumped" : ""}`}
                    data-line={row.line}
                    key={`line-${row.line}`}
                    dangerouslySetInnerHTML={{
                      __html: highlight(row.text, path),
                    }}
                  />
                ),
              )}
            </code>
          </pre>
        </div>
      </div>
    </>
  );
});

export default function RevisionPanel({
  position,
  commit,
  revision,
  loading,
  hasFile,
  lines,
  showChanges,
  collapsed,
  collapseChanged,
  expanded,
  onExpand,
  jumpLine,
  jumpStamp,
  onScroll,
}: Props) {
  const current = position === "current";
  const title = current
    ? "Current commit"
    : position === "previous"
      ? "Previous commit"
      : "Next commit";
  let emptyTitle = "A little context goes a long way.";
  let emptyDescription = "Choose a file to explore its history.";
  if (hasFile && !commit) {
    emptyTitle = current
      ? "No committed history"
      : position === "previous"
        ? "The story starts here."
        : "You're up to date.";
    emptyDescription = current
      ? "This file has no commits on the current branch."
      : position === "previous"
        ? "There is no earlier revision of this file."
        : "There is no later revision of this file.";
  } else if (revision?.missing) {
    emptyTitle = "File not present";
    emptyDescription =
      "This file was deleted or does not exist in this commit.";
  } else if (revision?.binary) {
    emptyTitle = "Binary or non-UTF-8 file";
    emptyDescription = "This revision cannot be displayed as text.";
  } else if (revision?.truncated) {
    emptyTitle = "File too large to preview";
    emptyDescription =
      "Text previews are limited to 2 MiB to keep navigation responsive.";
  } else if (revision?.content === "") {
    emptyTitle = "An empty page.";
    emptyDescription = "This file exists, but has no content in this revision.";
  } else if (commit && !revision && !loading) {
    emptyTitle = "Preview unavailable";
    emptyDescription = "The revision could not be loaded. See the error above.";
  }
  return (
    <section
      className={`revision-panel ${current ? "is-current" : ""}`}
      aria-label={title}
    >
      <div className="panel-heading">
        <span className="panel-position">
          {position === "previous" ? (
            <ArrowLeft size={13} />
          ) : position === "next" ? (
            <ArrowRight size={13} />
          ) : (
            <span className="current-dot" />
          )}
          {title}
        </span>
        <span className="panel-offset">
          {current
            ? "YOU ARE HERE"
            : position === "previous"
              ? "T - 1"
              : "T + 1"}
        </span>
      </div>
      <div className="commit-card">
        <div className="commit-meta">
          <span className="commit-hash">
            <GitCommitHorizontal size={14} />
            {commit?.shortHash ?? "-------"}
          </span>
          <time title={commit?.date}>
            {commit ? formatDate(commit.date) : "No revision selected"}
          </time>
        </div>
        <h3 title={commit?.subject}>
          {commit?.subject || (hasFile ? "No revision" : "Waiting for a story")}
        </h3>
        <div className="commit-author">
          {commit ? (
            <>
              <span className="avatar">
                {commit.author.slice(0, 1).toUpperCase()}
              </span>
              <span title={commit.email}>{commit.author}</span>
              <span className="commit-status">
                {commit.status.startsWith("R")
                  ? "renamed"
                  : commit.status === "A"
                    ? "created"
                    : commit.status === "D"
                      ? "deleted"
                      : "modified"}
              </span>
            </>
          ) : (
            <span className="author-placeholder" />
          )}
        </div>
      </div>
      {commit && (
        <div className="revision-path" title={commit.path}>
          <FileCode2 size={12} />
          <span>{commit.path}</span>
        </div>
      )}
      <div
        className="code-scroll"
        onScroll={onScroll}
        data-position={position}
        tabIndex={0}
        aria-label={`${title} source code`}
      >
        {loading ? (
          <div className="panel-empty">
            <LoaderCircle className="spin" size={23} />
            <h4>Reading this moment...</h4>
          </div>
        ) : revision?.content ? (
          <Code
            lines={lines}
            path={commit!.path}
            position={position}
            showChanges={showChanges}
            collapsed={collapsed}
            collapseChanged={collapseChanged}
            expanded={expanded}
            onExpand={onExpand}
            jumpLine={jumpLine}
            jumpStamp={jumpStamp}
          />
        ) : (
          <div className="panel-empty">
            <GitCommitHorizontal size={30} strokeWidth={1.2} />
            <h4>{emptyTitle}</h4>
            <p>{emptyDescription}</p>
          </div>
        )}
      </div>
      <div className="panel-footer">
        <span>{commit ? languageFor(commit.path) : "source"}</span>
        <span>
          {revision?.content != null
            ? `${revision.content ? normalize(revision.content).replace(/\n$/, "").split("\n").length.toLocaleString() : 0} lines`
            : revision
              ? `${(revision.byteLength / 1024).toFixed(1)} KiB`
              : "--"}
          <span className="footer-separator">/</span>Read only
        </span>
      </div>
    </section>
  );
}
