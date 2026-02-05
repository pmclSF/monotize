import type { ConflictStrategy, DependencyConflict } from '../types/index.js';
import { getHighestVersion, getLowestVersion } from '../analyzers/dependencies.js';
import { promptDependencyResolution } from '../utils/prompts.js';

/**
 * Result of resolving dependency conflicts
 */
export interface ResolvedDependencies {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

/**
 * Resolve a single dependency conflict using the specified strategy
 */
async function resolveConflict(
  conflict: DependencyConflict,
  strategy: ConflictStrategy
): Promise<string> {
  const versions = conflict.versions.map((v) => v.version);
  const uniqueVersions = [...new Set(versions)];

  switch (strategy) {
    case 'highest':
      return getHighestVersion(uniqueVersions);

    case 'lowest':
      return getLowestVersion(uniqueVersions);

    case 'prompt':
      return promptDependencyResolution(conflict);
  }
}

/**
 * Resolve all dependency conflicts using the specified strategy
 */
export async function resolveDependencyConflicts(
  conflicts: DependencyConflict[],
  strategy: ConflictStrategy,
  baseDependencies: Record<string, string>,
  baseDevDependencies: Record<string, string>
): Promise<ResolvedDependencies> {
  const dependencies = { ...baseDependencies };
  const devDependencies = { ...baseDevDependencies };

  for (const conflict of conflicts) {
    const resolvedVersion = await resolveConflict(conflict, strategy);

    // Determine if this should be a dep or devDep based on usage
    const hasDep = conflict.versions.some((v) => v.type === 'dependencies');
    const hasDevDep = conflict.versions.some((v) => v.type === 'devDependencies');

    if (hasDep) {
      dependencies[conflict.name] = resolvedVersion;
      // Remove from devDeps if it's in regular deps
      delete devDependencies[conflict.name];
    } else if (hasDevDep) {
      devDependencies[conflict.name] = resolvedVersion;
    }
  }

  // Sort dependencies alphabetically
  const sortedDeps = Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))
  );

  const sortedDevDeps = Object.fromEntries(
    Object.entries(devDependencies).sort(([a], [b]) => a.localeCompare(b))
  );

  return {
    dependencies: sortedDeps,
    devDependencies: sortedDevDeps,
  };
}

/**
 * Format a conflict for display
 */
export function formatConflict(conflict: DependencyConflict): string {
  const versionInfo = conflict.versions
    .map((v) => `${v.version} (${v.source})`)
    .join(', ');

  const severityIndicator =
    conflict.severity === 'incompatible'
      ? '[INCOMPATIBLE]'
      : conflict.severity === 'major'
        ? '[MAJOR]'
        : '[minor]';

  return `${conflict.name}: ${versionInfo} ${severityIndicator}`;
}

/**
 * Get a summary of conflicts by severity
 */
export function getConflictSummary(
  conflicts: DependencyConflict[]
): { incompatible: number; major: number; minor: number } {
  return {
    incompatible: conflicts.filter((c) => c.severity === 'incompatible').length,
    major: conflicts.filter((c) => c.severity === 'major').length,
    minor: conflicts.filter((c) => c.severity === 'minor').length,
  };
}
