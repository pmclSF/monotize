import path from 'node:path';
import type {
  PackageInfo,
  DependencyConflict,
  DependencyAnalysis,
  ConflictSeverity,
  LockfileResolution,
  AnalysisFindings,
  DecisionRequired,
} from '../types/index.js';
import { pathExists, readJson } from '../utils/fs.js';
import { parseLockfile } from './lockfile.js';
import { analyzePeerDependencies } from './peers.js';

/**
 * Patterns for non-semver version specifiers
 */
const NON_SEMVER_PATTERNS = [
  /^git\+/,           // git+https://, git+ssh://
  /^github:/,         // github:user/repo
  /^gitlab:/,         // gitlab:user/repo
  /^bitbucket:/,      // bitbucket:user/repo
  /^file:/,           // file:../path
  /^link:/,           // link:../path
  /^npm:/,            // npm:package@version
  /^https?:\/\//,     // URL tarball
  /^workspace:/,      // workspace:*
];

/**
 * Check if a version string is a non-semver specifier (git, file, URL, etc.)
 */
export function isNonSemverVersion(version: string): boolean {
  return NON_SEMVER_PATTERNS.some((pattern) => pattern.test(version));
}

/**
 * Check if a version is a wildcard (*, x, or major.x patterns)
 */
export function isWildcardVersion(version: string): boolean {
  const trimmed = version.trim();
  return (
    trimmed === '*' ||
    trimmed === 'x' ||
    /^\d+\.x$/.test(trimmed) ||
    /^\d+\.\d+\.x$/.test(trimmed)
  );
}

/**
 * Parse a semver version string into components
 */
export function parseSemver(version: string): { major: number; minor: number; patch: number; prerelease?: string } | null {
  // Skip non-semver versions
  if (isNonSemverVersion(version)) {
    return null;
  }

  // Skip wildcards
  if (isWildcardVersion(version)) {
    return null;
  }

  // Remove leading ^, ~, =, >=, <=, <, >
  const cleaned = version.replace(/^[\^~=><]+/, '').replace(/^>=|<=|>|</, '');

  // Handle range patterns - take the first version in the range
  const firstVersion = cleaned.split(/\s+/)[0];

  // Standard semver pattern with optional pre-release
  const match = firstVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.+-]+))?/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  // If one or both are not parseable, fall back to string comparison
  if (!parsedA && !parsedB) {
    return a.localeCompare(b);
  }
  if (!parsedA) return -1; // Non-semver goes first (lower priority)
  if (!parsedB) return 1;

  // Compare major.minor.patch
  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch - parsedB.patch;
  }

  // Handle pre-release (versions without pre-release are higher)
  if (parsedA.prerelease && !parsedB.prerelease) return -1;
  if (!parsedA.prerelease && parsedB.prerelease) return 1;
  if (parsedA.prerelease && parsedB.prerelease) {
    return parsedA.prerelease.localeCompare(parsedB.prerelease);
  }

  return 0;
}

/**
 * Determine the severity of a version conflict
 */
function determineConflictSeverity(versions: string[]): ConflictSeverity {
  const parsed = versions
    .map(parseSemver)
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (parsed.length < 2) {
    // Not enough parseable versions to determine severity
    // Could be mixed semver/non-semver
    return 'major';
  }

  const majors = new Set(parsed.map((v) => v.major));
  if (majors.size > 1) {
    return 'incompatible';
  }

  const minors = new Set(parsed.map((v) => v.minor));
  if (minors.size > 1) {
    return 'major';
  }

  return 'minor';
}

/**
 * Read package.json from a directory
 */
async function readPackageJson(repoPath: string, repoName: string): Promise<PackageInfo | null> {
  const packageJsonPath = path.join(repoPath, 'package.json');

  if (!(await pathExists(packageJsonPath))) {
    return null;
  }

  try {
    const pkg = await readJson<Record<string, unknown>>(packageJsonPath);

    return {
      name: (pkg.name as string) || repoName,
      version: (pkg.version as string) || '0.0.0',
      dependencies: (pkg.dependencies as Record<string, string>) || {},
      devDependencies: (pkg.devDependencies as Record<string, string>) || {},
      peerDependencies: (pkg.peerDependencies as Record<string, string>) || {},
      scripts: (pkg.scripts as Record<string, string>) || {},
      path: repoPath,
      repoName,
    };
  } catch {
    // Malformed JSON or read error
    return null;
  }
}

