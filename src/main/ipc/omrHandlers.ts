/**
 * OMR (Optical Music Recognition) IPC handlers (Main Process).
 * Opens image/PDF via native dialog, runs Audiveris subprocess,
 * and returns parsed ScoreDocument with review state.
 */

import { dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { OMR_CHANNELS } from '../../shared/ipc/channels';
import { createIPCError } from '../../shared/ipc/errors';
import { registerIPCHandler, sendIPCEvent } from './handler';
import { extractMxl } from './fileHandlers';
import { detectAudiveris, getAudiverisConfig } from '../omr/audiverisManager';
import { runAudiveris } from '../omr/audiverisRunner';
import { generateReviewState } from '../omr/reviewGenerator';
import { MusicXMLParser } from '../../shared/serializer/MusicXMLParser';
import type { IPCResponse } from '../../shared/ipc/payloads';
import type { OMRRecognizeResponse } from '../../shared/ipc/payloads';
import type { ScoreDocument, ScoreMetadata } from '../../shared/types/document';

/**
 * Register OMR-related IPC handlers.
 */
export function registerOMRHandlers(): void {
  registerIPCHandler<void, OMRRecognizeResponse | null>(
    OMR_CHANNELS.RECOGNIZE,
    async (): Promise<IPCResponse<OMRRecognizeResponse | null>> => {
      // 1. Native file open dialog with image/PDF filters
      const dialogResult = await dialog.showOpenDialog({
        title: 'OMR: Select sheet music image or PDF',
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tiff', 'tif', 'bmp'] },
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return { success: true, data: null };
      }

      const filePath = dialogResult.filePaths[0];

      // 2. Validate file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: createIPCError('FILE_NOT_FOUND', `File not found: ${filePath}`),
        };
      }

      // 3. Detect Audiveris availability
      const status = await detectAudiveris();
      if (!status.available) {
        return {
          success: false,
          error: createIPCError(
            'OMR_MODEL_LOAD_FAILED',
            status.error ?? 'Audiveris is not available.',
          ),
        };
      }

      // 4. Create temp output directory
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'sms-omr-'),
      );

      try {
        const config = await getAudiverisConfig();
        const startTime = Date.now();

        // Get window for progress events
        const mainWindow =
          BrowserWindow.getFocusedWindow() ??
          BrowserWindow.getAllWindows()[0] ??
          null;

        // 5. Run Audiveris subprocess
        const result = await runAudiveris({
          inputPath: filePath,
          outputDir: tempDir,
          config,
          onProgress: (progress) => {
            if (mainWindow) {
              sendIPCEvent(mainWindow, OMR_CHANNELS.PROGRESS, progress);
            }
          },
        });

        // 6. Extract MusicXML from .mxl output
        const xmlContent = await extractMxl(result.mxlPath);

        // 7. Parse to ScoreData
        const parser = new MusicXMLParser();
        const scoreData = parser.fromMusicXML(xmlContent);

        // 8. Generate review state with heuristic confidence
        const reviewState = generateReviewState(scoreData);

        // 9. Build ScoreDocument
        const now = new Date().toISOString();
        const metadata: ScoreMetadata = {
          title: scoreData.credits?.find((c) => c.type === 'title')?.text ?? 'OMR Import',
          composer: scoreData.credits?.find((c) => c.type === 'composer')?.text ?? '',
          createdAt: now,
          modifiedAt: now,
          sourceType: 'omr',
        };

        const document: ScoreDocument = {
          metadata,
          scoreData,
          reviewState: reviewState.items.length > 0 ? reviewState : undefined,
        };

        return {
          success: true,
          data: {
            document,
            processingTimeMs: Date.now() - startTime,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown OMR error';
        return {
          success: false,
          error: createIPCError('OMR_RECOGNITION_FAILED', message, err),
        };
      } finally {
        // 10. Cleanup temp directory
        fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  );
}
