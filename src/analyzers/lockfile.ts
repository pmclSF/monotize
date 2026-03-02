import path from 'node:path';
import yaml from 'js-yaml';
import type { LockfileResolution } from '../types/index.js';
import { pathExists, readFile } from '../utils/fs.js';

/**
 * Try each lockfile format in a repo dir. Returns null if none found.
 */
export async function parseLockfile(
  repoPath: string,
  repoName: string
): Promise<LockfileResolution | null> {
  // Try pnpm-lock.yaml
  const pnpmLockPath = path.join(repoPath, 'pnpm-lock.yaml');
  if (await pathExists(pnpmLockPath)) {
    try {
      const content = await readFile(pnpmLockPath);
      const resolvedVersions = parsePnpmLock(content);
      if (Object.keys(resolvedVersions).length > 0) {
        return { packageManager: 'pnpm', repoName, resolvedVersions };
      }
    } catch (_err) {
      // pnpm-lock.yaml parse failure — fall through
    }
  }

  // Try yarn.lock
  const yarnLockPath = path.join(repoPath, 'yarn.lock');
  if (await pathExists(yarnLockPath)) {
    try {
      const content = await readFile(yarnLockPath);
      const resolvedVersions = parseYarnLock(content);
      if (Object.keys(resolvedVersions).length > 0) {
        return { packageManager: 'yarn', repoName, resolvedVersions };
      }
    } catch (_err) {
      // yarn.lock parse failure — fall through
    }
  }

  // Try package-lock.json
  const npmLockPath = path.join(repoPath, 'package-lock.json');
  if (await pathExists(npmLockPath)) {
    try {
      const content = await readFile(npmLockPath);
      const resolvedVersions = parsePackageLock(content);
      if (Object.keys(resolvedVersions).length > 0) {
        return { packageManager: 'npm', repoName, resolvedVersions };
      }
    } catch (_err) {
      // package-lock.json parse failure — fall through
    }
  }

  return null;
}

/**
 * Parse pnpm-lock.yaml — extract dependency versions using js-yaml.
 * Supports both lockfileVersion >= 6 (importers format) and older flat format.
 */
export function parsePnpmLock(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  try {
    const lockData = yaml.load(content) as Record<string, unknown> | null;
    if (!lockData || typeof lockData !== 'object') return result;

    const lockfileVersion = typeof lockData.lockfileVersion === 'string'
      ? parseFloat(lockData.lockfileVersion)
      : typeof lockData.lockfileVersion === 'number'
        ? lockData.lockfileVersion
        : 0;

    // Modern format (lockfileVersion >= 6): importers['.'].dependencies/devDependencies
    if (lockfileVersion >= 6) {
      const importers = lockData.importers as Record<string, Record<string, unknown>> | undefined;
      const rootImporter = importers?.['.'];
      if (rootImporter) {
        for (const section of ['dependencies', 'devDependencies'] as const) {
          const deps = rootImporter[section] as Record<string, { version?: string; specifier?: string }> | undefined;
          if (deps && typeof deps === 'object') {
            for (const [name, entry] of Object.entries(deps)) {
              if (entry && typeof entry === 'object' && entry.version) {
                // Strip pnpm's version suffixes like "1.2.3(react@18.2.0)"
                result[name] = entry.version.replace(/\(.*$/, '').trim();
              }
            }
          }
        }
      }
    }

    // Flat format (older) or fallback: root-level dependencies/devDependencies
    if (Object.keys(result).length === 0) {
      for (const section of ['dependencies', 'devDependencies'] as const) {
        const deps = lockData[section] as Record<string, string | Record<string, unknown>> | undefined;
        if (deps && typeof deps === 'object') {
          for (const [name, value] of Object.entries(deps)) {
            if (typeof value === 'string') {
              result[name] = value;
            } else if (typeof value === 'object' && value !== null && 'version' in value) {
              result[name] = String((value as { version: unknown }).version);
            }
          }
        }
      }
    }
  } catch (_err) {
    // pnpm lock parse error; return empty
  }

  return result;
}

/**
 * Parse yarn.lock — supports both v1 classic and berry formats.
 * Extracts dependency name and resolved version.
 */
export function parseYarnLock(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  try {
    const isBerry = content.includes('__metadata:');

    if (isBerry) {
      // Berry format: "name@npm:range":
      //   version: x.y.z
      const entryPattern = /^"?(@?[^@\n"]+)@(?:npm:)?[^":\n]*"?:\s*\n\s+version:?\s+["']?(\d+\.\d+\.\d+[^"'\n\s]*)["']?/gm;
      let match;
      while ((match = entryPattern.exec(content)) !== null) {
        const name = match[1].trim();
        // Skip __metadata and other special entries
        if (name.startsWith('__') || name.includes('workspace:')) continue;
        result[name] = match[2];
      }
    } else {
      // Classic v1 format: "name@range", name@range:
      //   version "x.y.z"
      const entryPattern = /^"?(@?[^@\n"]+)@[^:\n]*"?:\s*\n\s+version\s+"([^"]+)"/gm;
      let match;
      while ((match = entryPattern.exec(content)) !== null) {
        const name = match[1].trim();
        result[name] = match[2];
      }
    }
  } catch (_err) {
    // yarn lock parse error; return empty
  }

  return result;
}

/**
 * Parse package-lock.json v2/v3 — extract from packages["node_modules/<name>"].
 */
export function parsePackageLock(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  try {
    const lockData = JSON.parse(content);

    // v2/v3 format uses "packages" key
    if (lockData.packages && typeof lockData.packages === 'object') {
      for (const [pkgPath, pkgData] of Object.entries(lockData.packages)) {
        // Skip root package (empty string key) and nested node_modules
        if (!pkgPath.startsWith('node_modules/')) continue;

        // Only direct dependencies (no nested node_modules)
        const relativePath = pkgPath.slice('node_modules/'.length);
        if (relativePath.includes('node_modules/')) continue;

        const data = pkgData as { version?: string };
        if (data.version) {
          result[relativePath] = data.version;
        }
      }
    }

    // v1 fallback: "dependencies" key at root
    if (
      Object.keys(result).length === 0 &&
      lockData.dependencies &&
      typeof lockData.dependencies === 'object'
    ) {
      for (const [name, data] of Object.entries(lockData.dependencies)) {
        const depData = data as { version?: string };
        if (depData.version) {
          result[name] = depData.version;
        }
      }
    }
  } catch (_err) {
    // package-lock.json parse error; return empty
  }

  return result;
}