/**
 * Find all package.json files in a repository (including nested workspaces)
 */
async function findPackages(repoPath: string, repoName: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  // First, read the root package.json
  const rootPkg = await readPackageJson(repoPath, repoName);
  if (rootPkg) {
    packages.push(rootPkg);
  }

  return packages;
}

/**
 * Warnings about non-standard versions
 */
export interface DependencyWarning {
  name: string;
  version: string;
  source: string;
  type: 'git' | 'file' | 'url' | 'wildcard' | 'prerelease';
  message: string;
}

/**
 * Detect conflicts between resolved versions across repos.
 */
function detectResolvedConflicts(
  resolutions: LockfileResolution[]
): DependencyConflict[] {
  const conflicts: DependencyConflict[] = [];

  // Group resolved versions by dep name across repos
  const resolvedGroups = new Map<
    string,
    Array<{ version: string; source: string }>
  >();

  for (const res of resolutions) {
    for (const [name, version] of Object.entries(res.resolvedVersions)) {
      const existing = resolvedGroups.get(name) || [];
      existing.push({ version, source: res.repoName });
      resolvedGroups.set(name, existing);
    }
  }

  for (const [name, entries] of resolvedGroups) {
    const uniqueVersions = [...new Set(entries.map((e) => e.version))];
    if (uniqueVersions.length > 1) {
      conflicts.push({
        name,
        versions: entries.map((e) => ({
          version: e.version,
          source: e.source,
          type: 'dependencies' as const,
        })),
        severity: determineConflictSeverity(uniqueVersions),
        confidence: 'high',
        conflictSource: 'resolved',
      });
    }
  }

  return conflicts;
}

/**
 * Analyze dependencies across multiple repositories
 */
