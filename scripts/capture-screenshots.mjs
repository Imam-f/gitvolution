import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import electronPath from "electron";
import { _electron } from "playwright";

async function waitForRevision(page) {
  await page
    .locator(".code-scroll .code-content")
    .first()
    .waitFor({ state: "attached", timeout: 45_000 });
}

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "screenshots");

const temporary = await mkdtemp(join(tmpdir(), "gitvolution-shot-"));
const repo = join(temporary, "example-repository");
await mkdir(join(repo, "src"), { recursive: true });

const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith("GIT_")),
);
async function git(...args) {
  const { stdout } = await exec(
    "git",
    [
      "-c", "user.name=Alex Morgan",
      "-c", "user.email=alex@example.invalid",
      "-c", "commit.gpgSign=false",
      "-c", "core.autocrlf=false",
      "-c", `core.hooksPath=${join(temporary, "no-hooks")}`,
      ...args,
    ],
    {
      cwd: repo,
      windowsHide: true,
      timeout: 30_000,
      env: {
        ...gitEnv,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      },
    },
  );
  return stdout;
}

await git("init", "--template=", "--initial-branch=main");
const first = [
  "// A small utility, with a story to tell.",
  "export interface LineItem {",
  "  price: number;",
  "  quantity: number;",
  "}",
  "",
  "export function calculateTotal(items: LineItem[]) {",
  "  return items.reduce((total, item) => {",
  "    return total + item.price * item.quantity;",
  "  }, 0);",
  "}",
  "",
].join("\n");
const second = first.replace(
  "  return items.reduce",
  "  if (!items.length) return 0;\n\n  return items.reduce",
);
const final = second
  .replace("  return items.reduce", "  const subtotal = items.reduce")
  .replace("  }, 0);\n}", "  }, 0);\n\n  return Math.round(subtotal * 100) / 100;\n}");
await writeFile(join(repo, "src/total.ts"), first);
await writeFile(join(repo, "README.md"), "# Example repository\n");
await writeFile(join(repo, "empty.txt"), "");
await writeFile(join(repo, "image.bin"), Buffer.from([1, 0, 2, 3]));
let day = 1;
async function commit(subject) {
  await git("add", "--all");
  await git("commit", "-m", subject, `--date=2026-08-${String(day++).padStart(2, "0")}T12:00:00Z`);
}
await commit("Introduce the line item calculator");
await writeFile(join(repo, "src/total.ts"), second);
await commit("Handle an empty list of items");
await rename(join(repo, "src/total.ts"), join(repo, "src/calculate-total.ts"));
await commit("Give the calculator a more descriptive name");
await writeFile(join(repo, "src/calculate-total.ts"), final);
await commit("Round the total to two decimal places");

const env = { ...process.env, NODE_ENV: "test" };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  executablePath: electronPath,
  args: [root],
  env,
  timeout: 30_000,
});
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].setContentSize(1600, 900);
});
await page.setViewportSize({ width: 1600, height: 900 });
await mkdir(out, { recursive: true });

await page.getByRole("heading", { name: /Good code takes time/ }).waitFor();
await page.screenshot({ path: join(out, "welcome.png") });

await app.evaluate(({ dialog }, path) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
}, repo);
await page.getByRole("button", { name: "Open a Git repository" }).click();
await page.getByRole("textbox", { name: "Find a file" }).fill("calculate");
await page.locator(".file-item").click();

const evolution = page.getByRole("button", { name: "Evolution", exact: true });
if ((await evolution.getAttribute("aria-pressed")) !== "true") await evolution.click();
const collapse = page.getByRole("button", { name: "Collapse unchanged lines" });
if ((await collapse.getAttribute("aria-pressed")) === "true") await collapse.click();
await page.getByRole("slider", { name: "Commit timeline" }).fill("1");
await waitForRevision(page);
await page.screenshot({ path: join(out, "evolution.png") });

const diff = page.getByRole("button", { name: "Change", exact: true });
if ((await diff.getAttribute("aria-pressed")) !== "true") await diff.click();
await page.getByRole("slider", { name: "Commit timeline" }).fill("3");
await waitForRevision(page);
await page.screenshot({ path: join(out, "change.png") });

const evo = page.getByRole("button", { name: "Evolution", exact: true });
if ((await evo.getAttribute("aria-pressed")) !== "true") await evo.click();
await collapse.click();
await page.getByRole("slider", { name: "Commit timeline" }).fill("1");
await waitForRevision(page);
await page.screenshot({ path: join(out, "collapsed.png") });

await app.close();
await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
console.log("Captured screenshots to", out);
