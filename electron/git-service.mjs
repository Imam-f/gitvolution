import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const BINARY_SAMPLE_BYTES = 8192;
const HASH_PATTERN = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;

async function git(directory, args, options = {}) {
  // Do not let an inherited Git environment redirect operations to another repo.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.toUpperCase().startsWith("GIT_"),
    ),
  );
  Object.assign(env, {
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
  });

  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "--no-pager",
        "--literal-pathspecs",
        "-c",
        "core.fsmonitor=false",
        ...args,
      ],
      {
        cwd: directory,
        env,
        shell: false,
        windowsHide: true,
        encoding: "buffer",
        timeout: 30_000,
        killSignal: "SIGKILL",
        maxBuffer: options.maxBuffer ?? MAX_OUTPUT_BYTES,
      },
    );
    return stdout;
  } catch (error) {
    if (options.allowExitOne && error.code === 1) return null;
    if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      // execFile stops the process at the limit; only blob sampling permits this.
      if (options.allowBufferLimit && error.message.startsWith("stdout ")) {
        return error.stdout;
      }
      throw new Error("Git output exceeded the safety limit.", {
        cause: error,
      });
    }
    if (error.killed) {
      throw new Error("Git command timed out after 30 seconds.", {
        cause: error,
      });
    }
    const detail = (error.stderr?.toString("utf8") || error.message)
      .trim()
      .slice(0, 2000);
    throw new Error(`Git ${args[0]} failed: ${detail}`, { cause: error });
  }
}

function validateFilePath(filePath) {
  if (
    typeof filePath !== "string" ||
    !filePath ||
    filePath.includes("\0") ||
    filePath.includes("\\") ||
    filePath.startsWith("/") ||
    /^[a-zA-Z]:/.test(filePath) ||
    filePath
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(
      "File path must be a safe repository-relative path using forward slashes.",
    );
  }
}

async function repositoryRoot(directory) {
  if (typeof directory !== "string" || !directory || directory.includes("\0")) {
    throw new Error("Repository directory must be a non-empty path.");
  }
  const absolutePath = resolve(directory);
  let workingDirectory;
  try {
    workingDirectory = await realpath(absolutePath);
  } catch (error) {
    throw new Error(`Cannot access repository directory: ${absolutePath}`, {
      cause: error,
    });
  }

  let bare;
  try {
    bare = await git(workingDirectory, ["rev-parse", "--is-bare-repository"]);
  } catch (error) {
    throw new Error(
      `Not a Git working-tree repository: ${absolutePath}. ${error.message}`,
      {
        cause: error,
      },
    );
  }
  if (bare.toString("utf8").trim() === "true") {
    throw new Error(`Bare Git repositories are not supported: ${absolutePath}`);
  }

  try {
    const root = await git(workingDirectory, ["rev-parse", "--show-toplevel"]);
    // Remove only Git's terminator, not whitespace that belongs to the directory.
    return await realpath(
      resolve(workingDirectory, root.toString("utf8").replace(/\r?\n$/, "")),
    );
  } catch (error) {
    throw new Error(
      `Not a Git working-tree directory: ${absolutePath}. ${error.message}`,
      {
        cause: error,
      },
    );
  }
}

async function repositoryHead(directory) {
  const output = await git(
    directory,
    ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
    {
      allowExitOne: true,
    },
  );
  return output === null ? null : output.toString("utf8").trim();
}

