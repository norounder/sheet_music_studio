/**
 * SMT++ (Sheet Music Transformer) ONNX inference runner.
 * Loads SMT++ encoder and decoder models via onnxruntime-node,
 * performs autoregressive decoding, and returns bekern notation.
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import type { ModelManager } from './modelManager';
import type { OMRProgress } from '../../shared/types/progress';
import type { ScoreData } from '../../shared/types/measure';
import { parseBekern } from './bekernParser';

/** SMT++ model file names */
export const SMT_MODEL_NAMES = {
  ENCODER: 'smt-encoder',
  DECODER: 'smt-decoder',
} as const;

/** SMT++ model file paths (relative to models dir) */
export const SMT_MODEL_FILES = {
  ENCODER: 'smt/encoder.onnx',
  DECODER: 'smt/decoder.onnx',
} as const;

/** Options for running SMT++ inference */
export interface SMTRunOptions {
  /** Path to preprocessed input image */
  imagePath: string;
  /** ModelManager instance for loading ONNX sessions */
  modelManager: ModelManager;
  /** Progress callback */
  onProgress?: (progress: OMRProgress) => void;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/** Result from SMT++ inference */
export interface SMTResult {
  /** Raw bekern notation output */
  bekernOutput: string;
  /** Parsed ScoreData */
  scoreData: ScoreData;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

/** SMT++ model configuration */
const SMT_CONFIG = {
  /** Image height for encoder input */
  imageHeight: 256,
  /** Maximum image width (will be scaled proportionally) */
  maxImageWidth: 2048,
  /** Maximum decoder sequence length */
  maxSeqLength: 1024,
  /** Decoder vocabulary size */
  vocabSize: 512,
  /** End-of-sequence token ID */
  eosTokenId: 2,
  /** Start-of-sequence token ID */
  sosTokenId: 1,
  /** Padding token ID */
  padTokenId: 0,
  /** Encoder feature dimension */
  encoderDim: 256,
} as const;

/**
 * Check if SMT++ models are available (downloaded).
 */
export function areSMTModelsAvailable(modelManager: ModelManager): boolean {
  const fs = require('fs');
  const path = require('path');
  const encoderPath = path.join(modelManager.modelsDir, SMT_MODEL_FILES.ENCODER);
  const decoderPath = path.join(modelManager.modelsDir, SMT_MODEL_FILES.DECODER);
  return fs.existsSync(encoderPath) && fs.existsSync(decoderPath);
}

/**
 * Load and preprocess image for SMT++ encoder input.
 * Resizes to fixed height, maintaining aspect ratio, then normalizes to [0, 1].
 */
async function preprocessImageForSMT(imagePath: string): Promise<ort.Tensor> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const origWidth = metadata.width ?? 0;
  const origHeight = metadata.height ?? 0;

  if (origWidth === 0 || origHeight === 0) {
    throw new Error(`Invalid image dimensions: ${origWidth}x${origHeight}`);
  }

  // Calculate new width maintaining aspect ratio
  const newHeight = SMT_CONFIG.imageHeight;
  const newWidth = Math.min(
    Math.round((origWidth / origHeight) * newHeight),
    SMT_CONFIG.maxImageWidth,
  );

