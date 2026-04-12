/// <reference types="vite/client" />

interface ElectronAPI {
  openFile: (filePath: string) => Promise<unknown>;
  saveFile: (filePath: string, format: string) => Promise<unknown>;
  exportFile: (filePath: string, format: string) => Promise<unknown>;
  invoke: <TRes = unknown>(channel: string, ...args: unknown[]) => Promise<import('../shared/ipc/payloads').IPCResponse<TRes>>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
