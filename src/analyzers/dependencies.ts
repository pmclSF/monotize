import path from 'node:path';
import type {
  PackageInfo,
  DependencyConflict,
  DependencyAnalysis,
  ConflictSeverity,
} from '../types/index.js';
import { pathExists, readJson } from '../utils/fs.js';

/**
 * Parse a semver version string into components
 */
function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  // Remove leading ^ or ~ or =
  const cleaned = version.replace(/^[\^~=]/, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  if (!parsedA || !parsedB) {
    // Fall back to string comparison
    return a.localeCompare(b);
  }

  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }
  return parsedA.patch - parsedB.patch;
}

/**
 * Determine the severity of a version conflict
 */
function determineConflictSeverity(versions: string[]): ConflictSeverity {
  const parsed = versions.map(parseSemver).filter((v): v is NonNullable<typeof v> => v !== null);

  if (parsed.length < 2) {
    return 'minor';
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
 * Analyze dependencies across multiple repositories
 */
export async function analyzeDependencies(
  repoPaths: Array<{ path: string; name: string }>
): Promise<DependencyAnalysis> {
  const allPackages: PackageInfo[] = [];

  // Collect all packages from all repos
  for (const repo of repoPaths) {
    const packages = await findPackages(repo.path, repo.name);
    allPackages.push(...packages);
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
        const existing = depGroups.get(name) || [];
        existing.push({ version, source: pkg.repoName, type });
        depGroups.set(name, existing);
      }
    }
  }

  // Identify conflicts
  const conflicts: DependencyConflict[] = [];

  for (const [name, versions] of depGroups) {
    const uniqueVersions = [...new Set(versions.map((v) => v.version))];

    if (uniqueVersions.length > 1) {
      conflicts.push({
        name,
        versions,
        severity: determineConflictSeverity(uniqueVersions),
      });
    }
  }

  // Sort conflicts by severity
  const severityOrder: Record<ConflictSeverity, number> = {
    incompatible: 0,
    major: 1,
    minor: 2,
  };
  conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

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
