import { contextBridge, ipcRenderer } from 'electron';
import { ALL_IPC_CHANNELS } from '../shared/ipc/channels';
import type { IPCChannel, IPCEventChannel } from '../shared/ipc/channels';
import type { IPCResponse } from '../shared/ipc/payloads';

/**
 * Preload script - exposes a safe, typed API to the renderer process
 * via contextBridge. All IPC communication goes through this bridge.
 *
 * 허용된 채널만 통과시켜 보안을 강화한다.
 */

/** 채널이 허용 목록에 있는지 검증 */
function isValidChannel(channel: string): channel is IPCChannel {
  return ALL_IPC_CHANNELS.includes(channel as IPCChannel);
}

const electronAPI = {
  /**
   * 타입 안전한 IPC invoke (Renderer → Main, request/response)
   * 허용된 채널만 호출 가능하다.
   */
  invoke: <TRes>(channel: IPCChannel, ...args: unknown[]): Promise<IPCResponse<TRes>> => {
    if (!isValidChannel(channel)) {
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * 타입 안전한 IPC 이벤트 구독 (Main → Renderer, progress/events)
   * 허용된 채널만 구독 가능하며, 구독 해제 함수를 반환한다.
   */
  on: (channel: IPCEventChannel, callback: (...args: unknown[]) => void): (() => void) => {
    if (!isValidChannel(channel)) {
      throw new Error(`Invalid IPC event channel: ${channel}`);
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

/** Renderer에서 사용할 electronAPI 타입 */
export type ElectronAPI = typeof electronAPI;