  // Resize to target dimensions, convert to grayscale float
  const buffer = await sharp(imagePath)
    .resize(newWidth, newHeight, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  // Convert to float32 tensor [1, 1, H, W] normalized to [0, 1]
  const floatData = new Float32Array(newHeight * newWidth);
  for (let i = 0; i < buffer.length; i++) {
    floatData[i] = buffer[i] / 255.0;
  }

  return new ort.Tensor('float32', floatData, [1, 1, newHeight, newWidth]);
}

/**
 * Run SMT++ encoder to extract feature representations.
 */
async function runEncoder(
  session: ort.InferenceSession,
  inputTensor: ort.Tensor,
): Promise<ort.Tensor> {
  const feeds: Record<string, ort.Tensor> = { input: inputTensor };
  const results = await session.run(feeds);

  // The encoder output is typically named 'output' or 'features'
  const outputName = session.outputNames[0];
  return results[outputName];
}

/**
 * Run SMT++ decoder autoregressively to generate bekern token sequence.
 */
async function runDecoder(
  session: ort.InferenceSession,
  encoderOutput: ort.Tensor,
  onProgress?: (step: number, maxSteps: number) => void,
  abortSignal?: AbortSignal,
): Promise<number[]> {
  const tokens: number[] = [SMT_CONFIG.sosTokenId];

  for (let step = 0; step < SMT_CONFIG.maxSeqLength; step++) {
    if (abortSignal?.aborted) {
      throw new Error('SMT++ inference was cancelled.');
    }

    // Create decoder input tensor from current token sequence
    const inputTokens = new BigInt64Array(tokens.map((t) => BigInt(t)));
    const tokenTensor = new ort.Tensor('int64', inputTokens, [1, tokens.length]);

    const feeds: Record<string, ort.Tensor> = {
      encoder_output: encoderOutput,
      decoder_input: tokenTensor,
    };

    const results = await session.run(feeds);
    const outputName = session.outputNames[0];
    const logits = results[outputName];

    // Get the last token's logits and find argmax
    const logitsData = logits.data as Float32Array;
    const vocabSize = SMT_CONFIG.vocabSize;
    const lastTokenOffset = (tokens.length - 1) * vocabSize;

    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let v = 0; v < vocabSize; v++) {
      const val = logitsData[lastTokenOffset + v];
      if (val > maxVal) {
        maxVal = val;
        maxIdx = v;
      }
    }

    // Check for end-of-sequence
    if (maxIdx === SMT_CONFIG.eosTokenId) {
      break;
    }

    tokens.push(maxIdx);
    onProgress?.(step, SMT_CONFIG.maxSeqLength);
  }

  return tokens.slice(1); // Remove SOS token
}

/**
 * Placeholder: Convert token IDs back to bekern text.
 * In production, this would use the SMT++ vocabulary file.
 * For now, returns a placeholder that indicates the tokens were generated.
 */
function tokensTobekern(_tokens: number[]): string {
  // This is a placeholder — actual implementation requires the vocabulary mapping
  // from the SMT++ model's tokenizer (w2i / i2w dictionaries).
  // For MVP, the bekern output will come from model-specific post-processing.
  //
  // The token-to-bekern mapping will be loaded from a vocab.json file
  // shipped alongside the ONNX models.
  return '';
}

/**
 * Run the full SMT++ inference pipeline.
 *
 * Pipeline:
 * 1. Load encoder and decoder models
 * 2. Preprocess image for encoder
 * 3. Run encoder to extract features
 * 4. Run decoder autoregressively to generate token sequence
 * 5. Convert tokens to bekern notation
 * 6. Parse bekern to ScoreData
 */
export async function runSMT(options: SMTRunOptions): Promise<SMTResult> {
  const { imagePath, modelManager, onProgress, abortSignal } = options;
  const startTime = Date.now();

  // Report initial progress
  onProgress?.({ stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 0 });

  // 1. Load models
  const encoderModel = await modelManager.loadModel(
    SMT_MODEL_FILES.ENCODER,
    SMT_MODEL_NAMES.ENCODER,
  );
  const decoderModel = await modelManager.loadModel(
    SMT_MODEL_FILES.DECODER,
    SMT_MODEL_NAMES.DECODER,
  );

  onProgress?.({ stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 10 });

  // 2. Preprocess image
  const inputTensor = await preprocessImageForSMT(imagePath);
  onProgress?.({ stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 20 });

  // 3. Run encoder
  onProgress?.({ stage: 'inference', currentPage: 1, totalPages: 1, percent: 25 });
  const encoderOutput = await runEncoder(encoderModel.session, inputTensor);
  onProgress?.({ stage: 'inference', currentPage: 1, totalPages: 1, percent: 35 });

  // 4. Run decoder (autoregressive)
  const tokens = await runDecoder(
    decoderModel.session,
    encoderOutput,
    (step, maxSteps) => {
      const decoderPercent = 35 + Math.round((step / maxSteps) * 50);
      onProgress?.({
        stage: 'inference',
        currentPage: 1,
        totalPages: 1,
        percent: Math.min(85, decoderPercent),
      });
    },
    abortSignal,
  );

  onProgress?.({ stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 90 });

  // 5. Convert tokens to bekern
  const bekernOutput = tokensTobekern(tokens);

  // 6. Parse bekern to ScoreData
  const scoreData = parseBekern(bekernOutput);

  onProgress?.({ stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 100 });

  return {
    bekernOutput,
    scoreData,
    elapsedMs: Date.now() - startTime,
  };
}
