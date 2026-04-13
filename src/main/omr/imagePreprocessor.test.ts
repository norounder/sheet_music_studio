/**
 * Unit tests for imagePreprocessor.
 * Creates real test images with sharp, runs them through the pipeline,
 * and verifies output properties.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { preprocessImage, preprocessImages } from './imagePreprocessor';

let tempDir: string;
let inputDir: string;
let outputDir: string;

beforeEach(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sms-preproc-test-'));
  inputDir = path.join(tempDir, 'input');
  outputDir = path.join(tempDir, 'output');
  await fs.promises.mkdir(inputDir, { recursive: true });
  await fs.promises.mkdir(outputDir, { recursive: true });
});

afterEach(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

/** Create a simple test PNG with sharp */
async function createTestImage(
  filename: string,
  width: number,
  height: number,
  color: { r: number; g: number; b: number } = { r: 128, g: 128, b: 128 },
): Promise<string> {
  const filePath = path.join(inputDir, filename);
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toFile(filePath);
  return filePath;
}

describe('imagePreprocessor', () => {
  describe('basic preprocessing', () => {
    test('processes a color image and outputs grayscale PNG', async () => {
      const inputPath = await createTestImage('color.png', 800, 600, { r: 200, g: 100, b: 50 });

      const result = await preprocessImage(inputPath, outputDir);

      // Output file should exist
      expect(fs.existsSync(result.processedPath)).toBe(true);
      expect(result.processedPath).toMatch(/\.png$/);

      // Check output is valid image
      const outputMeta = await sharp(result.processedPath).metadata();
      expect(outputMeta.width).toBeGreaterThan(0);
      expect(outputMeta.height).toBeGreaterThan(0);
    });

    test('returns correct original dimensions', async () => {
      const inputPath = await createTestImage('dims.png', 1200, 900);

      const result = await preprocessImage(inputPath, outputDir);

      expect(result.originalSize.width).toBe(1200);
      expect(result.originalSize.height).toBe(900);
    });

    test('records applied steps', async () => {
      const inputPath = await createTestImage('steps.png', 800, 600);

      const result = await preprocessImage(inputPath, outputDir);

      expect(result.appliedSteps).toContain('grayscale');
      expect(result.appliedSteps).toContain('contrast-normalize');
      expect(result.appliedSteps).toContain('denoise-median');
      expect(result.appliedSteps).toContain('binarize');
    });

    test('estimates DPI from image dimensions', async () => {
      // 2400px wide ≈ A4 at 300 DPI
      const inputPath = await createTestImage('dpi.png', 2400, 3300);

      const result = await preprocessImage(inputPath, outputDir);

      expect(result.dpiEstimate).toBeGreaterThanOrEqual(200);
    });
  });

  describe('options', () => {
    test('skips binarization when disabled', async () => {
      const inputPath = await createTestImage('no-bin.png', 800, 600);

      const result = await preprocessImage(inputPath, outputDir, { binarize: false });

      expect(result.appliedSteps).not.toContain('binarize');
      expect(result.appliedSteps).toContain('grayscale');
    });

    test('skips denoising when disabled', async () => {
      const inputPath = await createTestImage('no-noise.png', 800, 600);

      const result = await preprocessImage(inputPath, outputDir, { denoise: false });

      expect(result.appliedSteps).not.toContain('denoise-median');
    });

    test('skips contrast normalization when disabled', async () => {
      const inputPath = await createTestImage('no-contrast.png', 800, 600);

      const result = await preprocessImage(inputPath, outputDir, { normalizeContrast: false });

      expect(result.appliedSteps).not.toContain('contrast-normalize');
    });
  });

  describe('output format', () => {
    test('output pixels are grayscale after preprocessing', async () => {
      const inputPath = await createTestImage('gray-check.png', 800, 600, { r: 255, g: 0, b: 0 });

      const result = await preprocessImage(inputPath, outputDir);

      // Verify output is valid by reading raw pixel data
      const { data, info } = await sharp(result.processedPath)
        .raw()
        .toBuffer({ resolveWithObject: true });

      // After grayscale + binarize, all pixels should be either 0 or 255
      // Check first pixel: R == G == B (grayscale property)
      const channels = info.channels;
      if (channels >= 3) {
        const r = data[0];
        const g = data[1];
        const b = data[2];
        expect(r).toBe(g);
        expect(g).toBe(b);
      }
      // All pixel values should be 0 or 255 (binarized)
      for (let i = 0; i < Math.min(data.length, 100); i++) {
        expect(data[i] === 0 || data[i] === 255).toBe(true);
      }
    });

    test('output filename includes _preprocessed suffix', async () => {
      const inputPath = await createTestImage('myscore.png', 800, 600);

      const result = await preprocessImage(inputPath, outputDir);

      expect(path.basename(result.processedPath)).toBe('myscore_preprocessed.png');
    });
  });

  describe('error handling', () => {
    test('throws for non-existent input file', async () => {
      await expect(
        preprocessImage('/nonexistent/image.png', outputDir),
      ).rejects.toThrow('Input image not found');
    });

    test('creates output directory if it does not exist', async () => {
      const inputPath = await createTestImage('auto-dir.png', 800, 600);
      const newOutputDir = path.join(tempDir, 'auto', 'created');

      const result = await preprocessImage(inputPath, newOutputDir);

      expect(fs.existsSync(result.processedPath)).toBe(true);
    });
  });

  describe('preprocessImages (batch)', () => {
    test('processes multiple images in order', async () => {
      const img1 = await createTestImage('page1.png', 800, 600);
      const img2 = await createTestImage('page2.png', 1000, 800);

      const results = await preprocessImages([img1, img2], outputDir);

      expect(results).toHaveLength(2);
      expect(results[0].originalSize.width).toBe(800);
      expect(results[1].originalSize.width).toBe(1000);
      expect(fs.existsSync(results[0].processedPath)).toBe(true);
      expect(fs.existsSync(results[1].processedPath)).toBe(true);
    });
  });
});
