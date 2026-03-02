import semver from 'semver';
import type {
  PackageInfo,
  DependencyConflict,
  LockfileResolution,
  ConfidenceLevel,
} from '../types/index.js';
import { getHighestVersion } from './dependencies.js';

function normalizeToSemver(version: string): string | null {
  try {
    const exact = semver.valid(version, { includePrerelease: true, loose: true });
    if (exact) return exact;

    const validRange = semver.validRange(version, { includePrerelease: true, loose: true });
    if (validRange) {
      const min = semver.minVersion(validRange, { includePrerelease: true, loose: true });
      if (min) return min.version;
    }

    const coerced = semver.coerce(version, { includePrerelease: true, loose: true });
    if (coerced) return coerced.version;
  } catch {
    return null;
  }

  return null;
}

/**
 * Semver range satisfaction check using the semver package.
 * Handles all range types including complex ranges (||, hyphen, etc.).
 */
export function satisfiesRange(version: string, range: string): boolean {
  const cleanVersion = normalizeToSemver(version);
  if (!cleanVersion) return false;

  try {
    return semver.satisfies(cleanVersion, range, { includePrerelease: true, loose: true });
  } catch {
    return false;
  }
}

/**
 * Check if peerDep ranges are satisfied by available dependency versions.
 * Returns conflicts with confidence 'high', conflictSource 'peer-constraint'.
 */
export function analyzePeerDependencies(
  packages: PackageInfo[],
  lockfileResolutions: LockfileResolution[]
): DependencyConflict[] {
  const conflicts: DependencyConflict[] = [];

  // Build a map of lockfile resolutions by repo name
  const resolutionsByRepo = new Map<string, Record<string, string>>();
  for (const res of lockfileResolutions) {
    resolutionsByRepo.set(res.repoName, res.resolvedVersions);
  }

  // Build a map of declared versions across all packages
  const declaredVersions = new Map<string, string[]>();
  for (const pkg of packages) {
    for (const [depName, version] of Object.entries(pkg.dependencies)) {
      const existing = declaredVersions.get(depName) || [];
      existing.push(version);
      declaredVersions.set(depName, existing);
    }
    for (const [depName, version] of Object.entries(pkg.devDependencies)) {
      const existing = declaredVersions.get(depName) || [];
      existing.push(version);
      declaredVersions.set(depName, existing);
    }
  }

  for (const pkg of packages) {
    for (const [peerDepName, peerRange] of Object.entries(pkg.peerDependencies)) {
      // Find the best available version of peerDepName
      let bestVersion: string | null = null;

      // First check lockfile resolutions for this repo
      const repoResolutions = resolutionsByRepo.get(pkg.repoName);
      if (repoResolutions && repoResolutions[peerDepName]) {
        bestVersion = repoResolutions[peerDepName];
      }

      // Then check declared versions across all packages
      if (!bestVersion) {
        const versions = declaredVersions.get(peerDepName);
        if (versions && versions.length > 0) {
          const bestDeclared = getHighestVersion(versions);
          const normalized = normalizeToSemver(bestDeclared);
          if (normalized) bestVersion = normalized;
        }
      }

      // If no version found at all, skip (can't validate)
      if (!bestVersion) continue;

      // semver.satisfies handles all range types (^, ~, ||, hyphen, etc.)
      // Use 'high' confidence since the semver package is authoritative
      const confidence: ConfidenceLevel = 'high';

      if (!satisfiesRange(bestVersion, peerRange)) {
        conflicts.push({
          name: peerDepName,
          versions: [
            {
              version: peerRange,
              source: `${pkg.repoName} (peer)`,
              type: 'peerDependencies',
            },
            {
              version: bestVersion,
              source: 'available',
              type: 'dependencies',
            },
          ],
          severity: 'major',
          confidence,
          conflictSource: 'peer-constraint',
        });
      }
    }
  }

  return conflicts;
}
