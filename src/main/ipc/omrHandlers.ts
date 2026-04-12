/**
 * OMR (Optical Music Recognition) IPC handlers (Main Process).
 * Orchestrates the ensemble pipeline:
 *   1. File selection via native dialog
 *   2. Image preprocessing (grayscale, normalize, binarize)
 *   3. Parallel inference: Audiveris (subprocess) + SMT++ (ONNX)
 *   4. Ensemble merging with conflict detection
 *   5. Music theory post-processing and review state generation
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
import { preprocessImage } from '../omr/imagePreprocessor';
import { isPdfFile } from '../omr/pdfConverter';
import { mergeEnsembleResults } from '../omr/ensembleMerger';
import { areSMTModelsAvailable, runSMT } from '../omr/smtRunner';
import { loadOMRConfig } from '../omr/omrConfig';
import { MusicXMLParser } from '../../shared/serializer/MusicXMLParser';
import type { ModelManager } from '../omr/modelManager';
import type { IPCResponse } from '../../shared/ipc/payloads';
import type { OMRRecognizeResponse } from '../../shared/ipc/payloads';
import type { ScoreDocument, ScoreMetadata } from '../../shared/types/document';
import type { OMRProgress } from '../../shared/types/progress';
import type { ScoreData } from '../../shared/types/measure';

/** Send progress event to renderer */
function reportProgress(
  mainWindow: BrowserWindow | null,
  progress: OMRProgress,
): void {
  if (mainWindow) {
    sendIPCEvent(mainWindow, OMR_CHANNELS.PROGRESS, progress);
  }
}

/** Scale Audiveris progress (0-100) to overall pipeline range */
function scaleAudiverisProgress(percent: number): number {
  // Audiveris progress maps to 15-65% of overall
  return 15 + Math.round(percent * 0.5);
}

/** Scale SMT++ progress (0-100) to overall pipeline range */
function scaleSMTProgress(percent: number): number {
  // SMT++ progress maps to 15-65% of overall
  return 15 + Math.round(percent * 0.5);
}

/**
 * Register OMR-related IPC handlers.
 * Accepts an optional ModelManager for ONNX model inference.
 */
