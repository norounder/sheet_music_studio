/**
 * PDF to image converter for OMR pipeline.
 * Converts each page of a PDF file to individual PNG images.
 * Uses Electron's built-in PDF rendering capabilities.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Convert a PDF file to individual page images using pdf-parse + sharp.
 * Falls back to a simpler approach using external tools if available.
 *
 * For MVP, uses Electron's ability to render PDFs or the Audiveris
 * built-in PDF handling. This module provides a standalone conversion
 * path for the SMT++ pipeline which needs raw images.
 */

/** Options for PDF conversion */
export interface PdfConvertOptions {
  /** Output DPI (default: 300) */
  dpi: number;
  /** Output format */
  format: 'png' | 'jpeg';
}

const DEFAULT_PDF_OPTIONS: PdfConvertOptions = {
  dpi: 300,
  format: 'png',
};

/**
 * Check if a file is a PDF based on its extension.
 */
export function isPdfFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

/**
 * Convert PDF pages to individual images.
 *
 * Strategy:
 * - Audiveris handles PDF natively, so for the Audiveris path this is not needed.
 * - For the SMT++ path, we use a lightweight approach:
 *   1. If the input is already an image, return it as-is.
 *   2. If the input is a PDF, delegate to Audiveris for conversion
 *      or use the system's PDF rendering if available.
 *
 * Note: Full PDF→image conversion without external dependencies is complex.
 * For MVP, the SMT++ runner will only process image inputs directly.
 * PDF inputs go through Audiveris which handles PDF natively.
 */
export async function pdfToImages(
  pdfPath: string,
  outputDir: string,
  options?: Partial<PdfConvertOptions>,
): Promise<string[]> {
  const opts = { ...DEFAULT_PDF_OPTIONS, ...options };

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  await fs.promises.mkdir(outputDir, { recursive: true });

  // Check if this is actually an image file masquerading with wrong extension
  const ext = path.extname(pdfPath).toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp'];
  if (imageExts.includes(ext)) {
    // Already an image — just copy it
    const outputPath = path.join(outputDir, `page_1.${opts.format}`);
    await sharp(pdfPath)
      .toFormat(opts.format)
      .toFile(outputPath);
    return [outputPath];
  }

  if (ext !== '.pdf') {
    throw new Error(`Unsupported file format: ${ext}. Expected PDF or image.`);
  }

  // For PDF files, we attempt to use poppler's pdftoppm if available on the system,
  // otherwise throw a descriptive error directing to use Audiveris (which handles PDF natively)
  try {
    return await convertWithSystemTool(pdfPath, outputDir, opts);
  } catch {
    throw new Error(
      'PDF to image conversion requires Poppler (pdftoppm) or similar tool. ' +
      'For PDF input, the Audiveris engine handles PDF natively. ' +
      'SMT++ engine requires image input — please convert the PDF to images first.',
    );
  }
}

/**
 * Attempt PDF conversion using system-installed pdftoppm (Poppler).
 */
async function convertWithSystemTool(
  pdfPath: string,
  outputDir: string,
  opts: PdfConvertOptions,
): Promise<string[]> {
  const { spawn } = await import('child_process');
  const baseName = path.join(outputDir, 'page');

  return new Promise((resolve, reject) => {
    const args = [
      '-r', opts.dpi.toString(),
      '-png',
      pdfPath,
      baseName,
    ];

    const proc = spawn('pdftoppm', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`pdftoppm failed (code ${code}): ${stderr}`));
        return;
      }

      // Collect generated page images
      try {
        const files = await fs.promises.readdir(outputDir);
        const pageFiles = files
          .filter((f) => f.startsWith('page') && f.endsWith('.png'))
          .sort()
          .map((f) => path.join(outputDir, f));

        if (pageFiles.length === 0) {
          reject(new Error('No page images generated from PDF'));
          return;
        }

        resolve(pageFiles);
      } catch (err) {
        reject(err);
      }
    });

    proc.on('error', () => {
      reject(new Error('pdftoppm not found. Install Poppler for PDF conversion.'));
    });
  });
}
