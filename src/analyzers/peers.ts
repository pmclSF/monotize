import type {
  PackageInfo,
  DependencyConflict,
  LockfileResolution,
  ConfidenceLevel,
} from '../types/index.js';
import { parseSemver } from './dependencies.js';

/**
 * Basic semver range satisfaction check.
 * Supports ^, ~, >=, exact match. Complex ranges (||, -) return false.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const trimmed = range.trim();

  // Complex ranges — cannot reliably check
  if (trimmed.includes('||') || trimmed.includes(' - ')) {
    return false;
  }

  const parsed = parseSemver(version);
  if (!parsed) return false;

  // Exact match
  if (/^\d+\.\d+\.\d+/.test(trimmed)) {
    const rangeParsed = parseSemver(trimmed);
    if (!rangeParsed) return false;
    return (
      parsed.major === rangeParsed.major &&
      parsed.minor === rangeParsed.minor &&
      parsed.patch === rangeParsed.patch
    );
  }

  // Caret range: ^major.minor.patch — compatible with major
  if (trimmed.startsWith('^')) {
    const rangeParsed = parseSemver(trimmed);
    if (!rangeParsed) return false;

    if (rangeParsed.major > 0) {
      // ^1.2.3 means >=1.2.3 <2.0.0
      if (parsed.major !== rangeParsed.major) return false;
      if (parsed.minor < rangeParsed.minor) return false;
      if (parsed.minor === rangeParsed.minor && parsed.patch < rangeParsed.patch) return false;
      return true;
    }
    // ^0.x — compatible with minor
    if (parsed.major !== 0) return false;
    if (parsed.minor !== rangeParsed.minor) return false;
    if (parsed.patch < rangeParsed.patch) return false;
    return true;
  }

  // Tilde range: ~major.minor.patch — compatible with minor
  if (trimmed.startsWith('~')) {
    const rangeParsed = parseSemver(trimmed);
    if (!rangeParsed) return false;
    if (parsed.major !== rangeParsed.major) return false;
    if (parsed.minor !== rangeParsed.minor) return false;
    if (parsed.patch < rangeParsed.patch) return false;
    return true;
  }

  // >= range
  if (trimmed.startsWith('>=')) {
    const rangeParsed = parseSemver(trimmed);
    if (!rangeParsed) return false;
    if (parsed.major > rangeParsed.major) return true;
    if (parsed.major < rangeParsed.major) return false;
    if (parsed.minor > rangeParsed.minor) return true;
    if (parsed.minor < rangeParsed.minor) return false;
    return parsed.patch >= rangeParsed.patch;
  }

  return false;
}

/**
 * Check if a range is "complex" — contains || or hyphen ranges.
 */
function isComplexRange(range: string): boolean {
  return range.includes('||') || range.includes(' - ');
}

/**
 * Check if peerDep ranges are satisfied by available dependency versions.
 * Returns conflicts with confidence 'medium' (or 'low' for complex ranges),
 * conflictSource 'peer-constraint'.
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
          // Use the first declared version (stripped of range prefixes) as approximation
          const parsed = parseSemver(versions[0]);
          if (parsed) {
            bestVersion = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
          }
        }
      }

      // If no version found at all, skip (can't validate)
      if (!bestVersion) continue;

      const complex = isComplexRange(peerRange);
      const confidence: ConfidenceLevel = complex ? 'low' : 'medium';

      // For complex ranges, we can't reliably check, so report with low confidence
      if (complex) {
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
        continue;
      }

      // Check satisfaction
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