export async function analyzeDependencies(
  repoPaths: Array<{ path: string; name: string }>
): Promise<DependencyAnalysis & { warnings?: DependencyWarning[]; findings?: AnalysisFindings; lockfileResolutions?: LockfileResolution[] }> {
  const allPackages: PackageInfo[] = [];
  const warnings: DependencyWarning[] = [];

  // Collect all packages from all repos
  for (const repo of repoPaths) {
    const packages = await findPackages(repo.path, repo.name);
    allPackages.push(...packages);
  }

  // Parse lockfiles for each repo
  const lockfileResolutions: LockfileResolution[] = [];
  for (const repo of repoPaths) {
    const resolution = await parseLockfile(repo.path, repo.name);
    if (resolution) {
      lockfileResolutions.push(resolution);
    }
  }

  // Group dependencies by name
  const depGroups = new Map<
    string,
    Array<{ version: string; source: string; type: 'dependencies' | 'devDependencies' | 'peerDependencies' }>
  >();

  for (const pkg of allPackages) {
    const depTypes = [
      { deps: pkg.dependencies, type: 'dependencies' as const },
      { deps: pkg.devDependencies, type: 'devDependencies' as const },
      { deps: pkg.peerDependencies, type: 'peerDependencies' as const },
    ];

    for (const { deps, type } of depTypes) {
      for (const [name, version] of Object.entries(deps)) {
        // Track warnings for non-standard versions
        if (isNonSemverVersion(version)) {
          let versionType: DependencyWarning['type'] = 'url';
          if (/^git\+|^github:|^gitlab:|^bitbucket:/.test(version)) {
            versionType = 'git';
          } else if (/^file:|^link:/.test(version)) {
            versionType = 'file';
          }
          warnings.push({
            name,
            version,
            source: pkg.repoName,
            type: versionType,
            message: `Non-semver dependency "${name}": ${version} in ${pkg.repoName}`,
          });
        } else if (isWildcardVersion(version)) {
          warnings.push({
            name,
            version,
            source: pkg.repoName,
            type: 'wildcard',
            message: `Wildcard version for "${name}": ${version} in ${pkg.repoName}`,
          });
        }

        const existing = depGroups.get(name) || [];
        existing.push({ version, source: pkg.repoName, type });
        depGroups.set(name, existing);
      }
    }
  }

  // Identify declared conflicts and tag with confidence/source
  const declaredConflicts: DependencyConflict[] = [];

  for (const [name, versions] of depGroups) {
    const uniqueVersions = [...new Set(versions.map((v) => v.version))];

    if (uniqueVersions.length > 1) {
      declaredConflicts.push({
        name,
        versions,
        severity: determineConflictSeverity(uniqueVersions),
        confidence: 'high',
        conflictSource: 'declared',
      });
    }
  }

  // Detect resolved conflicts from lockfiles
  const resolvedConflicts = detectResolvedConflicts(lockfileResolutions);

  // Detect peer dependency conflicts
  const peerConflicts = analyzePeerDependencies(allPackages, lockfileResolutions);

  // All conflicts combined (backward compat)
  const allConflicts = [...declaredConflicts, ...resolvedConflicts, ...peerConflicts];

  // Deduplicate: if a dep appears in multiple conflict lists, keep the one with highest confidence
  const conflictMap = new Map<string, DependencyConflict>();
  for (const conflict of allConflicts) {
    const existing = conflictMap.get(conflict.name);
    if (!existing) {
      conflictMap.set(conflict.name, conflict);
    } else if (
      conflict.conflictSource === 'resolved' &&
      existing.conflictSource === 'declared'
    ) {
      // Resolved takes precedence for the combined list
      conflictMap.set(conflict.name, conflict);
    }
    // Keep peer conflicts as separate entries (they have different semantics)
    if (conflict.conflictSource === 'peer-constraint' && existing && existing.conflictSource !== 'peer-constraint') {
      // Add with a unique key
      conflictMap.set(`${conflict.name}__peer`, conflict);
    }
  }
  const conflicts = [...conflictMap.values()];

  // Sort conflicts by severity
  const severityOrder: Record<ConflictSeverity, number> = {
    incompatible: 0,
    major: 1,
    minor: 2,
  };
  conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Build decisions from incompatible conflicts and peer violations
  const decisions: DecisionRequired[] = [];
  for (const conflict of declaredConflicts) {
    if (conflict.severity === 'incompatible') {
      decisions.push({
        kind: 'version-conflict',
        description: `Incompatible versions of "${conflict.name}": ${conflict.versions.map((v) => `${v.version} (${v.source})`).join(', ')}`,
        relatedConflict: conflict.name,
        suggestedAction: 'Consider using --no-hoist or updating packages to compatible versions.',
      });
    }
  }
  for (const conflict of peerConflicts) {
    decisions.push({
      kind: 'peer-constraint-violation',
      description: `Peer dependency "${conflict.name}" may not be satisfied: ${conflict.versions.map((v) => `${v.version} (${v.source})`).join(' vs ')}`,
      relatedConflict: conflict.name,
      suggestedAction: 'Review peer dependency requirements and update versions as needed.',
    });
  }

  // Build findings
  const findings: AnalysisFindings = {
    declaredConflicts,
    resolvedConflicts,
    peerConflicts,
    decisions,
  };

  // Resolve to highest versions by default
  const resolvedDependencies: Record<string, string> = {};
  const resolvedDevDependencies: Record<string, string> = {};

  for (const [name, versions] of depGroups) {
    const depVersions = versions.filter((v) => v.type === 'dependencies');
    const devVersions = versions.filter((v) => v.type === 'devDependencies');

    if (depVersions.length > 0) {
      const sorted = [...depVersions].sort((a, b) => compareSemver(b.version, a.version));
      resolvedDependencies[name] = sorted[0].version;
    } else if (devVersions.length > 0) {
      const sorted = [...devVersions].sort((a, b) => compareSemver(b.version, a.version));
      resolvedDevDependencies[name] = sorted[0].version;
    }
  }

  return {
    packages: allPackages,
    conflicts,
    resolvedDependencies,
    resolvedDevDependencies,
    warnings: warnings.length > 0 ? warnings : undefined,
    findings,
    lockfileResolutions: lockfileResolutions.length > 0 ? lockfileResolutions : undefined,
  };
}

/**
 * Get the highest version from a list of versions
 */
export function getHighestVersion(versions: string[]): string {
  const sorted = [...versions].sort((a, b) => compareSemver(b, a));
  return sorted[0];
}

/**
 * Get the lowest version from a list of versions
 */
export function getLowestVersion(versions: string[]): string {
  const sorted = [...versions].sort((a, b) => compareSemver(a, b));
  return sorted[0];
}
