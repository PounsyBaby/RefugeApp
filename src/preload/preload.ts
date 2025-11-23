import { contextBridge, ipcRenderer } from 'electron';
import type { RendererApi } from '../shared/ipc';

const api: RendererApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => {
    const wrapped = (_event: unknown, ...rest: any[]) => listener(...rest);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
};

contextBridge.exposeInMainWorld('api', api);
