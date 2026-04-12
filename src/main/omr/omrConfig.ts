/**
 * OMR configuration loader.
 * Reads config/omr.json for user-overridable settings.
 * Falls back to auto-detection when values are "auto" or missing.
 */

import fs from 'fs';
import path from 'path';

/** OMR engine mode */
export type EngineMode = 'auto' | 'audiveris-only' | 'smt-only';

/** Inference provider */
export type InferenceProvider = 'auto' | 'dml' | 'cpu';

/** Full OMR configuration */
export interface OMRConfig {
  engine: {
    mode: EngineMode;
  };
  inference: {
    provider: InferenceProvider;
    threads: number;
  };
  smt: {
    maxTokens: number;
  };
  preprocessing: {
    enabled: boolean;
    targetDPI: number;
    binarize: boolean;
    denoise: boolean;
    normalizeContrast: boolean;
  };
}

/** Default configuration */
const DEFAULT_CONFIG: OMRConfig = {
  engine: { mode: 'auto' },
  inference: { provider: 'auto', threads: 0 },
  smt: { maxTokens: 1512 },
  preprocessing: {
    enabled: true,
    targetDPI: 300,
    binarize: true,
    denoise: true,
    normalizeContrast: true,
  },
};

let cachedConfig: OMRConfig | null = null;

/**
 * Resolve the actual execution provider based on config and platform.
 */
export function resolveProvider(provider: InferenceProvider): 'dml' | 'cpu' {
  if (provider === 'dml') return 'dml';
  if (provider === 'cpu') return 'cpu';

  // Auto-detect: use DirectML on Windows (GPU available), CPU elsewhere
  if (process.platform === 'win32') {
    return 'dml';
  }
  return 'cpu';
}

/**
 * Load OMR configuration from config/omr.json.
 * Falls back to defaults for any missing values.
 */
export function loadOMRConfig(projectRoot?: string): OMRConfig {
  if (cachedConfig) return cachedConfig;

  const root = projectRoot ?? process.cwd();
  const configPath = path.join(root, 'config', 'omr.json');

  if (!fs.existsSync(configPath)) {
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    cachedConfig = {
      engine: {
        mode: raw.engine?.mode ?? DEFAULT_CONFIG.engine.mode,
      },
      inference: {
        provider: raw.inference?.provider ?? DEFAULT_CONFIG.inference.provider,
        threads: raw.inference?.threads ?? DEFAULT_CONFIG.inference.threads,
      },
      smt: {
        maxTokens: raw.smt?.maxTokens ?? DEFAULT_CONFIG.smt.maxTokens,
      },
      preprocessing: {
        enabled: raw.preprocessing?.enabled ?? DEFAULT_CONFIG.preprocessing.enabled,
        targetDPI: raw.preprocessing?.targetDPI ?? DEFAULT_CONFIG.preprocessing.targetDPI,
        binarize: raw.preprocessing?.binarize ?? DEFAULT_CONFIG.preprocessing.binarize,
        denoise: raw.preprocessing?.denoise ?? DEFAULT_CONFIG.preprocessing.denoise,
        normalizeContrast: raw.preprocessing?.normalizeContrast ?? DEFAULT_CONFIG.preprocessing.normalizeContrast,
      },
    };
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  return cachedConfig;
}

/** Reset cached config (for testing or config reload) */
export function resetOMRConfig(): void {
  cachedConfig = null;
}
