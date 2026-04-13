/**
 * Model download and cache manager.
 * Downloads ONNX model files from remote URLs, verifies integrity via SHA-256,
 * and caches them in the user's data directory.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import crypto from 'crypto';

/** Manifest entry describing a downloadable model */
export interface ModelManifest {
  /** Model identifier */
  name: string;
  /** Model version string */
  version: string;
  /** Download URL (HTTPS) */
  url: string;
  /** Expected SHA-256 hash of the file */
  sha256: string;
  /** Expected file size in MB (for progress reporting) */
  sizeMB: number;
  /** Filename to save as */
  filename: string;
}

/** Download progress callback */
export type DownloadProgressCallback = (percent: number) => void;

/**
 * Compute SHA-256 hash of a file.
 */
async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Download a file from a URL with progress tracking.
 * Follows redirects (up to 5 hops).
 */
function downloadFile(
  url: string,
  destPath: string,
  onProgress?: DownloadProgressCallback,
  maxRedirects = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.destroy();
        downloadFile(response.headers.location, destPath, onProgress, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.destroy();
        reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'] ?? '0', 10);
      let downloadedBytes = 0;

      const file = fs.createWriteStream(destPath);
      response.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes > 0) {
          onProgress(Math.round((downloadedBytes / totalBytes) * 100));
        }
      });

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(new Error(`Download request failed: ${err.message}`));
    });
  });
}

/**
 * Check if a model file exists and has the correct hash.
 */
async function isModelCached(filePath: string, expectedHash: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;

  try {
    const hash = await computeFileHash(filePath);
    return hash === expectedHash;
  } catch {
    return false;
  }
}

/**
 * Ensure a single model is downloaded and cached.
 * Skips download if the file already exists with the correct hash.
 */
export async function downloadModel(
  manifest: ModelManifest,
  modelsDir: string,
  onProgress?: DownloadProgressCallback,
): Promise<string> {
  // Ensure models directory exists
  await fs.promises.mkdir(modelsDir, { recursive: true });

  const destPath = path.join(modelsDir, manifest.filename);

  // Check if already cached with correct hash
  if (await isModelCached(destPath, manifest.sha256)) {
    onProgress?.(100);
    return destPath;
  }

  // Download to a temp file first, then rename
  const tempPath = destPath + '.downloading';
  try {
    await downloadFile(manifest.url, tempPath, onProgress);

    // Verify hash
    const hash = await computeFileHash(tempPath);
    if (hash !== manifest.sha256) {
      await fs.promises.unlink(tempPath).catch(() => {});
      throw new Error(
        `Hash mismatch for ${manifest.name}: expected ${manifest.sha256}, got ${hash}`,
      );
    }

    // Move to final location
    await fs.promises.rename(tempPath, destPath);
    return destPath;
  } catch (err) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw err;
  }
}

/**
 * Ensure all models from a manifest list are downloaded.
 * Returns a map of model name → file path.
 */
export async function ensureModelsDownloaded(
  manifests: ModelManifest[],
  modelsDir: string,
  onProgress?: (modelName: string, percent: number) => void,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const manifest of manifests) {
    const filePath = await downloadModel(
      manifest,
      modelsDir,
      (percent) => onProgress?.(manifest.name, percent),
    );
    results.set(manifest.name, filePath);
  }

  return results;
}
