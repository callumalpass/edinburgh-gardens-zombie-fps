const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edinburghLan", {
  runtime: () => ipcRenderer.invoke("lan:runtime"),
  startHost: (options) => ipcRenderer.invoke("lan:start-host", options),
  stopHost: () => ipcRenderer.invoke("lan:stop-host"),
  discoverHosts: (options) => ipcRenderer.invoke("lan:discover-hosts", options),
  openExternal: (url) => ipcRenderer.invoke("lan:open-external", url)
});
