/**
 * Main Process IPC 모듈 Barrel Export
 */

export {
  registerIPCHandler,
  removeIPCHandler,
  sendIPCEvent,
} from './handler';
export type {
  IPCHandlerFn,
  WorkerMessage,
  WorkerResponse,
  WorkerProgressMessage,
} from './handler';

export { registerFileHandlers } from './fileHandlers';
export type { FileOpenDialogResult } from './fileHandlers';
