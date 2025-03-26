// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example'
| 'delivery-detected'
| 'parse-images'
| 'load-logs'
| 'export-csv'
| 'journal-updated'
| 'files-dropped'
| 'reset-delivery-data';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    parseImages: (files: string[]) => ipcRenderer.invoke('parse-images', files),
    loadLogs: () => ipcRenderer.invoke('load-logs'),
    exportCsv: (rows: any) => ipcRenderer.invoke('export-csv', rows),
    onJournalUpdate: (callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => ipcRenderer.on('journal-updated', callback),
    onFileDrop: (callback: (arg0: any) => void) => ipcRenderer.on('files-dropped', (event, paths) => callback(paths)),
    sendFiles: (files: File[]) => {
      const filePaths = Array.from(files).map(f => f.path).filter(p => !!p && p !== 'N/A');
      ipcRenderer.send('files-dropped', filePaths);
    },
    resetDeliveryData: () => ipcRenderer.invoke('reset-delivery-data')
  },
};

// 👇 Handle OS-level file drops securely
// window.addEventListener('dragover', (e) => e.preventDefault());
// window.addEventListener('drop', (e) => {
//   e.preventDefault();

//   const files = [...(e.dataTransfer?.files || [])].map((file) => ({
//     name: file.name,
//     path: file.path,
//     size: file.size,
//     type: file.type,
//   }));

//   console.log('[preload] Drop files:', files.map(f => f.path));

//   const valid = files.filter((f) => f.path && f.path !== 'N/A');

//   console.log('[preload] Valid drop files:', valid.map(f => f.path));

//   if (valid.length > 0) {
//     ipcRenderer.send('files-dropped', valid.map(f => f.path));
//   }
// });

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
