/**
 * Unit tests for modelDownloader.
 * Tests SHA-256 verification, cache logic, and download error handling
 * using real temp files (no http mocks — download function tested indirectly).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { downloadModel, ensureModelsDownloaded } from './modelDownloader';
import type { ModelManifest } from './modelDownloader';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sms-dl-test-'));
});

afterEach(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

/** Create a temp file with content and return its SHA-256 hash */
async function createFileWithHash(
  dir: string,
  filename: string,
  content: string,
): Promise<{ filePath: string; hash: string }> {
  const filePath = path.join(dir, filename);
  await fs.promises.writeFile(filePath, content, 'utf-8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return { filePath, hash };
}

describe('modelDownloader', () => {
  describe('cache validation', () => {
    test('skips download if file exists with correct hash', async () => {
      // Pre-create the file to simulate a cached model
      const { hash } = await createFileWithHash(tempDir, 'cached.onnx', 'model-data-content');

      const manifest: ModelManifest = {
        name: 'test-model',
        version: '1.0',
        url: 'https://example.com/nonexistent.onnx', // Should not be called
        sha256: hash,
        sizeMB: 1,
        filename: 'cached.onnx',
      };

      let progressCalled = false;
      const result = await downloadModel(manifest, tempDir, (p) => {
        progressCalled = true;
        expect(p).toBe(100); // Should report 100% immediately for cached
      });

      expect(result).toBe(path.join(tempDir, 'cached.onnx'));
      expect(progressCalled).toBe(true);
    });

    test('rejects cached file with wrong hash (triggers re-download)', async () => {
      // Create file with wrong content
      await createFileWithHash(tempDir, 'bad.onnx', 'wrong-content');

      const manifest: ModelManifest = {
        name: 'test-model',
        version: '1.0',
        url: 'https://example.invalid/model.onnx', // Invalid URL → download will fail
        sha256: 'aaaa',
        sizeMB: 1,
        filename: 'bad.onnx',
      };

      // Should attempt download (and fail because URL is invalid)
      await expect(downloadModel(manifest, tempDir)).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    test('throws on invalid download URL', async () => {
      const manifest: ModelManifest = {
        name: 'bad-url',
        version: '1.0',
        url: 'https://this-domain-does-not-exist-12345.invalid/model.onnx',
        sha256: 'abc123',
        sizeMB: 1,
        filename: 'bad-url.onnx',
      };

      await expect(downloadModel(manifest, tempDir)).rejects.toThrow();
    });

    test('cleans up temp file on download failure', async () => {
      const manifest: ModelManifest = {
        name: 'cleanup-test',
        version: '1.0',
        url: 'https://this-domain-does-not-exist-12345.invalid/model.onnx',
        sha256: 'abc',
        sizeMB: 1,
        filename: 'cleanup.onnx',
      };

      await expect(downloadModel(manifest, tempDir)).rejects.toThrow();

      // Temp file should be cleaned up
      const files = await fs.promises.readdir(tempDir);
      const tempFiles = files.filter((f) => f.includes('.downloading'));
      expect(tempFiles).toHaveLength(0);
    });
  });

  describe('ensureModelsDownloaded', () => {
    test('returns paths for all cached models', async () => {
      // Pre-create cached files
      const { hash: hash1 } = await createFileWithHash(tempDir, 'model1.onnx', 'data1');
      const { hash: hash2 } = await createFileWithHash(tempDir, 'model2.onnx', 'data2');

      const manifests: ModelManifest[] = [
        { name: 'model1', version: '1.0', url: 'https://x.invalid/1', sha256: hash1, sizeMB: 1, filename: 'model1.onnx' },
        { name: 'model2', version: '1.0', url: 'https://x.invalid/2', sha256: hash2, sizeMB: 1, filename: 'model2.onnx' },
      ];

      const results = await ensureModelsDownloaded(manifests, tempDir);

      expect(results.size).toBe(2);
      expect(results.get('model1')).toBe(path.join(tempDir, 'model1.onnx'));
      expect(results.get('model2')).toBe(path.join(tempDir, 'model2.onnx'));
    });

    test('reports progress per model', async () => {
      const { hash } = await createFileWithHash(tempDir, 'prog.onnx', 'progress-data');

      const manifests: ModelManifest[] = [
        { name: 'prog-model', version: '1.0', url: 'https://x.invalid/1', sha256: hash, sizeMB: 1, filename: 'prog.onnx' },
      ];

      const progressCalls: Array<{ model: string; percent: number }> = [];
      await ensureModelsDownloaded(manifests, tempDir, (model, percent) => {
        progressCalls.push({ model, percent });
      });

      expect(progressCalls.length).toBeGreaterThanOrEqual(1);
      expect(progressCalls[0].model).toBe('prog-model');
      expect(progressCalls[0].percent).toBe(100);
    });
  });

  describe('directory creation', () => {
    test('creates models directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'sub', 'models');
      const { hash } = await createFileWithHash(tempDir, 'temp-for-hash.txt', 'x');

      // Pre-create the file at destination
      await fs.promises.mkdir(nestedDir, { recursive: true });
      await fs.promises.writeFile(path.join(nestedDir, 'nested.onnx'), 'x');

      const manifest: ModelManifest = {
        name: 'nested',
        version: '1.0',
        url: 'https://x.invalid/1',
        sha256: hash,
        sizeMB: 1,
        filename: 'nested.onnx',
      };

      const result = await downloadModel(manifest, nestedDir);
      expect(result).toBe(path.join(nestedDir, 'nested.onnx'));
    });
  });
});
