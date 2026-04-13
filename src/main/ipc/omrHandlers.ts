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
import type { IPCResponse, OMREngineMode } from '../../shared/ipc/payloads';
import type { OMRRecognizeResponse } from '../../shared/ipc/payloads';
import type { ScoreDocument, ScoreMetadata } from '../../shared/types/document';
import type { OMRProgress } from '../../shared/types/progress';
import type { ScoreData } from '../../shared/types/measure';

/**
 * Monotonic progress reporter — ensures percent never goes backward.
 * Tracks the highest percent seen and only sends updates when it increases.
 */
function createProgressReporter(mainWindow: BrowserWindow | null) {
  let maxPercent = 0;

  return (progress: OMRProgress) => {
    // Never go backward
    if (progress.percent <= maxPercent && progress.percent < 100) {
      return;
    }
    maxPercent = progress.percent;
    if (mainWindow) {
      sendIPCEvent(mainWindow, OMR_CHANNELS.PROGRESS, progress);
    }
  };
}

/** Audiveris step names mapped to user-facing labels */
const AUDIVERIS_STEP_LABELS: Record<string, string> = {
  preprocessing: 'Analyzing image...',
  inference: 'Recognizing symbols...',
  postprocessing: 'Building structure...',
};

/** Scale Audiveris progress (0-100) to overall pipeline range (15-70%) */
function scaleAudiverisProgress(percent: number): number {
  return 15 + Math.round(percent * 0.55);
}

/**
 * Register OMR-related IPC handlers.
 * Accepts an optional ModelManager for ONNX model inference.
 */
export function registerOMRHandlers(modelManager?: ModelManager): void {
  registerIPCHandler<{ engineMode?: OMREngineMode } | void, OMRRecognizeResponse | null>(
    OMR_CHANNELS.RECOGNIZE,
    async (_event, request): Promise<IPCResponse<OMRRecognizeResponse | null>> => {
      const requestedMode = (request as { engineMode?: OMREngineMode } | undefined)?.engineMode;
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

      // 3. Detect available engines (request overrides config)
      const omrConfig = loadOMRConfig();
      const engineMode = requestedMode ?? omrConfig.engine.mode;
      const audiverisStatus = await detectAudiveris();
      const smtAvailable = modelManager ? areSMTModelsAvailable(modelManager) : false;

      const useAudiveris = audiverisStatus.available && engineMode !== 'smt-only';
      const useSMT = smtAvailable && engineMode !== 'audiveris-only';

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

        const report = createProgressReporter(mainWindow);

        // ── Phase 1: Image Preprocessing ──
        report({
          stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 0,
          stepLabel: 'Upscaling image...',
        });

        const isImage = !isPdfFile(filePath);

        let audiverisInputPath = filePath;
        let smtInputPath = filePath;

        if (isImage && omrConfig.preprocessing.enabled) {
          try {
            const audPreprocess = await preprocessImage(filePath, path.join(tempDir, 'preproc-aud'), {
              targetDPI: omrConfig.preprocessing.targetDPI,
              binarize: false,
              denoise: false,
              normalizeContrast: false,
            });
            audiverisInputPath = audPreprocess.processedPath;

            report({
              stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 8,
              stepLabel: 'Normalizing image...',
            });

            const smtPreprocess = await preprocessImage(filePath, path.join(tempDir, 'preproc-smt'), {
              targetDPI: omrConfig.preprocessing.targetDPI,
              binarize: omrConfig.preprocessing.binarize,
              denoise: omrConfig.preprocessing.denoise,
              normalizeContrast: omrConfig.preprocessing.normalizeContrast,
            });
            smtInputPath = smtPreprocess.processedPath;
          } catch {
            audiverisInputPath = filePath;
            smtInputPath = filePath;
          }
        }

        report({
          stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 15,
          stepLabel: 'Starting recognition...',
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
                inputPath: isImage ? audiverisInputPath : filePath, // Use upscaled for images, original for PDF
                outputDir: path.join(tempDir, 'audiveris'),
                config,
                onProgress: (p) => {
                  report({
                    ...p,
                    percent: scaleAudiverisProgress(p.percent),
                    stepLabel: AUDIVERIS_STEP_LABELS[p.stage] ?? 'Processing...',
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
                  imagePath: smtInputPath,
                  modelManager,
                  onProgress: (p) => {
                    // SMT++ progress is secondary — don't override Audiveris labels
                    // monotonic reporter will ignore if Audiveris is ahead
                    report({
                      ...p,
                      percent: 15 + Math.round(p.percent * 0.55),
                      stepLabel: p.stepLabel ?? 'Running ML model...',
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

        report({
          stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 75,
          stepLabel: 'Merging results...',
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

        report({
          stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 85,
          stepLabel: 'Checking music theory...',
        });

        // ── Phase 4: Music Theory Post-processing ──
        const reviewState = generateReviewState(finalScoreData, {
          threshold: 0.7,
          mergeConflicts,
        });

        report({
          stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 95,
          stepLabel: 'Building score...',
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

        report({
          stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 100,
          stepLabel: 'Complete',
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
