import { memo } from "react";
import type { UIEventHandler } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileCode2,
  GitCommitHorizontal,
  LoaderCircle,
} from "lucide-react";
import { formatDate, highlight, languageFor, normalize } from "./code";
import type { Commit, Revision } from "./types";

interface Props {
  position: "previous" | "current" | "next";
  commit?: Commit;
  revision?: Revision;
  loading: boolean;
  hasFile: boolean;
  marks: number[];
  showChanges: boolean;
  onScroll: UIEventHandler<HTMLDivElement>;
}

const Code = memo(function Code({
  content,
  path,
  marks,
  position,
  showChanges,
}: {
  content: string;
  path: string;
  marks: number[];
  position: Props["position"];
  showChanges: boolean;
}) {
  const allLines = normalize(content).replace(/\n$/, "").split("\n");
  const lines = allLines.slice(0, 10_000);
  const html = highlight(lines.join("\n"), path);
  const changed = new Set(showChanges ? marks : []);
  const kind = position === "previous" ? "removed" : "added";
  return (
    <>
      {allLines.length > lines.length && (
        <div className="preview-notice">
          Preview limited to the first 10,000 lines.
        </div>
      )}
      <div className="source-grid">
        <div className="line-gutter" aria-hidden="true">
          {lines.map((_, i) => (
            <div className={changed.has(i) ? kind : ""} key={i}>
              <span className="change-symbol">
                {changed.has(i) ? (kind === "added" ? "+" : "-") : ""}
              </span>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="source-body">
          <div className="line-highlights" aria-hidden="true">
            {lines.map((_, i) => (
              <div className={changed.has(i) ? kind : ""} key={i} />
            ))}
          </div>
          <pre>
            <code dangerouslySetInnerHTML={{ __html: html }} />
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
  marks,
  showChanges,
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
            content={revision.content}
            path={commit!.path}
            marks={marks}
            position={position}
            showChanges={showChanges}
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
