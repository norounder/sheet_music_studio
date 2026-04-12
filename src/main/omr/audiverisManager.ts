/**
 * Audiveris runtime detection and configuration.
 * Detects Java 17+ and Audiveris JAR on the system.
 */

import { execFile } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Audiveris runtime status */
export interface AudiverisStatus {
  available: boolean;
  javaFound: boolean;
  javaVersion?: string;
  audiverisFound: boolean;
  audiverisPath?: string;
  error?: string;
}

/** Audiveris configuration for subprocess execution */
export interface AudiverisConfig {
  javaPath: string;
  audiverisJarPath: string;
}

/** Minimum required Java version for Audiveris 5.3+ */
const MIN_JAVA_VERSION = 17;

/**
 * Detect Java executable on the system.
 * Searches JAVA_HOME, PATH, and common installation directories.
 */
async function findJava(): Promise<{ path: string; version: string } | null> {
  const candidates: string[] = [];

  // 1. JAVA_HOME
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    candidates.push(path.join(javaHome, 'bin', 'java'));
  }

  // 2. PATH (default)
  candidates.push('java');

  // 3. Common install locations (Windows)
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    const dirs = [
      path.join(programFiles, 'Java'),
      path.join(programFiles, 'Eclipse Adoptium'),
      path.join(programFiles, 'Microsoft', 'jdk'),
    ];
    for (const dir of dirs) {
      try {
        const entries = await fs.promises.readdir(dir);
        for (const entry of entries) {
          candidates.push(path.join(dir, entry, 'bin', 'java.exe'));
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
  }

  for (const candidate of candidates) {
    try {
      // java -version outputs to stderr
      const { stderr } = await execFileAsync(candidate, ['-version'], {
        timeout: 10_000,
      });
      const version = parseJavaVersion(stderr);
      if (version) {
        return { path: candidate, version };
      }
    } catch {
      // Candidate not found or failed, try next
    }
  }

  return null;
}

/**
 * Parse Java version string from `java -version` stderr output.
 * Handles formats: "17.0.1", "1.8.0_292", "21"
 */
function parseJavaVersion(output: string): string | null {
  // Match: "17.0.1" or "1.8.0_292" or "21"
  const match = output.match(/version\s+"?(\d+)(?:\.(\d+))?/);
  if (!match) return null;

  const major = parseInt(match[1], 10);
  // Old format: 1.x means Java x
  const effectiveMajor = major === 1 ? parseInt(match[2] ?? '0', 10) : major;

  if (effectiveMajor < MIN_JAVA_VERSION) return null;

  return match[0].replace(/version\s+"?/, '').replace(/"$/, '');
}

/**
 * Find Audiveris JAR file on the system.
 * Searches userData, bundled resources, and AUDIVERIS_HOME.
 */
async function findAudiverisJar(): Promise<string | null> {
  const candidates: string[] = [];

  // 1. User data directory
  try {
    const userDataDir = path.join(app.getPath('userData'), 'audiveris');
    const entries = await fs.promises.readdir(userDataDir);
    const jar = entries.find((e) => e.toLowerCase().startsWith('audiveris') && e.endsWith('.jar'));
    if (jar) candidates.push(path.join(userDataDir, jar));
  } catch {
    // Directory doesn't exist
  }

  // 2. Bundled resources
  if (process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'audiveris', 'Audiveris.jar');
    candidates.push(bundled);
  }

  // 3. AUDIVERIS_HOME env
  const audiverisHome = process.env.AUDIVERIS_HOME;
  if (audiverisHome) {
    candidates.push(path.join(audiverisHome, 'Audiveris.jar'));
    // Also check lib/ subdirectory
    candidates.push(path.join(audiverisHome, 'lib', 'Audiveris.jar'));
  }

  for (const candidate of candidates) {
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // Not accessible, try next
    }
  }

  return null;
}

/**
 * Detect Audiveris availability on the system.
 * Checks for both Java 17+ and Audiveris JAR.
 */
export async function detectAudiveris(): Promise<AudiverisStatus> {
  const java = await findJava();
  if (!java) {
    return {
      available: false,
      javaFound: false,
      audiverisFound: false,
      error: 'Java 17+ is required but was not found. Please install from https://adoptium.net',
    };
  }

  const jarPath = await findAudiverisJar();
  if (!jarPath) {
    return {
      available: false,
      javaFound: true,
      javaVersion: java.version,
      audiverisFound: false,
      error: 'Audiveris was not found. Please download and install Audiveris.',
    };
  }

  return {
    available: true,
    javaFound: true,
    javaVersion: java.version,
    audiverisFound: true,
    audiverisPath: jarPath,
  };
}

/**
 * Get Audiveris configuration for subprocess execution.
 * Throws if Java or Audiveris is not available.
 */
export async function getAudiverisConfig(): Promise<AudiverisConfig> {
  const java = await findJava();
  if (!java) {
    throw new Error('Java 17+ is required but was not found.');
  }

  const jarPath = await findAudiverisJar();
  if (!jarPath) {
    throw new Error('Audiveris JAR was not found.');
  }

  return {
    javaPath: java.path,
    audiverisJarPath: jarPath,
  };
}
