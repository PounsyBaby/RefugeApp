import { contextBridge, ipcRenderer } from 'electron';

export type RendererApi = {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
};

const api: RendererApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => {
    const wrapped = (_event: unknown, ...rest: any[]) => listener(...rest);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
};

contextBridge.exposeInMainWorld('api', api);
