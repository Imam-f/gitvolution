import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { randomUUID } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  inspectRepository,
  getFileHistory,
  getFileRevision,
} from "./git-service.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const development = !app.isPackaged && process.argv.includes("--dev");
const rendererUrl = development
  ? "http://127.0.0.1:5173/"
  : pathToFileURL(join(directory, "../dist/index.html")).href;
let window;
let repository;
let choosingRepository = false;

function currentRepository(id) {
  if (!repository || repository.id !== id) {
    throw new Error(
      "This repository is no longer open. Please select it again.",
    );
  }
  return repository;
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (
      event.sender !== window?.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== rendererUrl
    ) {
      throw new Error("Untrusted request.");
    }
    try {
      return { ok: true, value: await callback(...args) };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      };
    }
  });
}

handle("repository:choose", async () => {
  if (choosingRepository) return null;
  choosingRepository = true;
  try {
    const result = await dialog.showOpenDialog(window, {
      title: "Open a Git repository",
      buttonLabel: "Open repository",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const info = await inspectRepository(result.filePaths[0]);
    repository = {
      ...info,
      id: randomUUID(),
      revisions: new Set(),
      tracked: new Set(info.files),
    };
    const { revisions, tracked, ...publicInfo } = repository;
    return publicInfo;
  } finally {
    choosingRepository = false;
  }
});

handle("file:choose", async (id) => {
  const repo = currentRepository(id);
  const result = await dialog.showOpenDialog(window, {
    title: "Select a tracked file",
    defaultPath: repo.path,
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  currentRepository(id);
  const file = relative(repo.path, result.filePaths[0]).split("\\").join("/");
  if (!repo.tracked.has(file))
    throw new Error("Select a Git-tracked file inside the open repository.");
  return file;
});

handle("file:history", async (id, file) => {
  const repo = currentRepository(id);
  if (typeof file !== "string" || !repo.tracked.has(file)) {
    throw new Error("Select a tracked file from this repository.");
  }
  const history = await getFileHistory(repo.path, file, repo.head);
  for (const commit of history)
    repo.revisions.add(`${commit.hash}:${commit.path}`);
  return history;
});

handle("file:revision", async (id, hash, file) => {
  const repo = currentRepository(id);
  if (
    typeof hash !== "string" ||
    typeof file !== "string" ||
    !repo.revisions.has(`${hash}:${file}`)
  ) {
    throw new Error("Select a revision from the file history.");
  }
  return getFileRevision(repo.path, hash, file);
});

function createWindow() {
  window = new BrowserWindow({
    title: "Gitvolution",
    width: 1536,
    height: 960,
    minWidth: 760,
    minHeight: 720,
    backgroundColor: "#101312",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(directory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.loadURL(rendererUrl);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
          ...(!app.isPackaged ? [{ role: "toggleDevTools" }] : []),
        ],
      },
      { role: "windowMenu" },
    ]),
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
