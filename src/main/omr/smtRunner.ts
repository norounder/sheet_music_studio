/**
 * SMT++ (Sheet Music Transformer) ONNX inference runner.
 * Loads SMT++ encoder and decoder models via onnxruntime-node,
 * performs autoregressive decoding, and returns bekern notation.
 *
 * Model: antoniorv6/smt-grandstaff (HuggingFace)
 * Architecture: ConvNext encoder (1ch grayscale) + Transformer decoder (8L/4H/256D)
 * Output: bekern (Humdrum **kern variant) notation
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
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
  VOCAB: 'smt/vocab.json',
  CONFIG: 'smt/config.json',
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

/** SMT++ vocabulary (loaded from vocab.json) */
interface SMTVocab {
  /** Token string → ID */
  w2i: Record<string, number>;
  /** ID → token string */
  i2w: Record<string, string>;
  bosTokenId: number;
  eosTokenId: number;
  padTokenId: number;
  vocabSize: number;
}

/** SMT++ model config (loaded from config.json) */
interface SMTModelConfig {
  d_model: number;
  maxlen: number;
  out_categories: number;
  fixed_height: number;
  fixed_width: number;
  bos_token_id: number;
  eos_token_id: number;
  pad_token_id: number;
}

/** Default config (matched to antoniorv6/smt-grandstaff export) */
const DEFAULT_CONFIG: SMTModelConfig = {
  d_model: 256,
  maxlen: 1512,
  out_categories: 20578,
  fixed_height: 256,
  fixed_width: 1024,
  bos_token_id: 4426,
  eos_token_id: 8822,
  pad_token_id: 0,
};

/** Cached vocabulary and config */
let cachedVocab: SMTVocab | null = null;
let cachedConfig: SMTModelConfig | null = null;

/**
 * Load vocabulary from vocab.json.
 */
