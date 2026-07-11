const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edinburghLan", {
  runtime: () => ipcRenderer.invoke("lan:runtime"),
  startHost: (options) => ipcRenderer.invoke("lan:start-host", options),
  stopHost: () => ipcRenderer.invoke("lan:stop-host"),
  discoverHosts: (options) => ipcRenderer.invoke("lan:discover-hosts", options),
  openExternal: (url) => ipcRenderer.invoke("lan:open-external", url)
});

contextBridge.exposeInMainWorld("edinburghUpdates", {
  state: () => ipcRenderer.invoke("update:state"),
  check: () => ipcRenderer.invoke("update:check"),
  download: () => ipcRenderer.invoke("update:download"),
  install: () => ipcRenderer.invoke("update:install"),
  onStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  }
});
