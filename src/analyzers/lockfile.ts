import path from 'node:path';
import yaml from 'js-yaml';
import semver from 'semver';
import type { LockfileResolution } from '../types/index.js';
import { pathExists, readFile } from '../utils/fs.js';

interface ParseLockfileOptions {
  onParseWarning?: (message: string) => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeResolvedVersion(version: string): string {
  return version
    .replace(/^npm:/, '')
    .replace(/\(.*$/, '')
    .replace(/_.+$/, '')
    .trim();
}

function choosePreferredVersion(existing: string | undefined, incoming: string): string {
  if (!existing) return incoming;
  if (existing === incoming) return existing;

  const existingParsed = semver.coerce(existing, { includePrerelease: true, loose: true });
  const incomingParsed = semver.coerce(incoming, { includePrerelease: true, loose: true });

  if (existingParsed && incomingParsed) {
    return semver.gt(incomingParsed, existingParsed) ? incoming : existing;
  }
  if (!existingParsed && incomingParsed) return incoming;
  return existing;
}

function setResolvedVersion(
  target: Record<string, string>,
  name: string,
  rawVersion: string
): void {
  const version = normalizeResolvedVersion(rawVersion);
  if (!name || !version) return;
  target[name] = choosePreferredVersion(target[name], version);
}

function extractYarnPackageName(selector: string): string | null {
  const trimmed = selector.trim().replace(/^["']|["']$/g, '');
  if (!trimmed || trimmed.startsWith('__')) return null;

  if (trimmed.startsWith('@')) {
    const secondAt = trimmed.indexOf('@', 1);
    if (secondAt <= 1) return null;
    return trimmed.slice(0, secondAt);
  }

  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return null;
  return trimmed.slice(0, atIndex);
}

function extractNpmPackageNameFromPath(pkgPath: string): string | null {
  if (!pkgPath.startsWith('node_modules/')) return null;
  const relative = pkgPath.slice('node_modules/'.length);
  const segments = relative.split('/');

  if (segments[0]?.startsWith('@')) {
    if (segments.length < 2) return null;
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0] || null;
}

function parsePnpmPackageKey(rawKey: string): { name: string; version: string } | null {
  const key = rawKey.replace(/^\//, '').replace(/\(.*$/, '');

  // New style: name@1.2.3 or @scope/name@1.2.3
  const atIndex = key.lastIndexOf('@');
  if (atIndex > 0 && key[atIndex - 1] !== '/') {
    return {
      name: key.slice(0, atIndex),
      version: normalizeResolvedVersion(key.slice(atIndex + 1)),
    };
  }

  // Old slash style: /name/1.2.3 or /@scope/name/1.2.3
  const scopedSlashMatch = key.match(/^(@[^/]+\/[^/]+)\/([^/]+)$/);
  if (scopedSlashMatch) {
    return {
      name: scopedSlashMatch[1],
      version: normalizeResolvedVersion(scopedSlashMatch[2]),
    };
  }
  const unscopedSlashMatch = key.match(/^([^/@][^/]*)\/([^/]+)$/);
  if (unscopedSlashMatch) {
    return {
      name: unscopedSlashMatch[1],
      version: normalizeResolvedVersion(unscopedSlashMatch[2]),
    };
  }

  return null;
}

/**
 * Try each lockfile format in a repo dir. Returns null if none found.
 */
export async function parseLockfile(
  repoPath: string,
  repoName: string,
  options: ParseLockfileOptions = {}
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
      if (content.trim().length > 0) {
        options.onParseWarning?.(
          `No parsable dependencies found in ${pnpmLockPath} for ${repoName}`
        );
      }
    } catch (error) {
      options.onParseWarning?.(
        `Failed to parse ${pnpmLockPath} for ${repoName}: ${getErrorMessage(error)}`
      );
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
      if (content.trim().length > 0) {
        options.onParseWarning?.(
          `No parsable dependencies found in ${yarnLockPath} for ${repoName}`
        );
      }
    } catch (error) {
      options.onParseWarning?.(
        `Failed to parse ${yarnLockPath} for ${repoName}: ${getErrorMessage(error)}`
      );
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
      if (content.trim().length > 0) {
        options.onParseWarning?.(
          `No parsable dependencies found in ${npmLockPath} for ${repoName}`
        );
      }
    } catch (error) {
      options.onParseWarning?.(
        `Failed to parse ${npmLockPath} for ${repoName}: ${getErrorMessage(error)}`
      );
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

    // Modern format (lockfileVersion >= 6): importers['.'] dependency sections
    if (lockfileVersion >= 6) {
      const importers = lockData.importers as Record<string, Record<string, unknown>> | undefined;
      const rootImporter = importers?.['.'];
      if (rootImporter) {
        for (const section of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
          const deps = rootImporter[section] as Record<string, unknown> | undefined;
          if (deps && typeof deps === 'object') {
            for (const [name, entry] of Object.entries(deps)) {
              if (typeof entry === 'string') {
                setResolvedVersion(result, name, entry);
                continue;
              }
              if (entry && typeof entry === 'object') {
                const resolved = (entry as { version?: string }).version;
                if (typeof resolved === 'string') {
                  setResolvedVersion(result, name, resolved);
                }
              }
            }
          }
        }
      }
    }

    // Flat format (older) or fallback: root-level dependencies/devDependencies
    if (Object.keys(result).length === 0) {
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
        const deps = lockData[section] as Record<string, string | Record<string, unknown>> | undefined;
        if (deps && typeof deps === 'object') {
          for (const [name, value] of Object.entries(deps)) {
            if (typeof value === 'string') {
              setResolvedVersion(result, name, value);
            } else if (typeof value === 'object' && value !== null && 'version' in value) {
              setResolvedVersion(result, name, String((value as { version: unknown }).version));
            }
          }
        }
      }
    }

    // Fallback to packages map if importer/root dependency sections are absent.
    if (Object.keys(result).length === 0 && lockData.packages && typeof lockData.packages === 'object') {
      for (const [rawKey, value] of Object.entries(lockData.packages as Record<string, unknown>)) {
        const parsed = parsePnpmPackageKey(rawKey);
        if (!parsed) continue;

        if (value && typeof value === 'object' && 'version' in (value as Record<string, unknown>)) {
          const explicitVersion = (value as { version?: string }).version;
          if (typeof explicitVersion === 'string') {
            setResolvedVersion(result, parsed.name, explicitVersion);
            continue;
          }
        }
        setResolvedVersion(result, parsed.name, parsed.version);
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
    const lines = content.split(/\r?\n/);
    let activeSelectors: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Entry header line, e.g.
      // "react@^18.0.0":
      // "react@^18.0.0, react@^18.2.0":
      if (!line.startsWith(' ') && trimmed.endsWith(':')) {
        activeSelectors = trimmed
          .slice(0, -1)
          .split(',')
          .map((selector) => selector.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        continue;
      }

      if (activeSelectors.length === 0) continue;

      const versionMatch = line.match(/^\s+version:?\s+["']?([^"'\s]+)["']?/);
      if (!versionMatch) continue;

      const version = versionMatch[1];
      for (const selector of activeSelectors) {
        const packageName = extractYarnPackageName(selector);
        if (!packageName) continue;
        setResolvedVersion(result, packageName, version);
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
        // Skip root package (empty string key).
        if (!pkgPath) continue;
        const depName = extractNpmPackageNameFromPath(pkgPath);
        if (!depName) continue;
        const data = pkgData as { version?: string };
        if (data.version) {
          setResolvedVersion(result, depName, data.version);
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
          setResolvedVersion(result, name, depData.version);
        }
      }
    }
  } catch (_err) {
    // package-lock.json parse error; return empty
  }

  return result;
}