export function registerOMRHandlers(modelManager?: ModelManager): void {
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

      // 3. Detect available engines (respecting config)
      const omrConfig = loadOMRConfig();
      const audiverisStatus = await detectAudiveris();
      const smtAvailable = modelManager ? areSMTModelsAvailable(modelManager) : false;

      // Apply engine mode from config
      const useAudiveris = audiverisStatus.available && omrConfig.engine.mode !== 'smt-only';
      const useSMT = smtAvailable && omrConfig.engine.mode !== 'audiveris-only';

      if (!useAudiveris && !useSMT) {
        const details: string[] = [];
        if (!audiverisStatus.available) {
          details.push(`Audiveris: ${audiverisStatus.error ?? 'Java 17+ and Audiveris JAR not found'}`);
        }
        if (!smtAvailable) {
          details.push('SMT++: ONNX model files not found in models/smt/ directory');
        }
        return {
          success: false,
          error: createIPCError(
            'OMR_MODEL_LOAD_FAILED',
            `No OMR engine available.\n${details.join('\n')}`,
          ),
        };
      }

      // 4. Create temp output directory
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'sms-omr-'),
      );

      try {
        const startTime = Date.now();

        const mainWindow =
          BrowserWindow.getFocusedWindow() ??
          BrowserWindow.getAllWindows()[0] ??
          null;

        // ── Phase 1: Image Preprocessing ──
        reportProgress(mainWindow, {
          stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 0,
        });

        let preprocessedPath = filePath;
        const isImage = !isPdfFile(filePath);

        if (isImage && omrConfig.preprocessing.enabled) {
          try {
            const preprocessResult = await preprocessImage(filePath, tempDir, {
              targetDPI: omrConfig.preprocessing.targetDPI,
              binarize: omrConfig.preprocessing.binarize,
              denoise: omrConfig.preprocessing.denoise,
              normalizeContrast: omrConfig.preprocessing.normalizeContrast,
            });
            preprocessedPath = preprocessResult.processedPath;
          } catch {
            preprocessedPath = filePath;
          }
        }

        reportProgress(mainWindow, {
          stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 15,
        });

        // ── Phase 2: Parallel Inference ──
        let audiverisScoreData: ScoreData | undefined;
        let smtScoreData: ScoreData | undefined;

        // Launch both engines in parallel
        const promises: Promise<void>[] = [];

        // Audiveris pipeline
        if (useAudiveris) {
          promises.push(
            (async () => {
              const config = await getAudiverisConfig();
              const result = await runAudiveris({
                inputPath: filePath, // Audiveris handles PDF natively
                outputDir: path.join(tempDir, 'audiveris'),
                config,
                onProgress: (progress) => {
                  reportProgress(mainWindow, {
                    ...progress,
                    percent: scaleAudiverisProgress(progress.percent),
                  });
                },
              });

              const xmlContent = await extractMxl(result.mxlPath);
              const parser = new MusicXMLParser();
              audiverisScoreData = parser.fromMusicXML(xmlContent);
            })(),
          );
        }

        // SMT++ pipeline (images only)
        if (useSMT && modelManager && isImage) {
          promises.push(
            (async () => {
              try {
                const smtResult = await runSMT({
                  imagePath: preprocessedPath,
                  modelManager,
                  onProgress: (progress) => {
                    reportProgress(mainWindow, {
                      ...progress,
                      percent: scaleSMTProgress(progress.percent),
                    });
                  },
                });
                smtScoreData = smtResult.scoreData;
              } catch {
                // SMT++ failure is non-fatal — fall back to Audiveris only
                smtScoreData = undefined;
              }
            })(),
          );
        }

        // Wait for all engines to complete (or fail gracefully)
        const settledResults = await Promise.allSettled(promises);

        // Log engine results for debugging
        console.log('[OMR] Engine results:');
        console.log(`  Audiveris: ${useAudiveris ? (audiverisScoreData ? `${audiverisScoreData.parts.length} parts, ${audiverisScoreData.parts[0]?.measures.length ?? 0} measures` : 'failed') : 'disabled'}`);
        console.log(`  SMT++: ${useSMT ? (smtScoreData ? `${smtScoreData.parts.length} parts, ${smtScoreData.parts[0]?.measures.length ?? 0} measures` : 'failed') : 'disabled'}`);
        for (const [i, r] of settledResults.entries()) {
          if (r.status === 'rejected') {
            console.error(`  Engine ${i} error:`, r.reason);
          }
        }

        // Ensure at least one engine produced results
        if (!audiverisScoreData && !smtScoreData) {
          return {
            success: false,
            error: createIPCError(
              'OMR_RECOGNITION_FAILED',
              'All OMR engines failed to produce results.',
            ),
          };
        }

        reportProgress(mainWindow, {
          stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 75,
        });

        // ── Phase 3: Ensemble Merging ──
        let finalScoreData: ScoreData;
        let mergeConflicts: import('../omr/ensembleMerger').MergeConflict[] = [];

        if (audiverisScoreData && smtScoreData) {
          // Both engines available — merge
          const mergeResult = mergeEnsembleResults({
            audiveris: audiverisScoreData,
            smt: smtScoreData,
          });
          finalScoreData = mergeResult.merged;
          mergeConflicts = mergeResult.conflicts;
        } else {
          // Single engine fallback
          finalScoreData = audiverisScoreData ?? smtScoreData!;
        }

        reportProgress(mainWindow, {
          stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 85,
        });

        // ── Phase 4: Music Theory Post-processing ──
        const reviewState = generateReviewState(finalScoreData, {
          threshold: 0.7,
          mergeConflicts,
        });

        reportProgress(mainWindow, {
          stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 95,
        });

        // ── Phase 5: Build ScoreDocument ──
        const now = new Date().toISOString();
        const metadata: ScoreMetadata = {
          title: finalScoreData.credits?.find((c) => c.type === 'title')?.text ?? 'OMR Import',
          composer: finalScoreData.credits?.find((c) => c.type === 'composer')?.text ?? '',
          createdAt: now,
          modifiedAt: now,
          sourceType: 'omr',
        };

        const document: ScoreDocument = {
          metadata,
          scoreData: finalScoreData,
          reviewState: reviewState.items.length > 0 ? reviewState : undefined,
        };

        reportProgress(mainWindow, {
          stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 100,
        });

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
        // Cleanup temp directory
        fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  );
}
