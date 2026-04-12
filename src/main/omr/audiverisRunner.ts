/**
 * Audiveris subprocess runner.
 * Spawns Audiveris in batch mode, parses stdout for progress, and returns the output .mxl path.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import type { AudiverisConfig } from './audiverisManager';
import type { OMRProgress } from '../../shared/types/progress';

/** Options for running Audiveris */
export interface AudiverisRunOptions {
  /** Path to input image or PDF */
  inputPath: string;
  /** Temporary output directory for .mxl files */
  outputDir: string;
  /** Audiveris configuration (native exe or java+jar) */
  config: AudiverisConfig;
  /** Timeout in milliseconds (default: 300_000 = 5 minutes) */
  timeoutMs?: number;
  /** Progress callback */
  onProgress?: (progress: OMRProgress) => void;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/** Result from a successful Audiveris run */
export interface AudiverisResult {
  /** Path to the generated .mxl file */
  mxlPath: string;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

/**
 * Audiveris processing steps in order.
 * Used for progress percentage calculation.
 */
const AUDIVERIS_STEPS = [
  'LOAD', 'BINARY', 'SCALE', 'GRID', 'HEADERS',
  'STEM_SEEDS', 'BEAMS', 'HEADS', 'HEADS_INTER', 'STEMS',
  'REDUCTION', 'CUE_NOTES', 'TEXTS', 'MEASURES', 'CHORDS',
  'SYMBOLS', 'LINKS', 'RHYTHMS',
] as const;

/** Map step name to OMRProgress stage */
function getStage(stepIndex: number): OMRProgress['stage'] {
  if (stepIndex <= 4) return 'preprocessing';  // LOAD..HEADERS
  if (stepIndex <= 15) return 'inference';      // STEM_SEEDS..SYMBOLS
  return 'postprocessing';                      // LINKS..RHYTHMS
}

/** Internal state for tracking progress across stdout lines */
interface ProgressState {
  currentPage: number;
  totalPages: number;
  completedSteps: number;
}

/**
 * Parse a single line of Audiveris stdout for progress information.
 * Returns an OMRProgress object if the line contains progress info, null otherwise.
 */
export function parseAudiverisLine(
  line: string,
  state: ProgressState,
): OMRProgress | null {
  // Detect total pages: "Loading ... (N sheets)"
  const sheetsMatch = line.match(/(\d+)\s+sheet/i);
  if (sheetsMatch) {
    state.totalPages = parseInt(sheetsMatch[1], 10);
  }

  // Detect current sheet: "Sheet#N" or "Sheet #N"
  const sheetMatch = line.match(/Sheet\s*#?(\d+)/i);
  if (sheetMatch) {
    state.currentPage = parseInt(sheetMatch[1], 10);
    state.completedSteps = 0;
  }

  // Detect step completion
  const trimmed = line.trim().toUpperCase();
  for (let i = 0; i < AUDIVERIS_STEPS.length; i++) {
    if (trimmed.includes(AUDIVERIS_STEPS[i])) {
      if (i >= state.completedSteps) {
        state.completedSteps = i + 1;
      }
      break;
    }
  }

  // Only report if we have meaningful progress
  if (state.completedSteps === 0 && state.currentPage === 0) {
    return null;
  }

  const percent = Math.round(
    (state.completedSteps / AUDIVERIS_STEPS.length) * 100,
  );

  return {
    stage: getStage(state.completedSteps - 1),
    currentPage: Math.max(1, state.currentPage),
    totalPages: Math.max(1, state.totalPages),
    percent: Math.min(100, percent),
  };
}

/**
 * Run Audiveris as a subprocess in batch mode.
 * Spawns `java -jar Audiveris.jar -batch -transcribe -export -output <dir> <input>`,
 * parses stdout for progress, and returns the path to the generated .mxl file.
 */
export async function runAudiveris(
  options: AudiverisRunOptions,
): Promise<AudiverisResult> {
  const { inputPath, outputDir, config, onProgress, abortSignal } = options;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const startTime = Date.now();

  return new Promise<AudiverisResult>((resolve, reject) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      reject(new Error('OMR recognition was cancelled.'));
      return;
    }

    // Build command based on mode (native exe vs java -jar)
    let command: string;
    let args: string[];

    if (config.mode === 'native') {
      command = config.executablePath;
      args = [
        '-batch',
        '-export',
        '-output', outputDir,
        inputPath,
      ];
    } else {
      command = config.executablePath;
      args = [
        '-jar', config.jarPath!,
        '-batch',
        '-transcribe',
        '-export',
        '-output', outputDir,
        inputPath,
      ];
    }

    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const state: ProgressState = {
      currentPage: 0,
      totalPages: 1,
      completedSteps: 0,
    };

    let stderrOutput = '';

    // Parse stdout for progress
    if (proc.stdout) {
      const rl = createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        const progress = parseAudiverisLine(line, state);
        if (progress && onProgress) {
          onProgress(progress);
        }
      });
    }

    // Capture stderr for error reporting
    if (proc.stderr) {
      const rl = createInterface({ input: proc.stderr });
      rl.on('line', (line) => {
        stderrOutput += line + '\n';
        // Audiveris also logs progress to stderr in some versions
        const progress = parseAudiverisLine(line, state);
        if (progress && onProgress) {
          onProgress(progress);
        }
      });
    }

    // Timeout handler
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Audiveris processing timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);

    // Abort handler
    const onAbort = () => {
      proc.kill('SIGTERM');
      reject(new Error('OMR recognition was cancelled.'));
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    // Process exit handler
    proc.on('close', async (code) => {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);

      if (code !== 0) {
        const errMsg = stderrOutput.trim().slice(-500) || `Exit code: ${code}`;
        reject(new Error(`Audiveris failed: ${errMsg}`));
        return;
      }

      // Find the output .mxl file
      try {
        const files = await fs.promises.readdir(outputDir);
        const mxlFile = files.find((f) => f.endsWith('.mxl'));
        if (!mxlFile) {
          reject(new Error('Audiveris completed but no .mxl output was generated.'));
          return;
        }

        // Send final 100% progress
        if (onProgress) {
          onProgress({
            stage: 'postprocessing',
            currentPage: state.totalPages,
            totalPages: state.totalPages,
            percent: 100,
          });
        }

        resolve({
          mxlPath: path.join(outputDir, mxlFile),
          elapsedMs: Date.now() - startTime,
        });
      } catch (err) {
        reject(new Error(`Failed to read output directory: ${err}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
      reject(new Error(`Failed to start Audiveris process: ${err.message}`));
    });
  });
}
