/**
 * Audiveris runtime detection and configuration.
 *
 * Supports two modes:
 * 1. Native executable (v5.10+): Audiveris.exe (Windows) / Audiveris.app (macOS)
 * 2. Legacy JAR mode (v5.3-5.9): java -jar Audiveris.jar
 *
 * Native mode is preferred — no separate Java installation required.
 */

import { execFile } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** How Audiveris will be invoked */
export type AudiverisMode = 'native' | 'jar';

/** Audiveris runtime status */
export interface AudiverisStatus {
  available: boolean;
  mode?: AudiverisMode;
  executablePath?: string;
  javaFound?: boolean;
  javaVersion?: string;
  error?: string;
}

/** Audiveris configuration for subprocess execution */
export interface AudiverisConfig {
  mode: AudiverisMode;
  /** Path to native executable (mode=native) or java binary (mode=jar) */
  executablePath: string;
  /** Path to JAR file (mode=jar only) */
  jarPath?: string;
}

/** Minimum Java version for legacy JAR mode */
const MIN_JAVA_VERSION = 17;

// ─── Native Executable Detection ───

/**
 * Find Audiveris native executable on the system.
 */
async function findNativeExecutable(): Promise<string | null> {
  const candidates: string[] = [];

  if (process.platform === 'win32') {
    // Windows: Program Files installation
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    candidates.push(path.join(programFiles, 'Audiveris', 'Audiveris.exe'));
    // Also check x86
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    candidates.push(path.join(pf86, 'Audiveris', 'Audiveris.exe'));
    // AUDIVERIS_HOME env
    if (process.env.AUDIVERIS_HOME) {
      candidates.push(path.join(process.env.AUDIVERIS_HOME, 'Audiveris.exe'));
    }
  } else if (process.platform === 'darwin') {
    // macOS: /Applications or user Applications
    candidates.push('/Applications/Audiveris.app/Contents/MacOS/Audiveris');
    const home = process.env.HOME ?? '';
    if (home) {
      candidates.push(path.join(home, 'Applications', 'Audiveris.app', 'Contents', 'MacOS', 'Audiveris'));
    }
    if (process.env.AUDIVERIS_HOME) {
      candidates.push(path.join(process.env.AUDIVERIS_HOME, 'Audiveris'));
    }
  } else {
    // Linux
    candidates.push('/usr/bin/audiveris');
    candidates.push('/usr/local/bin/audiveris');
    if (process.env.AUDIVERIS_HOME) {
      candidates.push(path.join(process.env.AUDIVERIS_HOME, 'audiveris'));
    }
  }

  // Also check PATH
  candidates.push('audiveris');

  for (const candidate of candidates) {
    try {
      if (candidate === 'audiveris') {
        // Check in PATH
        await execFileAsync(candidate, ['-help'], { timeout: 10_000 });
        return candidate;
      }
      await fs.promises.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Not found, try next
    }
  }

  return null;
}

// ─── Legacy JAR Detection ───

/**
 * Find Java executable on the system.
 */
async function findJava(): Promise<{ path: string; version: string } | null> {
  const candidates: string[] = [];

  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java'));
  }
  candidates.push('java');

  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    for (const dir of [
      path.join(programFiles, 'Java'),
      path.join(programFiles, 'Eclipse Adoptium'),
      path.join(programFiles, 'Microsoft', 'jdk'),
    ]) {
      try {
        const entries = await fs.promises.readdir(dir);
        for (const entry of entries) {
          candidates.push(path.join(dir, entry, 'bin', 'java.exe'));
        }
      } catch { /* skip */ }
    }
  }

  for (const candidate of candidates) {
    try {
      const { stderr } = await execFileAsync(candidate, ['-version'], { timeout: 10_000 });
      const version = parseJavaVersion(stderr);
      if (version) return { path: candidate, version };
    } catch { /* next */ }
  }

  return null;
}

function parseJavaVersion(output: string): string | null {
  const match = output.match(/version\s+"?(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  const major = parseInt(match[1], 10);
  const effectiveMajor = major === 1 ? parseInt(match[2] ?? '0', 10) : major;
  if (effectiveMajor < MIN_JAVA_VERSION) return null;
  return match[0].replace(/version\s+"?/, '').replace(/"$/, '');
}

/**
 * Find Audiveris JAR file on the system (legacy mode).
 */
async function findAudiverisJar(): Promise<string | null> {
  const candidates: string[] = [];

  // User data directory
  try {
    const userDataDir = path.join(app.getPath('userData'), 'audiveris');
    const entries = await fs.promises.readdir(userDataDir);
    const jar = entries.find((e) => e.toLowerCase().startsWith('audiveris') && e.endsWith('.jar'));
    if (jar) candidates.push(path.join(userDataDir, jar));
  } catch { /* skip */ }

  // Bundled resources
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'audiveris', 'Audiveris.jar'));
  }

  // AUDIVERIS_HOME
  if (process.env.AUDIVERIS_HOME) {
    candidates.push(path.join(process.env.AUDIVERIS_HOME, 'Audiveris.jar'));
    candidates.push(path.join(process.env.AUDIVERIS_HOME, 'lib', 'Audiveris.jar'));
  }

  for (const candidate of candidates) {
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch { /* next */ }
  }

  return null;
}

// ─── Public API ───

/**
 * Detect Audiveris availability.
 * Tries native executable first, falls back to Java + JAR.
 */
export async function detectAudiveris(): Promise<AudiverisStatus> {
  // 1. Try native executable (preferred)
  const nativePath = await findNativeExecutable();
  if (nativePath) {
    return {
      available: true,
      mode: 'native',
      executablePath: nativePath,
    };
  }

  // 2. Fallback to Java + JAR
  const java = await findJava();
  if (!java) {
    return {
      available: false,
      javaFound: false,
      error: 'Audiveris not found. Install from https://github.com/Audiveris/audiveris/releases',
    };
  }

  const jarPath = await findAudiverisJar();
  if (!jarPath) {
    return {
      available: false,
      javaFound: true,
      javaVersion: java.version,
      error: 'Java found but Audiveris JAR not found. Install Audiveris or set AUDIVERIS_HOME.',
    };
  }

  return {
    available: true,
    mode: 'jar',
    executablePath: java.path,
    javaFound: true,
    javaVersion: java.version,
  };
}

/**
 * Get Audiveris configuration for subprocess execution.
 */
export async function getAudiverisConfig(): Promise<AudiverisConfig> {
  const status = await detectAudiveris();
  if (!status.available || !status.mode) {
    throw new Error(status.error ?? 'Audiveris is not available.');
  }

  if (status.mode === 'native') {
    return {
      mode: 'native',
      executablePath: status.executablePath!,
    };
  }

  // JAR mode
  const jarPath = await findAudiverisJar();
  if (!jarPath) {
    throw new Error('Audiveris JAR not found.');
  }

  return {
    mode: 'jar',
    executablePath: status.executablePath!,
    jarPath,
  };
}
