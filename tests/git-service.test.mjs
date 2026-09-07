import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  getFileHistory,
  getFileRevision,
  inspectRepository,
} from "../electron/git-service.mjs";

const execFileAsync = promisify(execFile);
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const author = "Fixture Author";
const email = "fixture@example.invalid";

async function git(cwd, args, extraEnv = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.toUpperCase().startsWith("GIT_"),
    ),
  );
  const { stdout } = await execFileAsync(
    "git",
    [
      "-c",
      `user.name=${author}`,
      "-c",
      `user.email=${email}`,
      "-c",
      "commit.gpgSign=false",
      "-c",
      "core.autocrlf=false",
      "-c",
      "core.safecrlf=false",
      "-c",
      `core.hooksPath=${join(cwd, "nonexistent-hooks")}`,
      ...args,
    ],
    {
      cwd,
      env: {
        ...env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
        ...extraEnv,
      },
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return stdout.replace(/\r?\n$/, "");
}

test("read-only Git service", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "gitvolution-git-service-"));
  t.after(() =>
    rm(temporary, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    }),
  );
  const repo = join(temporary, "repository with spaces \u03a9");
  await mkdir(join(repo, "src"), { recursive: true });
  await mkdir(join(repo, "docs"));
  await git(repo, [
    "init",
    "--template=",
    "--initial-branch=main",
    "--object-format=sha1",
  ]);

  let sequence = 0;
  async function commit(subject, directory = repo) {
    const date = new Date(Date.UTC(2024, 0, 1, 0, 0, sequence++)).toISOString();
    await git(directory, ["add", "--all"]);
    await git(directory, ["commit", "-m", subject], {
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    });
    return git(directory, ["rev-parse", "HEAD"]);
  }

  const original = "src/original name.txt";
  const renamed = "src/renamed [file].txt";
  const unicodePath = "docs/caf\u00e9 \u96ea.txt";
  const originalText = "first line\nsecond line\nthird line\nfourth line\n";
  const modifiedText = `${originalText}fifth line \u96ea\n`;
  const finalText = `${modifiedText}sixth line\n`;
  await writeFile(join(repo, original), originalText);
  await writeFile(join(repo, unicodePath), "\ufeffUnicode \u00e9 \u96ea\n");
  await writeFile(join(repo, "--help"), "an options-looking filename\n");
  await writeFile(join(repo, "src/renamed f.txt"), "a pathspec lookalike\n");
  await writeFile(join(repo, "unrelated.txt"), "unrelated\n");
  const initial = await commit("Initial files");
  await writeFile(join(repo, original), modifiedText);
  const modified = await commit("Edit original");
  await writeFile(join(repo, "unrelated.txt"), "unrelated edit\n");
  const unrelated = await commit("Unrelated change");
  await rename(join(repo, original), join(repo, renamed));
  const moved = await commit("Rename file");
  await writeFile(join(repo, renamed), finalText);
  const edited = await commit("Edit renamed file");
  await rm(join(repo, renamed));
  const deleted = await commit("Delete file");
  await writeFile(join(repo, renamed), "re-added file\n");
  const readded = await commit("Re-add file");

  const binaryBytes = Buffer.from([0x61, 0, 0x62, 0xff]);
  await writeFile(join(repo, "binary.dat"), binaryBytes);
  await writeFile(
    join(repo, "invalid-utf8.dat"),
    Buffer.from([0xff, 0xfe, 0xfd]),
  );
  await writeFile(join(repo, "empty.txt"), "");
  await writeFile(
    join(repo, "large.txt"),
    Buffer.alloc(MAX_CONTENT_BYTES + 1, 0x78),
  );
  await writeFile(
    join(repo, "large-binary.dat"),
    Buffer.alloc(MAX_CONTENT_BYTES + 73),
  );
  await writeFile(
    join(repo, "limit.txt"),
    Buffer.alloc(MAX_CONTENT_BYTES, 0x79),
  );
  const blobs = await commit("Add binary and large files");
  await writeFile(join(repo, "untracked.txt"), "not committed\n");
  await writeFile(join(repo, "staged.txt"), "not committed yet\n");
  await git(repo, ["add", "--", "staged.txt"]);

  const expectedFiles = [
    "--help",
    "binary.dat",
    "empty.txt",
    "invalid-utf8.dat",
    "large-binary.dat",
    "large.txt",
    "limit.txt",
    renamed,
    "src/renamed f.txt",
    "staged.txt",
    unicodePath,
    "unrelated.txt",
  ].sort();

  await t.test(
    "inspection resolves the root from nested directories and lists only tracked files",
    async () => {
      const result = await inspectRepository(join(repo, "src", "..", "docs"));
      assert.deepEqual(result, {
        path: await realpath(repo),
        name: basename(repo),
        branch: "main",
        head: blobs,
        files: expectedFiles,
      });
    },
  );

  await t.test(
    "history is oldest-first, skips unrelated commits, and follows renames across re-addition",
    async () => {
      const history = await getFileHistory(join(repo, "src"), renamed);
      assert.deepEqual(
        history.map((entry) => entry.hash),
        [initial, modified, moved, edited, deleted, readded],
      );
      assert.deepEqual(
        history.map((entry) => entry.path),
        [original, original, renamed, renamed, renamed, renamed],
      );
      assert.deepEqual(
        history.map((entry) => entry.status),
        ["A", "M", "R100", "M", "D", "A"],
      );
      assert.deepEqual(
        history.map((entry) => entry.subject),
        [
          "Initial files",
          "Edit original",
          "Rename file",
          "Edit renamed file",
          "Delete file",
          "Re-add file",
        ],
      );
      assert.ok(!history.some((entry) => entry.hash === unrelated));
      for (const entry of history) {
        assert.equal(entry.author, author);
        assert.equal(entry.email, email);
        assert.match(entry.date, /^2024-01-01T00:00:\d{2}(?:Z|\+00:00)$/);
        assert.ok(entry.hash.startsWith(entry.shortHash));
        assert.ok(entry.shortHash.length >= 7);
      }
      const revisions = await Promise.all(
        history.map((entry) => getFileRevision(repo, entry.hash, entry.path)),
      );
      assert.deepEqual(
        revisions.map((revision) => revision.content),
        [
          originalText,
          modifiedText,
          modifiedText,
          finalText,
          null,
          "re-added file\n",
        ],
      );
      assert.equal(revisions[4].missing, true);
    },
  );

  await t.test(
    "a pinned snapshot does not include later commits or follow a changed HEAD",
    async () => {
      const history = await getFileHistory(repo, original, modified);
      assert.deepEqual(
        history.map((entry) => entry.hash),
        [initial, modified],
      );
      assert.deepEqual(await getFileHistory(repo, original, null), []);
      await assert.rejects(
        getFileHistory(repo, original, "--all"),
        /Snapshot must be/,
      );
    },
  );

  await t.test(
    "missing and deleted paths return a missing revision rather than an error",
    async () => {
      const missing = {
        content: null,
        binary: false,
        missing: true,
        truncated: false,
        byteLength: 0,
      };
      assert.deepEqual(await getFileRevision(repo, deleted, renamed), missing);
      assert.deepEqual(await getFileRevision(repo, initial, renamed), missing);
      assert.deepEqual(await getFileRevision(repo, moved, original), missing);
      assert.deepEqual(
        await getFileRevision(repo, blobs, "never-existed.txt"),
        missing,
      );
    },
  );

  await t.test(
    "history follows multiple renames even when the final path is currently deleted",
    async () => {
      const directory = join(temporary, "deleted rename chain");
      await mkdir(directory);
      await git(directory, [
        "init",
        "--template=",
        "--initial-branch=main",
        "--object-format=sha1",
      ]);
      const paths = ["COMMIT", "middle name.txt", "--final [name].txt"];
      const hashes = [];
      await writeFile(join(directory, paths[0]), "unchanged file contents\n");
      hashes.push(await commit("Create file", directory));
      for (let index = 1; index < paths.length; index++) {
        await rename(
          join(directory, paths[index - 1]),
          join(directory, paths[index]),
        );
        hashes.push(await commit(`Rename ${index}`, directory));
      }
      await rm(join(directory, paths[2]));
      hashes.push(await commit("Delete final path", directory));
      assert.deepEqual((await inspectRepository(directory)).files, []);
      const history = await getFileHistory(directory, paths[2]);
      assert.deepEqual(
        history.map((entry) => entry.hash),
        hashes,
      );
      assert.deepEqual(
        history.map((entry) => entry.path),
        [...paths, paths[2]],
      );
      assert.deepEqual(
        history.map((entry) => entry.status),
        ["A", "R100", "R100", "D"],
      );
      for (const entry of history.slice(0, -1)) {
        assert.equal(
          (await getFileRevision(directory, entry.hash, entry.path)).content,
          "unchanged file contents\n",
        );
      }
      assert.equal(
        (await getFileRevision(directory, hashes[3], paths[2])).missing,
        true,
      );
    },
  );

  await t.test(
    "revisions read committed blobs rather than modified working-tree files",
    async () => {
      await writeFile(
        join(repo, renamed),
        "uncommitted working-tree contents\n",
      );
      assert.equal(
        (await getFileRevision(repo, readded, renamed)).content,
        "re-added file\n",
      );
      assert.equal(
        await readFile(join(repo, renamed), "utf8"),
        "uncommitted working-tree contents\n",
      );
    },
  );

  await t.test(
    "merge-resolution changes are included once with their committed content",
    async () => {
      const directory = join(temporary, "merge resolution");
      await mkdir(directory);
      await git(directory, [
        "init",
        "--template=",
        "--initial-branch=main",
        "--object-format=sha1",
      ]);
      await writeFile(join(directory, "file.txt"), "base\n");
      const base = await commit("Merge base", directory);
      await git(directory, ["switch", "-c", "feature"]);
      await writeFile(join(directory, "file.txt"), "feature\n");
      const feature = await commit("Feature edit", directory);
      await git(directory, ["switch", "main"]);
      await writeFile(join(directory, "file.txt"), "main\n");
      const main = await commit("Main edit", directory);
      await assert.rejects(
        git(directory, ["merge", "--no-commit", "--no-ff", "feature"]),
        (error) => error.code === 1,
      );
      await writeFile(join(directory, "file.txt"), "resolved\n");
      const merged = await commit("Resolve merge", directory);
      const history = await getFileHistory(directory, "file.txt");
      assert.equal(history.length, 4);
      assert.deepEqual(
        new Set(history.map((entry) => entry.hash)),
        new Set([base, feature, main, merged]),
      );
      assert.equal(history[0].hash, base);
      assert.equal(history.at(-1).hash, merged);
      assert.equal(history.at(-1).status, "M");
      assert.equal(
        (await getFileRevision(directory, merged, "file.txt")).content,
        "resolved\n",
      );
    },
  );

  await t.test(
    "binary detection suppresses NUL-containing and invalid UTF-8 content",
    async () => {
      assert.deepEqual(await getFileRevision(repo, blobs, "binary.dat"), {
        content: null,
        binary: true,
        missing: false,
        truncated: false,
        byteLength: binaryBytes.length,
      });
      assert.deepEqual(await getFileRevision(repo, blobs, "invalid-utf8.dat"), {
        content: null,
        binary: true,
        missing: false,
        truncated: false,
        byteLength: 3,
      });
    },
  );

  await t.test(
    "oversized blobs are bounded, report their full size, and have no displayed content",
    async () => {
      assert.deepEqual(await getFileRevision(repo, blobs, "large.txt"), {
        content: null,
        binary: false,
        missing: false,
        truncated: true,
        byteLength: MAX_CONTENT_BYTES + 1,
      });
      assert.deepEqual(await getFileRevision(repo, blobs, "large-binary.dat"), {
        content: null,
        binary: true,
        missing: false,
        truncated: true,
        byteLength: MAX_CONTENT_BYTES + 73,
      });
      const atLimit = await getFileRevision(repo, blobs, "limit.txt");
      assert.equal(atLimit.truncated, false);
      assert.equal(atLimit.binary, false);
      assert.equal(atLimit.byteLength, MAX_CONTENT_BYTES);
      assert.equal(atLimit.content, "y".repeat(MAX_CONTENT_BYTES));
    },
  );

  await t.test(
    "empty text, Unicode, BOMs, spaces, and option-looking filenames are preserved",
    async () => {
      assert.deepEqual(await getFileRevision(repo, blobs, "empty.txt"), {
        content: "",
        binary: false,
        missing: false,
        truncated: false,
        byteLength: 0,
      });
      const text = "\ufeffUnicode \u00e9 \u96ea\n";
      assert.deepEqual(
        await getFileRevision(repo, initial.toUpperCase(), unicodePath),
        {
          content: text,
          binary: false,
          missing: false,
          truncated: false,
          byteLength: Buffer.byteLength(text),
        },
      );
      assert.deepEqual(
        (await getFileHistory(repo, "--help")).map((entry) => entry.hash),
        [initial],
      );
      assert.equal(
        (await getFileRevision(repo, initial, "--help")).content,
        "an options-looking filename\n",
      );
      assert.equal(
        (await getFileHistory(repo, unicodePath))[0].path,
        unicodePath,
      );
    },
  );

  await t.test(
    "untracked files and literal pathspecs cannot select other files or inject options",
    async () => {
      for (const path of [
        "untracked.txt",
        "staged.txt",
        "missing.txt",
        "--all",
        ":(glob)**",
        "src/*.txt",
        ":(exclude)unrelated.txt",
      ]) {
        assert.deepEqual(await getFileHistory(repo, path), [], path);
        assert.equal(
          (await getFileRevision(repo, blobs, path)).missing,
          true,
          path,
        );
      }
      assert.deepEqual(
        (await getFileHistory(repo, "src/renamed f.txt")).map(
          (entry) => entry.hash,
        ),
        [initial],
      );
    },
  );

  await t.test(
    "unsafe paths and non-full hashes are rejected before running Git",
    async () => {
      const invalidPaths = [
        "",
        ".",
        "..",
        "../outside",
        "src/../outside",
        "/absolute",
        "C:/absolute",
        "C:relative",
        "C:\\absolute",
        "\\\\server\\share",
        "src\\file",
        "src//file",
        "src/./file",
        "src/",
        "file\0name",
        null,
        42,
      ];
      for (const path of invalidPaths) {
        await assert.rejects(
          getFileHistory(repo, path),
          /safe repository-relative path/,
        );
        await assert.rejects(
          getFileRevision(repo, initial, path),
          /safe repository-relative path/,
        );
      }
      for (const hash of [
        "HEAD",
        initial.slice(0, 7),
        "a".repeat(39),
        "a".repeat(41),
        "a".repeat(63),
        "a".repeat(65),
        "g".repeat(40),
        "--help",
        `${initial}:file`,
        `${initial}\n`,
        `${initial}\r`,
        `${initial}\u2028`,
        null,
      ]) {
        await assert.rejects(
          getFileRevision(repo, hash, renamed),
          /full 40-character SHA-1 or 64-character SHA-256/,
        );
      }
      await assert.rejects(
        getFileRevision(repo, "0".repeat(40), renamed),
        /Git cat-file failed/,
      );
      const blobHash = await git(repo, ["rev-parse", `${initial}:${original}`]);
      await assert.rejects(
        getFileRevision(repo, blobHash, original),
        /does not identify a Git commit/,
      );
      await assert.rejects(getFileRevision(repo, initial, "src"), /not a file/);
    },
  );

  await t.test(
    "unborn repositories include staged files but have no head or history",
    async () => {
      const unborn = join(temporary, "unborn");
      await mkdir(unborn);
      await git(unborn, [
        "init",
        "--template=",
        "--initial-branch=main",
        "--object-format=sha1",
      ]);
      await writeFile(join(unborn, "staged.txt"), "staged\n");
      await writeFile(join(unborn, "untracked.txt"), "untracked\n");
      await git(unborn, ["add", "--", "staged.txt"]);
      assert.deepEqual(await inspectRepository(unborn), {
        path: await realpath(unborn),
        name: "unborn",
        branch: "main",
        head: null,
        files: ["staged.txt"],
      });
      assert.deepEqual(await getFileHistory(unborn, "staged.txt"), []);
      assert.deepEqual(await getFileHistory(unborn, "untracked.txt"), []);
    },
  );

  await t.test("linked worktrees and detached HEADs are valid", async () => {
    const worktree = join(temporary, "linked worktree");
    await git(repo, ["worktree", "add", "--detach", worktree, blobs]);
    const result = await inspectRepository(join(worktree, "src"));
    assert.equal(result.path, await realpath(worktree));
    assert.equal(result.head, blobs);
    assert.equal(result.branch, "HEAD");
    assert.deepEqual(
      result.files,
      expectedFiles.filter((path) => path !== "staged.txt"),
    );
    assert.equal((await getFileHistory(worktree, renamed))[0].hash, initial);
    assert.equal(
      (await getFileRevision(join(worktree, "src"), initial, original)).content,
      originalText,
    );
  });

  await t.test(
    "bare repositories, non-repositories, and missing directories fail clearly",
    async () => {
      const bare = join(temporary, "bare.git");
      await mkdir(bare);
      await git(bare, [
        "init",
        "--bare",
        "--template=",
        "--object-format=sha1",
      ]);
      await assert.rejects(
        inspectRepository(bare),
        /Bare Git repositories are not supported/,
      );
      await assert.rejects(
        inspectRepository(temporary),
        /Not a Git working-tree repository/,
      );
      await assert.rejects(
        inspectRepository(join(temporary, "absent")),
        /Cannot access repository directory/,
      );
      await assert.rejects(inspectRepository(""), /non-empty path/);
    },
  );

  await t.test(
    "reads do not modify the index, HEAD, or working files and ignore inherited repo routing",
    async () => {
      const paths = [
        join(repo, ".git", "index"),
        join(repo, ".git", "HEAD"),
        join(repo, renamed),
      ];
      const before = await Promise.all(
        paths.map(async (path) => ({
          content: await readFile(path),
          mtime: (await stat(path)).mtimeMs,
        })),
      );
      const inherited = process.env.GIT_DIR;
      process.env.GIT_DIR = join(temporary, "bare.git");
      try {
        assert.equal((await inspectRepository(repo)).head, blobs);
        await getFileHistory(repo, renamed);
        await getFileRevision(repo, initial, original);
      } finally {
        if (inherited === undefined) delete process.env.GIT_DIR;
        else process.env.GIT_DIR = inherited;
      }
      const after = await Promise.all(
        paths.map(async (path) => ({
          content: await readFile(path),
          mtime: (await stat(path)).mtimeMs,
        })),
      );
      assert.deepEqual(after, before);
    },
  );

  await t.test(
    "SHA-256 repositories accept full hashes throughout the interface",
    async () => {
      const sha256 = join(temporary, "sha256");
      await mkdir(sha256);
      await git(sha256, [
        "init",
        "--template=",
        "--initial-branch=main",
        "--object-format=sha256",
      ]);
      await writeFile(join(sha256, "file.txt"), "SHA-256 content\n");
      const hash = await commit("SHA-256 commit", sha256);
      assert.equal(hash.length, 64);
      assert.equal((await inspectRepository(sha256)).head, hash);
      assert.equal((await getFileHistory(sha256, "file.txt"))[0].hash, hash);
      assert.equal(
        (await getFileRevision(sha256, hash, "file.txt")).content,
        "SHA-256 content\n",
      );
    },
  );

  await t.test(
    "POSIX-only colons, pathspec magic, tabs, and newlines survive parsing",
    {
      skip:
        process.platform === "win32"
          ? "Windows forbids these filenames"
          : false,
    },
    async () => {
      const unusual = join(temporary, "unusual\nrepository");
      await mkdir(unusual);
      await git(unusual, [
        "init",
        "--template=",
        "--initial-branch=main",
        "--object-format=sha1",
      ]);
      const oldPath = "old\nname\t.txt";
      const newPath = "new\nname\t.txt";
      const files = [
        "odd:colon.txt",
        ":(glob)*.txt",
        "\nCOMMIT",
        "COMMIT",
        oldPath,
      ];
      for (const path of files)
        await writeFile(join(unusual, path), `content of ${path}\n`);
      const first = await commit("Unusual paths", unusual);
      await rename(join(unusual, oldPath), join(unusual, newPath));
      const second = await commit("Rename unusual path", unusual);
      assert.equal(
        (await inspectRepository(unusual)).path,
        await realpath(unusual),
      );
      assert.deepEqual(
        (await inspectRepository(unusual)).files,
        [...files.filter((path) => path !== oldPath), newPath].sort(),
      );
      for (const path of files) {
        assert.equal(
          (await getFileRevision(unusual, first, path)).content,
          `content of ${path}\n`,
        );
        assert.equal((await getFileHistory(unusual, path))[0].path, path);
      }
      const history = await getFileHistory(unusual, newPath);
      assert.deepEqual(
        history.map((entry) => entry.hash),
        [first, second],
      );
      assert.deepEqual(
        history.map((entry) => entry.path),
        [oldPath, newPath],
      );
    },
  );
});
