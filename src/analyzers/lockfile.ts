import path from 'node:path';
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
    } catch {
      // Parse failure — fall through
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
    } catch {
      // Parse failure — fall through
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
    } catch {
      // Parse failure — fall through
    }
  }

  return null;
}

/**
 * Parse pnpm-lock.yaml — extract dependency versions.
 * Supports both lockfileVersion >= 6 (importers format) and older flat format.
 */
export function parsePnpmLock(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  try {
    // Detect lockfile version
    const versionMatch = content.match(/lockfileVersion:\s*'?(\d+(?:\.\d+)?)'?/);
    const lockfileVersion = versionMatch ? parseFloat(versionMatch[1]) : 0;

    if (lockfileVersion >= 6) {
      // Modern format: importers['.'].dependencies / devDependencies
      // Look for importers > '.' > dependencies/devDependencies sections
      const importersMatch = content.match(/importers:\s*\n\s+['.]?\.?['.]?:\s*\n([\s\S]*?)(?=\nimporters:|\npackages:|\nlockfileVersion:|\n\S|$)/);
      if (importersMatch) {
        const importerBlock = importersMatch[1];
        // Match entries like:   package-name:
        //                         specifier: ^1.0.0
        //                         version: 1.2.3
        const entryPattern = /^\s{6,8}(\S+):\s*\n\s+specifier:.*\n\s+version:\s*['"]?([^('"\n\s]+)/gm;
        let match;
        while ((match = entryPattern.exec(importerBlock)) !== null) {
          const name = match[1].replace(/^['"]|['"]$/g, '');
          const version = match[2].replace(/\(.*$/, '').trim();
          result[name] = version;
        }
      }
    }

    // Flat format (older) or fallback: root-level dependencies/devDependencies
    if (Object.keys(result).length === 0) {
      // Match root dependencies: section
      const sections = ['dependencies:', 'devDependencies:'];
      for (const sectionHeader of sections) {
        const sectionRegex = new RegExp(
          `^${sectionHeader}\\s*\\n((?:\\s{2}\\S.*\\n)*)`,
          'm'
        );
        const sectionMatch = content.match(sectionRegex);
        if (sectionMatch) {
          const lines = sectionMatch[1].split('\n');
          for (const line of lines) {
            // Match "  package-name: version" or "  package-name: 'version'"
            const lineMatch = line.match(/^\s{2}(\S+):\s+['"]?([^'"\n\s]+)/);
            if (lineMatch) {
              const name = lineMatch[1].replace(/^['"]|['"]$/g, '');
              result[name] = lineMatch[2];
            }
          }
        }
      }
    }
  } catch {
    // Return empty on any parse error
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
  } catch {
    // Return empty on any parse error
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
  } catch {
    // Return empty on any parse error
  }

  return result;
}
