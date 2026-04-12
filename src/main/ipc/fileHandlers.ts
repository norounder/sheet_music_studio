/**
 * 파일 관련 IPC 핸들러 (Main Process)
 *
 * Electron 네이티브 다이얼로그를 사용한 파일 열기/저장 흐름을 처리한다.
 */

import { dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { FILE_CHANNELS } from '../../shared/ipc/channels';
import { createIPCError } from '../../shared/ipc/errors';
import { registerIPCHandler } from './handler';
import type { IPCResponse } from '../../shared/ipc/payloads';

/** file:open 응답 데이터 (파일 경로 + XML 콘텐츠) */
export interface FileOpenDialogResult {
  filePath: string;
  content: string;
}

/** 지원하는 MusicXML 확장자 */
const SUPPORTED_EXTENSIONS = ['.xml', '.musicxml', '.mxl'];

/**
 * 파일 확장자가 MusicXML 형식인지 검증
 */
function isSupportedExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * .mxl 파일(ZIP 압축된 MusicXML)에서 XML 콘텐츠를 추출한다.
 * META-INF/container.xml에서 rootfile을 찾거나, .xml 파일을 직접 탐색한다.
 */
async function extractMxl(filePath: string): Promise<string> {
  const buffer = await fs.promises.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  // 1) META-INF/container.xml에서 rootfile 경로 찾기
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('string');
    const match = containerXml.match(/full-path="([^"]+)"/);
    if (match) {
      const rootFile = zip.file(match[1]);
      if (rootFile) {
        return rootFile.async('string');
      }
    }
  }

  // 2) 폴백: ZIP 안에서 첫 번째 .xml 파일 찾기
  const xmlFiles = Object.keys(zip.files).filter(
    (name) => name.endsWith('.xml') && !name.startsWith('META-INF/'),
  );
  if (xmlFiles.length > 0) {
    return zip.file(xmlFiles[0])!.async('string');
  }

  throw new Error('.mxl 파일에서 MusicXML 콘텐츠를 찾을 수 없습니다.');
}

/** file:save 요청 데이터 (renderer → main) */
interface FileSaveIPCRequest {
  xmlContent: string;
}

/** file:save 응답 데이터 */
interface FileSaveIPCResponse {
  savedPath: string;
}

/** file:export 요청 데이터 (renderer → main) */
interface FileExportIPCRequest {
  format: 'pdf' | 'png';
  binaryData: number[];
}

/** file:export 응답 데이터 */
interface FileExportIPCResponse {
  exportedPath: string;
}

/**
 * 파일 관련 IPC 핸들러를 등록한다.
 */
export function registerFileHandlers(): void {
  // file:open - 네이티브 파일 열기 다이얼로그 + 파일 읽기
  registerIPCHandler<void, FileOpenDialogResult | null>(
    FILE_CHANNELS.OPEN,
    async (): Promise<IPCResponse<FileOpenDialogResult | null>> => {
      const result = await dialog.showOpenDialog({
        title: 'MusicXML 파일 열기',
        filters: [
          { name: 'MusicXML', extensions: ['xml', 'musicxml', 'mxl'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      // 사용자가 다이얼로그를 취소한 경우
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null };
      }

      const filePath = result.filePaths[0];

      // 지원하지 않는 파일 형식 검증
      if (!isSupportedExtension(filePath)) {
        return {
          success: false,
          error: createIPCError(
            'FILE_FORMAT_UNSUPPORTED',
            '지원하지 않는 파일 형식입니다. XML, MusicXML, MXL 형식을 사용해 주세요.',
          ),
        };
      }

      try {
        const ext = path.extname(filePath).toLowerCase();
        let content: string;

        if (ext === '.mxl') {
          // .mxl은 ZIP 압축된 MusicXML — 압축 해제 후 XML 추출
          content = await extractMxl(filePath);
        } else {
          // .xml, .musicxml은 텍스트로 직접 읽기
          content = await fs.promises.readFile(filePath, 'utf-8');
        }

        return {
          success: true,
          data: { filePath, content },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          success: false,
          error: createIPCError(
            'FILE_READ_ERROR',
            `파일을 읽을 수 없습니다: ${message}`,
            err,
          ),
        };
      }
    },
  );

  // file:save - 네이티브 파일 저장 다이얼로그 + MusicXML 쓰기
  registerIPCHandler<FileSaveIPCRequest, FileSaveIPCResponse | null>(
    FILE_CHANNELS.SAVE,
    async (req): Promise<IPCResponse<FileSaveIPCResponse | null>> => {
      const result = await dialog.showSaveDialog({
        title: 'MusicXML 파일 저장',
        filters: [
          { name: 'MusicXML', extensions: ['musicxml', 'xml'] },
        ],
        defaultPath: 'score.musicxml',
      });

      if (result.canceled || !result.filePath) {
        return { success: true, data: null };
      }

      try {
        await fs.promises.writeFile(result.filePath, req.xmlContent, 'utf-8');
        return {
          success: true,
          data: { savedPath: result.filePath },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          success: false,
          error: createIPCError(
            'FILE_WRITE_ERROR',
            `파일을 저장할 수 없습니다: ${message}`,
            err,
          ),
        };
      }
    },
  );

  // file:export - 네이티브 파일 저장 다이얼로그 + PDF/PNG 바이너리 쓰기
  registerIPCHandler<FileExportIPCRequest, FileExportIPCResponse | null>(
    FILE_CHANNELS.EXPORT,
    async (req): Promise<IPCResponse<FileExportIPCResponse | null>> => {
      const isPdf = req.format === 'pdf';
      const result = await dialog.showSaveDialog({
        title: isPdf ? 'PDF로 내보내기' : 'PNG로 내보내기',
        filters: [
          isPdf
            ? { name: 'PDF', extensions: ['pdf'] }
            : { name: 'PNG', extensions: ['png'] },
        ],
        defaultPath: isPdf ? 'score.pdf' : 'score.png',
      });

      if (result.canceled || !result.filePath) {
        return { success: true, data: null };
      }

      try {
        const buffer = Buffer.from(req.binaryData);
        await fs.promises.writeFile(result.filePath, buffer);
        return {
          success: true,
          data: { exportedPath: result.filePath },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          success: false,
          error: createIPCError(
            'FILE_WRITE_ERROR',
            `파일을 내보낼 수 없습니다: ${message}`,
            err,
          ),
        };
      }
    },
  );
}
