const { contextBridge, ipcRenderer } = require("electron");

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

contextBridge.exposeInMainWorld("gitvolution", {
  chooseRepository: () => invoke("repository:choose"),
  openPath: (path) => invoke("repository:openPath", path),
  chooseFile: (id) => invoke("file:choose", id),
  getHistory: (id, file) => invoke("file:history", id, file),
  getRevision: (id, hash, file) => invoke("file:revision", id, hash, file),
});
