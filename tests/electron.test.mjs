import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import electronPath from "electron";
import { _electron } from "playwright";
import { expect } from "playwright/test";

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

test(
    "Electron repository selection, three-panel history, timeline, and edge states",
    { timeout: 120_000 },
    async (t) => {
        const temporary = await mkdtemp(join(tmpdir(), "gitvolution-e2e-"));
        t.after(() =>
            rm(temporary, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 100,
            }),
        );
        const repo = join(temporary, "example-repository");
        await mkdir(join(repo, "src"), { recursive: true });
        const gitEnv = Object.fromEntries(
            Object.entries(process.env).filter(
                ([key]) => !key.toUpperCase().startsWith("GIT_"),
            ),
        );
        async function git(...args) {
            const { stdout } = await exec(
                "git",
                [
                    "-c",
                    "user.name=Alex Morgan",
                    "-c",
                    "user.email=alex@example.invalid",
                    "-c",
                    "commit.gpgSign=false",
                    "-c",
                    "core.autocrlf=false",
                    "-c",
                    `core.hooksPath=${join(temporary, "no-hooks")}`,
                    ...args,
                ],
                {
                    cwd: repo,
                    windowsHide: true,
                    timeout: 30_000,
                    env: {
                        ...gitEnv,
                        GIT_CONFIG_NOSYSTEM: "1",
                        GIT_CONFIG_GLOBAL:
                            process.platform === "win32" ? "NUL" : "/dev/null",
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
            .replace(
                "  }, 0);\n}",
                "  }, 0);\n\n  return Math.round(subtotal * 100) / 100;\n}",
            );
        await writeFile(join(repo, "src/total.ts"), first);
        await writeFile(join(repo, "README.md"), "# Example repository\n");
        await writeFile(join(repo, "empty.txt"), "");
        await writeFile(join(repo, "image.bin"), Buffer.from([1, 0, 2, 3]));
        let day = 1;
        async function commit(subject) {
            await git("add", "--all");
            await git(
                "commit",
                "-m",
                subject,
                `--date=2026-08-${String(day++).padStart(2, "0")}T12:00:00Z`,
            );
        }
        await commit("Introduce the line item calculator");
        await writeFile(join(repo, "src/total.ts"), second);
        await commit("Handle an empty list of items");
        await rename(
            join(repo, "src/total.ts"),
            join(repo, "src/calculate-total.ts"),
        );
        await commit("Give the calculator a more descriptive name");
        await writeFile(join(repo, "src/calculate-total.ts"), final);
        await commit("Round the total to two decimal places");
        await writeFile(join(repo, "src/flux.txt"), "line one\nline two\n");
        await commit("Start flux file as text");
        await writeFile(join(repo, "src/flux.txt"), Buffer.from([1, 2, 0, 3]));
        await commit("Turn flux file binary");
        await writeFile(
            join(repo, "src/flux.txt"),
            "line zero\nline one\nline two\nline three\n",
        );
        await commit("Turn flux file back to text");
        await writeFile(join(repo, "new-file.txt"), "Not committed yet.\n");
        await git("add", "new-file.txt");
        const statusBefore = await git("status", "--porcelain=v1");

        const env = { ...process.env, NODE_ENV: "test" };
        delete env.ELECTRON_RUN_AS_NODE;
        const app = await _electron.launch({
            executablePath: electronPath,
            args: [root],
            env,
            timeout: 30_000,
        });
        t.after(() => app.close());
        const page = await app.firstWindow();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await expect(
            page.getByRole("heading", { name: /Good code takes time/ }),
        ).toBeVisible();
        assert.equal(
            await page.evaluate(() => typeof window.require),
            "undefined",
        );
        assert.equal(
            await page.evaluate(
                () => typeof window.gitvolution?.chooseRepository,
            ),
            "function",
        );

        const screenshotDirectory =
            process.env.GITVOLUTION_SCREENSHOT_DIR ??
            join(root, "test-results");
        await mkdir(screenshotDirectory, { recursive: true });
        await page.screenshot({
            path: join(screenshotDirectory, "gitvolution-welcome.png"),
        });
        await app.evaluate(({ dialog }, path) => {
            dialog.showOpenDialog = async () => ({
                canceled: false,
                filePaths: [path],
            });
        }, temporary);
        await page
            .getByRole("button", { name: "Open a Git repository" })
            .click();
        await expect(page.getByRole("alert")).toContainText(
            "Not a Git working-tree repository",
        );
        await page.getByRole("button", { name: "Dismiss error" }).click();

        await app.evaluate(({ dialog }, path) => {
            dialog.showOpenDialog = async () => ({
                canceled: false,
                filePaths: [path],
            });
        }, repo);
        await page
            .getByRole("button", { name: "Open a Git repository" })
            .click();
        await expect(page.locator(".repo-info strong")).toHaveText(
            "example-repository",
        );
        await expect(
            page.locator(".welcome-content .welcome-recent"),
        ).toContainText("example-repository");
        const repositoryTimeline = page.getByRole("region", {
            name: "Repository file timeline",
        });
        await expect(repositoryTimeline).toBeVisible();
        await expect(
            repositoryTimeline.locator(
                '.repository-file-label[title="Open src/calculate-total.ts"]',
            ),
        ).toBeVisible();
        await expect(repositoryTimeline.locator(".repository-change")).toHaveCount(
            10,
        );
        const timelineGrid = repositoryTimeline.locator(
            ".repository-timeline-grid",
        );
        await expect(timelineGrid).toHaveCSS(
            "--repository-time-width",
            "118px",
        );
        await repositoryTimeline
            .getByRole("button", { name: "Zoom timeline in" })
            .click();
        await expect(timelineGrid).toHaveCSS(
            "--repository-time-width",
            "148px",
        );
        await repositoryTimeline
            .getByRole("button", { name: "Reset timeline zoom" })
            .click();
        await repositoryTimeline.scrollIntoViewIfNeeded();
        await expect(
            repositoryTimeline.getByRole("group", { name: "Timeline zoom" }),
        ).toBeInViewport();
        await page.screenshot({
            path: join(screenshotDirectory, "gitvolution-timeline.png"),
        });
        await page
            .getByRole("textbox", { name: "Find a file" })
            .fill("calculate");
        await expect(page.locator(".file-item")).toHaveCount(1);
        await page.locator(".file-item").click();
        await page
            .getByRole("button", { name: "Back to repository overview" })
            .click();
        await expect(repositoryTimeline).toBeVisible();
        await page.locator(".file-item").click();
        // The default view is the two-panel change diff; use the three-panel evolution view.
        const evolutionButton = page.getByRole("button", {
            name: "Evolution",
            exact: true,
        });
        if ((await evolutionButton.getAttribute("aria-pressed")) !== "true")
            await evolutionButton.click();
        // The app starts collapsed; expand so the padded full-view alignment is asserted.
        const collapseButton = page.getByRole("button", {
            name: "Collapse unchanged lines",
        });
        if ((await collapseButton.getAttribute("aria-pressed")) === "true")
            await collapseButton.click();
        const previous = page.getByRole("region", {
            name: "Previous commit",
            exact: true,
        });
        const current = page.getByRole("region", {
            name: "Current commit",
            exact: true,
        });
        const next = page.getByRole("region", {
            name: "Next commit",
            exact: true,
        });
        await expect(current.locator("code")).toContainText("Math.round");
        await expect(page.locator(".history-count")).toHaveText("4 commits");
        await expect(next).toContainText("You're up to date.");
        await expect(
            page.getByRole("button", { name: "Next commit", exact: true }),
        ).toBeDisabled();

        const slider = page.getByRole("slider", { name: "Commit timeline" });
        await slider.fill("1");
        await expect(current.locator("code")).toHaveText(second.trimEnd());
        await expect(next.locator("code")).toHaveText(second.trimEnd());
        // The three panels are padded so every unchanged line shares a row.
        const prevGutter = previous.locator(".line-gutter > div");
        const currGutter = current.locator(".line-gutter > div");
        const nextGutter = next.locator(".line-gutter > div");
        await expect(prevGutter).toHaveCount(13);
        await expect(currGutter).toHaveCount(13);
        await expect(nextGutter).toHaveCount(13);
        await expect(prevGutter.nth(6)).toHaveText("7");
        await expect(currGutter.nth(6)).toHaveText("7");
        await expect(nextGutter.nth(6)).toHaveText("7");
        await expect(prevGutter.nth(7)).toHaveText("");
        await expect(prevGutter.nth(8)).toHaveText("");
        // Padding cells get a distinct background so the missing lines are visible.
        await expect(prevGutter.nth(7)).toHaveCSS(
            "background-color",
            "rgb(35, 42, 36)",
        );
        await expect(currGutter.nth(7)).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)",
        );
        await expect(currGutter.nth(7)).toHaveText("+8");
        await expect(currGutter.nth(8)).toHaveText("+9");
        await expect(nextGutter.nth(7)).toHaveText("8");
        await expect(nextGutter.nth(8)).toHaveText("9");
        await expect(prevGutter.nth(9)).toHaveText("8");
        await expect(currGutter.nth(9)).toHaveText("10");
        await expect(nextGutter.nth(9)).toHaveText("10");
        await expect(current.locator(".revision-path")).toHaveText(
            "src/total.ts",
        );
        await expect(next.locator(".revision-path")).toHaveText(
            "src/calculate-total.ts",
        );
        await expect(current.locator(".line-highlights .added")).toHaveCount(2);
        await page.getByRole("button", { name: "Changes" }).click();
        await expect(current.locator(".line-highlights .added")).toHaveCount(0);
        await page.getByRole("button", { name: "Changes" }).click();
        await page.screenshot({
            path: join(screenshotDirectory, "gitvolution-desktop.png"),
        });

        // Collapse folds unchanged lines into expandable gaps, leaving changes plus context.
        await page
            .getByRole("button", { name: "Collapse unchanged lines" })
            .click();
        await expect(current.locator(".code-line")).toHaveCount(8);
        await expect(current.locator(".gap-marker")).toHaveCount(2);
        await expect(current.locator(".gap-marker").first()).toContainText(
            "4 unchanged lines",
        );
        await expect(page.locator(".jump-count")).toHaveText("1");

        // Jump walks between changes (hunks), not individual lines.
        await page.getByRole("button", { name: "Jump to next change" }).click();
        await expect(page.locator(".jump-count")).toHaveText("1 / 1");
        await expect(current.locator(".code-line.jumped")).toHaveCount(1);
        const jumpedInView = await current
            .locator(".code-line.jumped")
            .evaluate((element) => {
                const container = element.closest(".code-scroll");
                const elementRect = element.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                return (
                    elementRect.top >= containerRect.top - 1 &&
                    elementRect.bottom <= containerRect.bottom + 1
                );
            });
        assert.ok(
            jumpedInView,
            "the jumped change should be scrolled into view",
        );
        await page.keyboard.press("n");
        await expect(page.locator(".jump-count")).toHaveText("1 / 1");
        await page.keyboard.press("p");
        await expect(page.locator(".jump-count")).toHaveText("1 / 1");

        // Hidden gaps expand on click to reveal their lines again.
        await current.locator(".gap-marker").first().click();
        await expect(current.locator(".gap-marker")).toHaveCount(1);
        await expect(current.locator(".code-line")).toHaveCount(12);
        await page
            .getByRole("button", { name: "Collapse unchanged lines" })
            .click();
        await expect(current.locator(".code-line")).toHaveCount(0);
        await expect(page.locator(".jump-count")).toHaveText("1");

        // A button retains focus after a click; arrows must still navigate the timeline.
        await page
            .getByRole("button", { name: "Previous commit", exact: true })
            .click();
        await expect(slider).toHaveValue("0");
        await expect(previous).toContainText("The story starts here.");
        await page.keyboard.press("ArrowRight");
        await expect(slider).toHaveValue("1");
        await page.getByRole("button", { name: "Latest commit" }).click();
        await expect(slider).toHaveValue("3");
        // The latest commit has non-adjacent changes, so jump hops between hunks.
        await expect(page.locator(".jump-count")).toHaveText("2");
        await page.getByRole("button", { name: "Jump to next change" }).click();
        await expect(page.locator(".jump-count")).toHaveText("1 / 2");
        await page.getByRole("button", { name: "Jump to next change" }).click();
        await expect(page.locator(".jump-count")).toHaveText("2 / 2");
        await page.getByRole("button", { name: "Play timeline" }).click();
        await expect(slider).toHaveValue("0");
        await expect(slider).toHaveValue("1", { timeout: 10_000 });
        await page.getByRole("button", { name: "Pause timeline" }).click();

        await page.getByRole("button", { name: "Hide file explorer" }).click();
        await expect(
            page.getByRole("navigation", { name: "Repository files" }),
        ).toHaveCount(0);
        await page.getByRole("button", { name: "Show file explorer" }).click();
        await page.getByRole("textbox", { name: "Find a file" }).fill("");
        await page
            .locator(".file-item")
            .filter({ hasText: "empty.txt" })
            .click();
        await expect(current).toContainText("An empty page.");
        await expect(slider).toBeDisabled();
        await page
            .locator(".file-item")
            .filter({ hasText: "image.bin" })
            .click();
        await expect(current).toContainText("Binary or non-UTF-8 file");
        await page
            .locator(".file-item")
            .filter({ hasText: "new-file.txt" })
            .click();
        await expect(current).toContainText("No committed history");
        await expect(page.locator(".history-count")).toHaveText("0 commits");

        await app.evaluate(
            ({ dialog }, path) => {
                dialog.showOpenDialog = async () => ({
                    canceled: false,
                    filePaths: [path],
                });
            },
            join(repo, "src/calculate-total.ts"),
        );
        await page
            .getByRole("button", { name: "Select a file from disk" })
            .click();
        await expect(current.locator("code")).toContainText("Math.round");
        await slider.fill("1");
        await expect(current.locator("code")).toContainText(
            "if (!items.length)",
        );

        const commitCard = current.locator(".commit-card");
        await expect(commitCard).toHaveAttribute("aria-expanded", "false");
        await commitCard.click();
        await expect(commitCard).toHaveAttribute("aria-expanded", "true");
        await page.setViewportSize({ width: 760, height: 520 });
        const codeHeight = await current
            .locator(".code-scroll")
            .evaluate((element) => element.clientHeight);
        assert.ok(
            codeHeight >= 90,
            `Source viewport should remain usable, got ${codeHeight}px`,
        );
        await current.locator(".code-scroll").evaluate((element) => {
            element.scrollTop = 30;
        });
        await expect
            .poll(() =>
                previous
                    .locator(".code-scroll")
                    .evaluate((element) => Math.round(element.scrollTop)),
            )
            .toBe(30);
        await expect
            .poll(() =>
                next
                    .locator(".code-scroll")
                    .evaluate((element) => Math.round(element.scrollTop)),
            )
            .toBe(30);
        await page.getByRole("button", { name: "Sync scroll" }).click();
        await current.locator(".code-scroll").evaluate((element) => {
            element.scrollTop = 0;
        });
        assert.equal(
            await previous
                .locator(".code-scroll")
                .evaluate((element) => Math.round(element.scrollTop)),
            30,
        );
        await page.getByRole("button", { name: "Sync scroll" }).click();
        await page.screenshot({
            path: join(screenshotDirectory, "gitvolution-compact.png"),
        });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            true,
        );
        await page.screenshot({
            path: join(screenshotDirectory, "gitvolution-mobile.png"),
            fullPage: true,
        });
        await page.setViewportSize({ width: 1536, height: 900 });

        const unauthorized = await page.evaluate(async () => {
            try {
                await window.gitvolution.getRevision(
                    "not-an-open-repository",
                    "0".repeat(40),
                    "README.md",
                );
                return false;
            } catch {
                return true;
            }
        });
        assert.equal(unauthorized, true);
        await app.evaluate(({ dialog }) => {
            dialog.showOpenDialog = async () => ({
                canceled: true,
                filePaths: [],
            });
        });
        await page.getByRole("button", { name: "Switch repository" }).click();
        await expect(current.locator("code")).toHaveText(second.trimEnd());

        // Recent repositories persist across reloads and reopen in one click.
        await page.reload();
        await expect(
            page.getByRole("heading", { name: /Good code takes time/ }),
        ).toBeVisible();
        const recentButton = page
            .locator(".welcome-recent .recent-item")
            .first();
        await expect(recentButton).toContainText("example-repository");
        await recentButton.click();
        await expect(page.locator(".repo-info strong")).toHaveText(
            "example-repository",
        );

        // Recent files persist and reopen the last-explored file for the repo.
        const recentFileButton = page
            .locator(".recent-section .recent-item")
            .filter({ hasText: "calculate-total.ts" });
        await expect(recentFileButton).toHaveCount(1);
        await recentFileButton.click();
        await expect(current.locator("code")).toContainText("Math.round");
        await expect(page.locator(".file-breadcrumb strong")).toHaveText(
            "calculate-total.ts",
        );
        await expect(recentFileButton).toHaveClass(/selected/);

        // When the current revision is binary, the readable panels are still padded
        // so they stay aligned with each other.
        await page.getByRole("textbox", { name: "Find a file" }).fill("flux");
        await page
            .locator(".file-item")
            .filter({ hasText: "flux.txt" })
            .click();
        const fluxEvolutionButton = page.getByRole("button", {
            name: "Evolution",
            exact: true,
        });
        if ((await fluxEvolutionButton.getAttribute("aria-pressed")) !== "true")
            await fluxEvolutionButton.click();
        await slider.fill("1");
        await expect(current).toContainText("Binary or non-UTF-8 file");
        const fluxPrev = previous.locator(".line-gutter > div");
        const fluxNext = next.locator(".line-gutter > div");
        await expect(fluxPrev).toHaveCount(4);
        await expect(fluxNext).toHaveCount(4);
        await expect(fluxPrev.nth(0)).toHaveText("");
        await expect(fluxNext.nth(0)).toHaveText("+1");
        await expect(fluxPrev.nth(1)).toHaveText("1");
        await expect(fluxNext.nth(1)).toHaveText("2");
        await expect(fluxPrev.nth(2)).toHaveText("2");
        await expect(fluxNext.nth(2)).toHaveText("3");
        await expect(fluxPrev.nth(3)).toHaveText("");
        await expect(fluxNext.nth(3)).toHaveText("+4");

        assert.deepEqual(pageErrors, []);
        assert.equal(await git("status", "--porcelain=v1"), statusBefore);
    },
);