function loadVocab(modelsDir: string): SMTVocab {
  if (cachedVocab) return cachedVocab;

  const vocabPath = path.join(modelsDir, SMT_MODEL_FILES.VOCAB);
  if (!fs.existsSync(vocabPath)) {
    throw new Error(`SMT++ vocabulary file not found: ${vocabPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(vocabPath, 'utf-8'));
  cachedVocab = {
    w2i: raw.w2i ?? {},
    i2w: raw.i2w ?? {},
    bosTokenId: raw.bos_token_id ?? DEFAULT_CONFIG.bos_token_id,
    eosTokenId: raw.eos_token_id ?? DEFAULT_CONFIG.eos_token_id,
    padTokenId: raw.pad_token_id ?? DEFAULT_CONFIG.pad_token_id,
    vocabSize: raw.vocab_size ?? DEFAULT_CONFIG.out_categories,
  };
  return cachedVocab;
}

/**
 * Load model config from config.json.
 */
function loadConfig(modelsDir: string): SMTModelConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = path.join(modelsDir, SMT_MODEL_FILES.CONFIG);
  if (!fs.existsSync(configPath)) {
    const config: SMTModelConfig = { ...DEFAULT_CONFIG };
    cachedConfig = config;
    return config;
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const config: SMTModelConfig = { ...DEFAULT_CONFIG, ...raw };
  cachedConfig = config;
  return config;
}

/**
 * Check if SMT++ models are available (downloaded).
 */
export function areSMTModelsAvailable(modelManager: ModelManager): boolean {
  const encoderPath = path.join(modelManager.modelsDir, SMT_MODEL_FILES.ENCODER);
  const decoderPath = path.join(modelManager.modelsDir, SMT_MODEL_FILES.DECODER);
  return fs.existsSync(encoderPath) && fs.existsSync(decoderPath);
}

/**
 * Load and preprocess image for SMT++ encoder input.
 * Resizes to fixed height, maintaining aspect ratio, then normalizes to [0, 1].
 */
async function preprocessImageForSMT(
  imagePath: string,
  config: SMTModelConfig,
): Promise<ort.Tensor> {
  const metadata = await sharp(imagePath).metadata();
  const origWidth = metadata.width ?? 0;
  const origHeight = metadata.height ?? 0;

  if (origWidth === 0 || origHeight === 0) {
    throw new Error(`Invalid image dimensions: ${origWidth}x${origHeight}`);
  }

  const newHeight = config.fixed_height;
  const newWidth = Math.min(
    Math.round((origWidth / origHeight) * newHeight),
    config.fixed_width,
  );

  // Resize and convert to grayscale raw buffer
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
 * Returns two tensors: 2D positional encoded (for key) and raw (for value).
 */
async function runEncoder(
  session: ort.InferenceSession,
  inputTensor: ort.Tensor,
): Promise<{ encoder2d: ort.Tensor; encoderRaw: ort.Tensor }> {
  const feeds: Record<string, ort.Tensor> = { pixel_values: inputTensor };
  const results = await session.run(feeds);

  // Encoder outputs: encoder_2d (with 2D positional encoding) and encoder_raw
  const encoder2d = results['encoder_2d'] ?? results[session.outputNames[0]];
  const encoderRaw = results['encoder_raw'] ?? results[session.outputNames[1]] ?? encoder2d;

  return { encoder2d, encoderRaw };
}

/**
 * Run SMT++ decoder autoregressively to generate bekern token sequence.
 */
async function runDecoder(
  session: ort.InferenceSession,
  encoder2d: ort.Tensor,
  encoderRaw: ort.Tensor,
  config: SMTModelConfig,
  vocab: SMTVocab,
  onProgress?: (step: number, maxSteps: number) => void,
  abortSignal?: AbortSignal,
): Promise<number[]> {
  const tokens: number[] = [vocab.bosTokenId];
  const maxSteps = config.maxlen;

  for (let step = 0; step < maxSteps; step++) {
    if (abortSignal?.aborted) {
      throw new Error('SMT++ inference was cancelled.');
    }

    // Create decoder input tensor
    const inputTokens = new BigInt64Array(tokens.map((t) => BigInt(t)));
    const tokenTensor = new ort.Tensor('int64', inputTokens, [1, tokens.length]);

    const feeds: Record<string, ort.Tensor> = {
      token_ids: tokenTensor,
      encoder_2d: encoder2d,
      encoder_raw: encoderRaw,
    };

    const results = await session.run(feeds);
    const logits = results['logits'] ?? results[session.outputNames[0]];

    // Get the last token's logits and find argmax
    const logitsData = logits.data as Float32Array;
    const vocabSize = vocab.vocabSize;
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
    if (maxIdx === vocab.eosTokenId) {
      break;
    }

    tokens.push(maxIdx);
    onProgress?.(step, maxSteps);
  }

  return tokens.slice(1); // Remove BOS token
}

/**
 * Convert token IDs back to bekern text using the vocabulary.
 */
function tokensToBekern(tokens: number[], vocab: SMTVocab): string {
  const parts: string[] = [];
  for (const tokenId of tokens) {
    const token = vocab.i2w[String(tokenId)];
    if (token === undefined) continue;

    // Decode special structural tokens
    if (token === '<t>') {
      parts.push('\t');
    } else if (token === '<b>') {
      parts.push('\n');
    } else if (token === '<s>') {
      parts.push(' ');
    } else if (token === '<pad>' || token === '<bos>' || token === '<eos>') {
      // Skip special tokens
    } else {
      parts.push(token);
    }
  }

  return parts.join('');
}

/**
 * Run the full SMT++ inference pipeline.
 *
 * Pipeline:
 * 1. Load vocab/config and ONNX models
 * 2. Preprocess image for encoder
 * 3. Run encoder to extract features (2D pos + raw)
 * 4. Run decoder autoregressively to generate token sequence
 * 5. Convert tokens to bekern notation via vocabulary
 * 6. Parse bekern to ScoreData
 */
export async function runSMT(options: SMTRunOptions): Promise<SMTResult> {
  const { imagePath, modelManager, onProgress, abortSignal } = options;
  const startTime = Date.now();

  onProgress?.({ stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 0 });

  // 1. Load config and vocabulary
  const config = loadConfig(modelManager.modelsDir);
  const vocab = loadVocab(modelManager.modelsDir);

  // Load ONNX models
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
  const inputTensor = await preprocessImageForSMT(imagePath, config);
  onProgress?.({ stage: 'preprocessing', currentPage: 1, totalPages: 1, percent: 20 });

  // 3. Run encoder
  onProgress?.({ stage: 'inference', currentPage: 1, totalPages: 1, percent: 25 });
  const { encoder2d, encoderRaw } = await runEncoder(encoderModel.session, inputTensor);
  onProgress?.({ stage: 'inference', currentPage: 1, totalPages: 1, percent: 35 });

  // 4. Run decoder (autoregressive)
  const tokens = await runDecoder(
    decoderModel.session,
    encoder2d,
    encoderRaw,
    config,
    vocab,
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
  const bekernOutput = tokensToBekern(tokens, vocab);

  // 6. Parse bekern to ScoreData
  const scoreData = parseBekern(bekernOutput);

  onProgress?.({ stage: 'postprocessing', currentPage: 1, totalPages: 1, percent: 100 });

  return {
    bekernOutput,
    scoreData,
    elapsedMs: Date.now() - startTime,
  };
}
