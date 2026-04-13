/**
 * ONNX Runtime model manager.
 * Handles model loading, unloading, memory tracking, and execution provider selection.
 * Replaces the N-API native bridge with onnxruntime-node for cross-platform inference.
 */

import * as ort from 'onnxruntime-node';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/** Configuration for ModelManager */
export interface ModelManagerConfig {
  /** Directory where ONNX models are stored */
  modelsDir: string;
  /** Maximum total memory for loaded models in MB (default: 2048) */
  maxMemoryMB: number;
  /** Preferred execution provider: 'dml' (DirectML/Windows) or 'cpu' */
  preferredProvider: 'dml' | 'cpu';
}

/** Information about a loaded model */
export interface LoadedModel {
  /** ONNX Runtime inference session */
  session: ort.InferenceSession;
  /** Model identifier */
  name: string;
  /** Estimated memory usage in MB */
  memorySizeMB: number;
}

/** Options for loading a model */
export interface ModelLoadOptions {
  /** Override execution provider for this model */
  provider?: 'dml' | 'cpu';
  /** Number of intra-op threads (default: 0 = auto) */
  intraOpThreads?: number;
}

/** Default models directory inside userData */
const MODELS_SUBDIR = 'models';

/**
 * Detect the best available execution provider for the current platform.
 */
function detectProvider(preferred: 'dml' | 'cpu'): ort.InferenceSession.ExecutionProviderConfig[] {
  if (preferred === 'dml' && process.platform === 'win32') {
    // DirectML available on Windows via onnxruntime-node prebuilt
    return [{ name: 'dml' }, { name: 'cpu' }];
  }
  return [{ name: 'cpu' }];
}

/**
 * Manages ONNX model lifecycle: loading, inference session creation,
 * memory tracking, and cleanup.
 */
export class ModelManager {
  private readonly config: ModelManagerConfig;
  private readonly models = new Map<string, LoadedModel>();

  constructor(config?: Partial<ModelManagerConfig>) {
    const defaultModelsDir = app?.isPackaged
      ? path.join(app.getPath('userData'), MODELS_SUBDIR)
      : path.join(process.cwd(), MODELS_SUBDIR);

    this.config = {
      modelsDir: config?.modelsDir ?? defaultModelsDir,
      maxMemoryMB: config?.maxMemoryMB ?? 2048,
      preferredProvider: config?.preferredProvider ?? 'cpu',
    };
  }

  /** Get the models directory path */
  get modelsDir(): string {
    return this.config.modelsDir;
  }

  /**
   * Load an ONNX model and create an inference session.
   * Automatically unloads other models if memory limit would be exceeded.
   */
  async loadModel(
    modelPath: string,
    name: string,
    options?: ModelLoadOptions,
  ): Promise<LoadedModel> {
    // Return existing session if already loaded
    if (this.models.has(name)) {
      return this.models.get(name)!;
    }

    // Resolve model path
    const resolvedPath = path.isAbsolute(modelPath)
      ? modelPath
      : path.join(this.config.modelsDir, modelPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Model file not found: ${resolvedPath}`);
    }

    // Estimate memory from file size (model in memory ≈ file size)
    const stats = await fs.promises.stat(resolvedPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    // Check memory limit — unload existing models if needed
    const currentUsage = this.getMemoryUsage();
    if (currentUsage + fileSizeMB > this.config.maxMemoryMB) {
      await this.unloadAll();
    }

    // Create session with appropriate execution provider
    const provider = options?.provider ?? this.config.preferredProvider;
    const executionProviders = detectProvider(provider);

    const sessionOptions: ort.InferenceSession.SessionOptions = {
      executionProviders,
      graphOptimizationLevel: 'all',
    };

    if (options?.intraOpThreads !== undefined) {
      sessionOptions.intraOpNumThreads = options.intraOpThreads;
    }

    const session = await ort.InferenceSession.create(resolvedPath, sessionOptions);

    const loaded: LoadedModel = {
      session,
      name,
      memorySizeMB: fileSizeMB,
    };

    this.models.set(name, loaded);
    return loaded;
  }

  /** Unload a specific model and release its session */
  async unloadModel(name: string): Promise<void> {
    const model = this.models.get(name);
    if (model) {
      await model.session.release();
      this.models.delete(name);
    }
  }

  /** Unload all loaded models */
  async unloadAll(): Promise<void> {
    for (const [name] of this.models) {
      await this.unloadModel(name);
    }
  }

  /** Check if a model is currently loaded */
  isLoaded(name: string): boolean {
    return this.models.has(name);
  }

  /** Get a loaded model's session */
  getModel(name: string): LoadedModel | undefined {
    return this.models.get(name);
  }

  /** Get total estimated memory usage of all loaded models in MB */
  getMemoryUsage(): number {
    let total = 0;
    for (const model of this.models.values()) {
      total += model.memorySizeMB;
    }
    return total;
  }

  /** Get list of loaded model names */
  getLoadedModelNames(): string[] {
    return Array.from(this.models.keys());
  }

  /** Dispose all sessions and clean up */
  async dispose(): Promise<void> {
    await this.unloadAll();
  }
}
