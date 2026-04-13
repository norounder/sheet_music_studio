/**
 * Unit tests for pdfConverter.
 * Tests utility functions and image passthrough logic.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { isPdfFile, pdfToImages } from './pdfConverter';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sms-pdf-test-'));
});

afterEach(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

describe('pdfConverter', () => {
  describe('isPdfFile', () => {
    test('returns true for .pdf extension', () => {
      expect(isPdfFile('/path/to/score.pdf')).toBe(true);
      expect(isPdfFile('C:\\Users\\test\\doc.PDF')).toBe(true);
    });

    test('returns false for image extensions', () => {
      expect(isPdfFile('/path/to/score.png')).toBe(false);
      expect(isPdfFile('/path/to/score.jpg')).toBe(false);
      expect(isPdfFile('/path/to/score.jpeg')).toBe(false);
      expect(isPdfFile('/path/to/score.tiff')).toBe(false);
      expect(isPdfFile('/path/to/score.bmp')).toBe(false);
    });

    test('returns false for other extensions', () => {
      expect(isPdfFile('/path/to/score.xml')).toBe(false);
      expect(isPdfFile('/path/to/score.musicxml')).toBe(false);
      expect(isPdfFile('/path/to/score.txt')).toBe(false);
    });
  });

  describe('pdfToImages with image input (passthrough)', () => {
    test('converts image input to PNG as single page', async () => {
      // Create a test PNG image
      const inputPath = path.join(tempDir, 'test.png');
      await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toFile(inputPath);

      const outputDir = path.join(tempDir, 'output');
      const result = await pdfToImages(inputPath, outputDir);

      expect(result).toHaveLength(1);
      expect(fs.existsSync(result[0])).toBe(true);

      const meta = await sharp(result[0]).metadata();
      expect(meta.format).toBe('png');
    });

    test('converts JPEG input to PNG', async () => {
      const inputPath = path.join(tempDir, 'test.jpg');
      await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 200, b: 200 } },
      }).jpeg().toFile(inputPath);

      const outputDir = path.join(tempDir, 'output');
      const result = await pdfToImages(inputPath, outputDir);

      expect(result).toHaveLength(1);
      const meta = await sharp(result[0]).metadata();
      expect(meta.format).toBe('png');
    });
  });

  describe('error handling', () => {
    test('throws for non-existent file', async () => {
      await expect(
        pdfToImages('/nonexistent/file.pdf', path.join(tempDir, 'out')),
      ).rejects.toThrow('PDF file not found');
    });

    test('throws for unsupported file extension', async () => {
      const inputPath = path.join(tempDir, 'test.docx');
      await fs.promises.writeFile(inputPath, 'not a real file');

      await expect(
        pdfToImages(inputPath, path.join(tempDir, 'out')),
      ).rejects.toThrow('Unsupported file format');
    });

    test('creates output directory if it does not exist', async () => {
      const inputPath = path.join(tempDir, 'test.png');
      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      }).png().toFile(inputPath);

      const outputDir = path.join(tempDir, 'nested', 'deep', 'output');
      const result = await pdfToImages(inputPath, outputDir);

      expect(result).toHaveLength(1);
      expect(fs.existsSync(outputDir)).toBe(true);
    });
  });

  describe('PDF input (requires pdftoppm)', () => {
    test('throws descriptive error when pdftoppm is not available', async () => {
      // Create a dummy PDF file (just need the .pdf extension)
      const inputPath = path.join(tempDir, 'test.pdf');
      await fs.promises.writeFile(inputPath, '%PDF-1.4 dummy content');

      const outputDir = path.join(tempDir, 'out');

      // pdftoppm is likely not installed in CI/test env
      // Should throw with helpful message about Audiveris
      await expect(
        pdfToImages(inputPath, outputDir),
      ).rejects.toThrow(/PDF|pdftoppm|Poppler|Audiveris/);
    });
  });
});
