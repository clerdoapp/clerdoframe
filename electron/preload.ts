import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clerdo', {
  open: () => ipcRenderer.invoke('file:open'),
  launchFile: () => ipcRenderer.invoke('file:launch'),
  save: (path: string | null, name: string, data: Uint8Array, ext: string) => ipcRenderer.invoke('file:save', path, name, data, ext),
  newWindow: () => ipcRenderer.send('window:new'),
  setPresenting: (on: boolean) => ipcRenderer.send('window:present', on),
});
