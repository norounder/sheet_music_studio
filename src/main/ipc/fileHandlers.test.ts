/**
 * fileHandlers 단위 테스트
 *
 * Electron dialog / fs / ipcMain을 모킹하여
 * file:open IPC 핸들러의 동작을 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IPCResponse } from '../../shared/ipc/payloads';
import type { FileOpenDialogResult } from './fileHandlers';

// ─── Mocks ───

// 캡처된 핸들러를 저장할 맵
const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
    },
  },
  promises: {
    readFile: vi.fn(),
  },
}));

// ─── Imports (after mocks) ───

import { dialog } from 'electron';
import fs from 'fs';
import { registerFileHandlers } from './fileHandlers';

describe('fileHandlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerFileHandlers();
  });

  /** 등록된 file:open 핸들러를 호출하는 헬퍼 */
  async function invokeFileOpen(): Promise<IPCResponse<FileOpenDialogResult | null>> {
    const handler = handlers.get('file:open');
    expect(handler).toBeDefined();
    // ipcMain.handle wraps with (_event, request), simulate that
    const result = await handler!({} /* event */, undefined /* request */);
    return result as IPCResponse<FileOpenDialogResult | null>;
  }

  it('should register file:open handler', () => {
    expect(handlers.has('file:open')).toBe(true);
  });

  it('should return null data when user cancels dialog', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    const result = await invokeFileOpen();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it('should return file content for valid .xml file', async () => {
    const mockXml = '<?xml version="1.0"?><score-partwise></score-partwise>';
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['/path/to/score.xml'],
    });
    vi.mocked(fs.promises.readFile).mockResolvedValue(mockXml as never);

    const result = await invokeFileOpen();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        filePath: '/path/to/score.xml',
        content: mockXml,
      });
    }
  });

  it('should return file content for valid .musicxml file', async () => {
    const mockXml = '<score-partwise/>';
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['/home/user/test.musicxml'],
    });
    vi.mocked(fs.promises.readFile).mockResolvedValue(mockXml as never);

    const result = await invokeFileOpen();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.filePath).toBe('/home/user/test.musicxml');
    }
  });

  it('should return error for unsupported file extension', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['/path/to/score.pdf'],
    });

    const result = await invokeFileOpen();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FILE_FORMAT_UNSUPPORTED');
    }
  });

  it('should return error when file read fails', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['/path/to/missing.xml'],
    });
    vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT: no such file'));

    const result = await invokeFileOpen();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FILE_READ_ERROR');
      expect(result.error.message).toContain('ENOENT');
    }
  });
});
