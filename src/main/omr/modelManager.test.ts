/**
 * Unit tests for ModelManager.
 * Mocks onnxruntime-node to test model lifecycle management without actual ONNX models.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───

const mockRelease = vi.fn();
const mockCreate = vi.fn().mockResolvedValue({
  inputNames: ['input'],
  outputNames: ['output'],
  release: mockRelease,
});

vi.mock('onnxruntime-node', () => ({
  InferenceSession: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
}));

vi.mock('fs', () => {
  const actual = vi.importActual('fs');
  return {
    ...actual,
    default: {
      existsSync: vi.fn().mockReturnValue(true),
      promises: {
        stat: vi.fn().mockResolvedValue({ size: 50 * 1024 * 1024 }), // 50MB
        mkdir: vi.fn().mockResolvedValue(undefined),
      },
    },
    existsSync: vi.fn().mockReturnValue(true),
    promises: {
      stat: vi.fn().mockResolvedValue({ size: 50 * 1024 * 1024 }),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// ─── Import after mocks ───

import { ModelManager } from './modelManager';
import fsModule from 'fs';

describe('ModelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      inputNames: ['input'],
      outputNames: ['output'],
      release: mockRelease,
    });
    // Re-apply default fs mocks after clearAllMocks
    vi.mocked(fsModule.existsSync).mockReturnValue(true);
    vi.mocked(fsModule.promises.stat).mockResolvedValue({ size: 50 * 1024 * 1024 } as any);
  });

  describe('constructor', () => {
    test('creates with default config', () => {
      const mgr = new ModelManager();
      expect(mgr.modelsDir).toBeDefined();
      expect(mgr.getMemoryUsage()).toBe(0);
    });

    test('accepts custom config', () => {
      const mgr = new ModelManager({
        modelsDir: '/custom/models',
        maxMemoryMB: 1024,
        preferredProvider: 'dml',
      });
      expect(mgr.modelsDir).toBe('/custom/models');
    });
  });

  describe('loadModel', () => {
    test('loads a model and returns LoadedModel', async () => {
      const mgr = new ModelManager({ modelsDir: '/models' });

      const loaded = await mgr.loadModel('test.onnx', 'test-model');

      expect(loaded.name).toBe('test-model');
      expect(loaded.session).toBeDefined();
      expect(loaded.memorySizeMB).toBeCloseTo(50, 0);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    test('returns cached session if already loaded', async () => {
      const mgr = new ModelManager({ modelsDir: '/models' });

      const first = await mgr.loadModel('test.onnx', 'test-model');
      const second = await mgr.loadModel('test.onnx', 'test-model');

      expect(first).toBe(second);
      expect(mockCreate).toHaveBeenCalledTimes(1); // Only called once
    });

    test('passes execution providers to onnxruntime', async () => {
      const mgr = new ModelManager({ modelsDir: '/models', preferredProvider: 'cpu' });

      await mgr.loadModel('test.onnx', 'test-model');

      const callArgs = mockCreate.mock.calls[0];
      const options = callArgs[1];
      expect(options.executionProviders).toEqual([{ name: 'cpu' }]);
    });

    test('uses DirectML + CPU fallback on Windows', async () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const mgr = new ModelManager({ modelsDir: '/models', preferredProvider: 'dml' });
      await mgr.loadModel('test.onnx', 'test-model');

      const callArgs = mockCreate.mock.calls[0];
      const options = callArgs[1];
      expect(options.executionProviders).toEqual([{ name: 'dml' }, { name: 'cpu' }]);

      Object.defineProperty(process, 'platform', { value: origPlatform });
    });

    test('throws when model file does not exist', async () => {
      vi.mocked(fsModule.existsSync).mockReturnValue(false);

      const mgr = new ModelManager({ modelsDir: '/models' });

      await expect(mgr.loadModel('missing.onnx', 'missing')).rejects.toThrow(
        'Model file not found',
      );
    });

    test('unloads existing models if memory limit exceeded', async () => {
      // 50MB per model, 80MB limit → second load should unload first
      const mgr = new ModelManager({ modelsDir: '/models', maxMemoryMB: 80 });

      await mgr.loadModel('model1.onnx', 'model1');
      expect(mgr.isLoaded('model1')).toBe(true);

      await mgr.loadModel('model2.onnx', 'model2');
      // model1 should have been unloaded to make room
      expect(mgr.isLoaded('model1')).toBe(false);
      expect(mgr.isLoaded('model2')).toBe(true);
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  describe('unloadModel', () => {
    test('releases session and removes from tracking', async () => {
      const mgr = new ModelManager({ modelsDir: '/models' });

      await mgr.loadModel('test.onnx', 'test-model');
      expect(mgr.isLoaded('test-model')).toBe(true);

      await mgr.unloadModel('test-model');
      expect(mgr.isLoaded('test-model')).toBe(false);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    test('no-ops for non-existent model', async () => {
      const mgr = new ModelManager({ modelsDir: '/models' });
      await mgr.unloadModel('nonexistent');
      expect(mockRelease).not.toHaveBeenCalled();
    });
  });

  describe('memory tracking', () => {
    test('tracks cumulative memory usage', async () => {
      const mgr = new ModelManager({ modelsDir: '/models' });

      await mgr.loadModel('model1.onnx', 'model1');
      expect(mgr.getMemoryUsage()).toBeCloseTo(50, 0);

      await mgr.loadModel('model2.onnx', 'model2');
      expect(mgr.getMemoryUsage()).toBeCloseTo(100, 0);
    });

    test('reduces memory after unload', async () => {
      const mgr = new ModelManager({ modelsDir: '/models' });

      await mgr.loadModel('model1.onnx', 'model1');
      await mgr.loadModel('model2.onnx', 'model2');
      expect(mgr.getMemoryUsage()).toBeCloseTo(100, 0);

      await mgr.unloadModel('model1');
      expect(mgr.getMemoryUsage()).toBeCloseTo(50, 0);
    });
  });

  describe('getLoadedModelNames', () => {
    test('returns names of all loaded models', async () => {
      const mgr = new ModelManager({ modelsDir: '/models' });

      await mgr.loadModel('a.onnx', 'alpha');
      await mgr.loadModel('b.onnx', 'beta');

      const names = mgr.getLoadedModelNames();
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
      expect(names).toHaveLength(2);
    });
  });

  describe('dispose', () => {
    test('releases all sessions', async () => {
      const mgr = new ModelManager({ modelsDir: '/models' });

      await mgr.loadModel('a.onnx', 'alpha');
      await mgr.loadModel('b.onnx', 'beta');

      await mgr.dispose();

      expect(mgr.isLoaded('alpha')).toBe(false);
      expect(mgr.isLoaded('beta')).toBe(false);
      expect(mgr.getMemoryUsage()).toBe(0);
      expect(mockRelease).toHaveBeenCalledTimes(2);
    });
  });
});
