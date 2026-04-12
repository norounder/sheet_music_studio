/**
 * Image preprocessing pipeline for OMR.
 * Converts input images to optimal format for recognition:
 * grayscale, contrast normalization, resolution normalization, denoising, binarization.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

/** Preprocessing options */
export interface PreprocessOptions {
  /** Target DPI for resolution normalization (default: 300) */
  targetDPI: number;
  /** Apply adaptive binarization (default: true) */
  binarize: boolean;
  /** Apply noise reduction (default: true) */
  denoise: boolean;
  /** Apply contrast normalization (default: true) */
  normalizeContrast: boolean;
}

/** Result of preprocessing */
export interface PreprocessResult {
  /** Path to the preprocessed image */
  processedPath: string;
  /** Original image dimensions */
  originalSize: { width: number; height: number };
  /** Processed image dimensions */
  processedSize: { width: number; height: number };
  /** Estimated DPI of the original image */
  dpiEstimate: number;
  /** List of applied preprocessing steps */
  appliedSteps: string[];
}

/** Default preprocessing options */
const DEFAULT_OPTIONS: PreprocessOptions = {
  targetDPI: 300,
  binarize: true,
  denoise: true,
  normalizeContrast: true,
};

/**
 * Estimate DPI from image metadata or dimensions.
 * Falls back to heuristic based on image width.
 */
function estimateDPI(metadata: sharp.Metadata): number {
  // sharp reports density in DPI if available
  if (metadata.density && metadata.density > 0) {
    return metadata.density;
  }

  // Heuristic: typical A4 sheet music scan
  // A4 width = 8.27 inches, so 300 DPI → ~2480px width
  const width = metadata.width ?? 0;
  if (width >= 3000) return 400;
  if (width >= 2000) return 300;
  if (width >= 1500) return 200;
  if (width >= 1000) return 150;
  return 100;
}

/**
 * Preprocess a sheet music image for optimal OMR recognition.
 *
 * Pipeline:
 * 1. Load and convert to grayscale
 * 2. Normalize contrast (CLAHE-like via linear stretch)
 * 3. Normalize resolution to target DPI
 * 4. Denoise with median filter
 * 5. Binarize with adaptive thresholding (via sharp threshold)
 */
export async function preprocessImage(
  inputPath: string,
  outputDir: string,
  options?: Partial<PreprocessOptions>,
): Promise<PreprocessResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const appliedSteps: string[] = [];

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input image not found: ${inputPath}`);
  }

  await fs.promises.mkdir(outputDir, { recursive: true });

  // Load image and get metadata
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error(`Invalid image dimensions: ${originalWidth}x${originalHeight}`);
  }

  const dpiEstimate = estimateDPI(metadata);

  // Build sharp pipeline
  let pipeline = sharp(inputPath);

  // Step 1: Convert to grayscale
  pipeline = pipeline.grayscale();
  appliedSteps.push('grayscale');

  // Step 2: Contrast normalization (linear stretch to full range)
  if (opts.normalizeContrast) {
    pipeline = pipeline.normalize();
    appliedSteps.push('contrast-normalize');
  }

  // Step 3: Resolution normalization
  if (dpiEstimate !== opts.targetDPI && dpiEstimate > 0) {
    const scale = opts.targetDPI / dpiEstimate;
    const newWidth = Math.round(originalWidth * scale);
    const newHeight = Math.round(originalHeight * scale);
    pipeline = pipeline.resize(newWidth, newHeight, {
      kernel: scale > 1 ? 'lanczos3' : 'lanczos3',
      withoutEnlargement: false,
    });
    appliedSteps.push(`resize-${opts.targetDPI}dpi`);
  }

  // Step 4: Denoise (median filter for salt-and-pepper noise)
  if (opts.denoise) {
    pipeline = pipeline.median(3);
    appliedSteps.push('denoise-median');
  }

  // Step 5: Binarize (threshold)
  if (opts.binarize) {
    pipeline = pipeline.threshold(128);
    appliedSteps.push('binarize');
  }

  // Output as PNG
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${baseName}_preprocessed.png`);

  const outputInfo = await pipeline.png().toFile(outputPath);

  return {
    processedPath: outputPath,
    originalSize: { width: originalWidth, height: originalHeight },
    processedSize: { width: outputInfo.width, height: outputInfo.height },
    dpiEstimate,
    appliedSteps,
  };
}

/**
 * Preprocess multiple images (e.g., pages from a PDF).
 * Returns results for each page in order.
 */
export async function preprocessImages(
  inputPaths: string[],
  outputDir: string,
  options?: Partial<PreprocessOptions>,
): Promise<PreprocessResult[]> {
  const results: PreprocessResult[] = [];
  for (const inputPath of inputPaths) {
    results.push(await preprocessImage(inputPath, outputDir, options));
  }
  return results;
}
