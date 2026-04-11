/**
 * 타입 안전한 IPC 핸들러 등록 유틸리티 (Main Process)
 *
 * TypeScript 제네릭을 활용하여 채널별 request/response 타입을 강제한다.
 * Worker Thread 통신 인터페이스도 포함한다.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { IPCChannel, IPCEventChannel } from '../../shared/ipc/channels';
import type { IPCResponse } from '../../shared/ipc/payloads';
import type { IPCEventMap } from '../../shared/ipc/events';
import { createIPCError } from '../../shared/ipc/errors';

/**
 * IPC 핸들러 함수 타입
 * 요청을 받아 IPCResponse를 반환하는 비동기 함수
 */
export type IPCHandlerFn<TReq, TRes> = (request: TReq) => Promise<IPCResponse<TRes>>;

/**
 * 타입 안전한 IPC 핸들러 등록
 *
 * @param channel - IPC 채널 이름
 * @param handler - 요청 처리 함수
 *
 * @example
 * ```ts
 * registerIPCHandler<FileOpenRequest, FileOpenResponse>(
 *   FILE_CHANNELS.OPEN,
 *   async (req) => {
 *     const doc = await openFile(req.filePath);
 *     return { success: true, data: { document: doc } };
 *   }
 * );
 * ```
 */
export function registerIPCHandler<TReq, TRes>(
  channel: IPCChannel,
  handler: IPCHandlerFn<TReq, TRes>
): void {
  ipcMain.handle(channel, async (_event, request: TReq): Promise<IPCResponse<TRes>> => {
    try {
      return await handler(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: createIPCError('INTERNAL_ERROR', message, error),
      };
    }
  });
}

/**
 * 등록된 IPC 핸들러 제거
 *
 * @param channel - 제거할 IPC 채널 이름
 */
export function removeIPCHandler(channel: IPCChannel): void {
  ipcMain.removeHandler(channel);
}

/**
 * Renderer 프로세스로 progress/event 전송
 *
 * @param window - 대상 BrowserWindow
 * @param channel - 이벤트 채널 이름
 * @param data - 이벤트 데이터
 */
export function sendIPCEvent<K extends IPCEventChannel>(
  window: BrowserWindow,
  channel: K,
  data: K extends keyof IPCEventMap ? IPCEventMap[K] : never
): void {
  if (!window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}

// ─── Worker Thread 통신 인터페이스 ───

/** Worker Thread 메시지 타입 */
export interface WorkerMessage<TReq = unknown> {
  channel: IPCChannel;
  requestId: string;
  payload: TReq;
}

/** Worker Thread 응답 타입 */
export interface WorkerResponse<TRes = unknown> {
  requestId: string;
  result: IPCResponse<TRes>;
}

/** Worker Thread Progress 메시지 타입 */
export interface WorkerProgressMessage {
  channel: IPCEventChannel;
  data: unknown;
}