/** Inspect the index of a non-bare working tree, including an unborn repository. */
export async function inspectRepository(directory) {
  const path = await repositoryRoot(directory);
  const [head, branch, tracked] = await Promise.all([
    repositoryHead(path),
    git(path, ["symbolic-ref", "--quiet", "HEAD"], { allowExitOne: true }),
    git(path, ["ls-files", "--cached", "--full-name", "-z"]),
  ]);
  return {
    path,
    name: basename(path) || path,
    branch:
      branch === null
        ? "HEAD"
        : branch
            .toString("utf8")
            .trim()
            .replace(/^refs\/heads\//, ""),
    head,
    files: [
      ...new Set(tracked.toString("utf8").split("\0").filter(Boolean)),
    ].sort(),
  };
}

/** Return Git's --follow history in ancestor-first order, with each revision's path. */
export async function getFileHistory(repositoryPath, filePath, snapshotHead) {
  validateFilePath(filePath);
  if (
    snapshotHead !== undefined &&
    snapshotHead !== null &&
    (typeof snapshotHead !== "string" || !HASH_PATTERN.test(snapshotHead))
  ) {
    throw new Error("Snapshot must be a full Git commit hash.");
  }
  const root = await repositoryRoot(repositoryPath);
  const head =
    snapshotHead === undefined ? await repositoryHead(root) : snapshotHead;
  if (head === null) return [];

  const output = await git(root, [
    "log",
    "--follow",
    "--find-renames",
    "--topo-order",
    "--root",
    "--no-color",
    "--no-decorate",
    "--no-show-signature",
    "--no-notes",
    "--no-ext-diff",
    "--no-textconv",
    "--diff-merges=first-parent",
    "--encoding=UTF-8",
    "--abbrev=7",
    "--format=%x00COMMIT%x00%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00",
    "--name-status",
    "-z",
    head,
    "--",
    filePath,
  ]);

  const tokens = output.toString("utf8").split("\0");
  const commits = [];
  let current = null;
  let historicalPath = filePath;
  for (let index = 0; index < tokens.length;) {
    // Newlines delimit the format from the diff, never the filenames themselves.
    const token = tokens[index++].replace(/^\r?\n/, "");
    if (!token) continue;
    if (token === "COMMIT") {
      const [hash, shortHash, subject, author, email, date] = tokens.slice(
        index,
        index + 6,
      );
      if (
        !HASH_PATTERN.test(hash ?? "") ||
        !date ||
        Number.isNaN(Date.parse(date))
      ) {
        throw new Error("Git returned an invalid history record.");
      }
      current = { hash, shortHash, subject, author, email, date };
      index += 6;
      continue;
    }
    if (!current || !/^(?:[ADMTUXB]|[RCM]\d+)$/.test(token)) {
      throw new Error("Git returned an invalid file status in history.");
    }
    const previousPath = tokens[index++];
    const renamed = token.startsWith("R") || token.startsWith("C");
    const revisionPath = renamed ? tokens[index++] : previousPath;
    if (previousPath === undefined || revisionPath === undefined) {
      throw new Error("Git returned an incomplete file status in history.");
    }
    if (revisionPath === historicalPath) {
      commits.push({ ...current, path: revisionPath, status: token });
      if (renamed) historicalPath = previousPath;
    }
  }
  return commits.reverse();
}

/** Read a committed blob without filters, external diff tools, or working-tree writes. */
export async function getFileRevision(repositoryPath, commitHash, filePath) {
  if (
    typeof commitHash !== "string" ||
    ![40, 64].includes(commitHash.length) ||
    !HASH_PATTERN.test(commitHash)
  ) {
    throw new Error(
      "Commit hash must be a full 40-character SHA-1 or 64-character SHA-256 hash.",
    );
  }
  validateFilePath(filePath);
  const root = await repositoryRoot(repositoryPath);
  const type = await git(root, ["cat-file", "-t", commitHash]);
  if (type.toString("utf8").trim() !== "commit") {
    throw new Error("The supplied hash does not identify a Git commit.");
  }

  const tree = await git(root, [
    "ls-tree",
    "--full-tree",
    "-z",
    commitHash,
    "--",
    filePath,
  ]);
  const entry = tree
    .toString("utf8")
    .split("\0")
    .find((record) => {
      const separator = record.indexOf("\t");
      return separator !== -1 && record.slice(separator + 1) === filePath;
    });
  if (!entry) {
    return {
      content: null,
      binary: false,
      missing: true,
      truncated: false,
      byteLength: 0,
    };
  }
  const [, objectType, objectHash] = entry
    .slice(0, entry.indexOf("\t"))
    .split(" ");
  if (objectType !== "blob") {
    throw new Error("The requested path is not a file in this revision.");
  }

  const size = await git(root, ["cat-file", "-s", objectHash]);
  const byteLength = Number(size.toString("utf8").trim());
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error("Git returned an invalid blob size.");
  }
  const truncated = byteLength > MAX_CONTENT_BYTES;
  const bytes = await git(root, ["cat-file", "blob", objectHash], {
    maxBuffer: truncated ? BINARY_SAMPLE_BYTES : MAX_CONTENT_BYTES,
    allowBufferLimit: truncated,
  });
  let binary = bytes.includes(0);
  let content = null;
  if (!binary) {
    try {
      // Streaming decode tolerates a sample ending halfway through a UTF-8 code point.
      const text = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes, {
        stream: truncated,
      });
      if (!truncated) content = text;
    } catch {
      binary = true;
    }
  }
  return { content, binary, missing: false, truncated, byteLength };
}
