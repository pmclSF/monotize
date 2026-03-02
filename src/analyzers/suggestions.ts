import type { SuggestedDecision, DependencyConflict } from '../types/index.js';
import { pathExists, readJson } from '../utils/fs.js';
import path from 'node:path';

/**
 * Suggest package manager based on lockfile presence and packageManager fields.
 */
export async function suggestPackageManager(
  repoPaths: Array<{ path: string; name: string }>
): Promise<SuggestedDecision> {
  const counts: Record<string, number> = { pnpm: 0, yarn: 0, npm: 0 };
  const evidence: string[] = [];

  for (const repo of repoPaths) {
    // Check for lockfiles
    if (await pathExists(path.join(repo.path, 'pnpm-lock.yaml'))) {
      counts.pnpm++;
      evidence.push(`${repo.name} has pnpm-lock.yaml`);
    }
    if (await pathExists(path.join(repo.path, 'yarn.lock'))) {
      counts.yarn++;
      evidence.push(`${repo.name} has yarn.lock`);
    }
    if (await pathExists(path.join(repo.path, 'package-lock.json'))) {
      counts.npm++;
      evidence.push(`${repo.name} has package-lock.json`);
    }

    // Check for packageManager field in package.json
    const pkgJsonPath = path.join(repo.path, 'package.json');
    if (await pathExists(pkgJsonPath)) {
      try {
        const pkg = await readJson<Record<string, unknown>>(pkgJsonPath);
        if (typeof pkg.packageManager === 'string') {
          const pmField = pkg.packageManager as string;
          if (pmField.startsWith('pnpm')) {
            counts.pnpm++;
            evidence.push(`${repo.name} has packageManager field: ${pmField}`);
          } else if (pmField.startsWith('yarn')) {
            counts.yarn++;
            evidence.push(`${repo.name} has packageManager field: ${pmField}`);
          } else if (pmField.startsWith('npm')) {
            counts.npm++;
            evidence.push(`${repo.name} has packageManager field: ${pmField}`);
          }
        }
      } catch {
        // Ignore malformed package.json
      }
    }
  }

  // Determine winner by majority vote, prefer pnpm if tied
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topCount = sorted[0][1];

  let suggestion: string;
  if (topCount === 0) {
    // No signals found, default to pnpm
    suggestion = 'pnpm';
    evidence.push('No lockfiles or packageManager fields found, defaulting to pnpm');
  } else {
    // Check for ties at the top
    const tied = sorted.filter(([, count]) => count === topCount);
    if (tied.length > 1 && tied.some(([pm]) => pm === 'pnpm')) {
      suggestion = 'pnpm';
      evidence.push('Tied between package managers, preferring pnpm');
    } else {
      suggestion = sorted[0][0];
    }
  }

  // Determine confidence
  const total = counts.pnpm + counts.yarn + counts.npm;
  let confidence: 'high' | 'medium' | 'low';
  if (total === 0) {
    confidence = 'low';
  } else if (counts[suggestion] === total) {
    confidence = 'high';
  } else if (counts[suggestion] > total / 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const alternatives = ['pnpm', 'yarn', 'npm'].filter((pm) => pm !== suggestion);

  return {
    topic: 'package-manager',
    suggestion,
    confidence,
    evidence,
    alternatives,
  };
}

/**
 * Suggest workspace tool (turbo, nx, or none).
 */
export async function suggestWorkspaceTool(
  repoPaths: Array<{ path: string; name: string }>
): Promise<SuggestedDecision> {
  const evidence: string[] = [];
  let turboCount = 0;
  let nxCount = 0;

  for (const repo of repoPaths) {
    if (await pathExists(path.join(repo.path, 'turbo.json'))) {
      turboCount++;
      evidence.push(`${repo.name} has turbo.json`);
    }
    if (await pathExists(path.join(repo.path, 'nx.json'))) {
      nxCount++;
      evidence.push(`${repo.name} has nx.json`);
    }
  }

  let suggestion: string;
  let confidence: 'high' | 'medium' | 'low';

  if (turboCount > 0 && nxCount > 0) {
    // Both found - prefer whichever has more, turbo wins ties
    suggestion = turboCount >= nxCount ? 'turbo' : 'nx';
    confidence = 'low';
    evidence.push('Both turbo and nx configs found across repos');
  } else if (turboCount > 0) {
    suggestion = 'turbo';
    confidence = turboCount === repoPaths.length ? 'high' : 'medium';
  } else if (nxCount > 0) {
    suggestion = 'nx';
    confidence = nxCount === repoPaths.length ? 'high' : 'medium';
  } else {
    suggestion = 'none';
    confidence = 'medium';
    evidence.push('No workspace tool configs found in any repo');
  }

  const alternatives = ['turbo', 'nx', 'none'].filter((t) => t !== suggestion);

  return {
    topic: 'workspace-tool',
    suggestion,
    confidence,
    evidence,
    alternatives,
  };
}

/**
 * Suggest dependency resolution strategy based on conflict analysis.
 */
export function suggestDependencyStrategy(
  conflicts: DependencyConflict[]
): SuggestedDecision {
  const evidence: string[] = [];

  if (conflicts.length === 0) {
    return {
      topic: 'dependency-strategy',
      suggestion: 'hoist',
      confidence: 'high',
      evidence: ['No dependency conflicts detected'],
      alternatives: ['isolate', 'hoist-with-overrides'],
    };
  }

  const incompatibleCount = conflicts.filter((c) => c.severity === 'incompatible').length;
  const majorCount = conflicts.filter((c) => c.severity === 'major').length;
  const minorCount = conflicts.filter((c) => c.severity === 'minor').length;

  evidence.push(
    `Found ${conflicts.length} conflicts: ${incompatibleCount} incompatible, ${majorCount} major, ${minorCount} minor`
  );

  let suggestion: string;
  let confidence: 'high' | 'medium' | 'low';

  if (incompatibleCount > conflicts.length / 2) {
    // Many incompatible conflicts - isolate packages
    suggestion = 'isolate';
    confidence = 'high';
    evidence.push('Majority of conflicts are incompatible, isolation recommended');
  } else if (incompatibleCount === 0 && majorCount === 0) {
    // Only minor conflicts - safe to hoist
    suggestion = 'hoist';
    confidence = 'high';
    evidence.push('All conflicts are minor, hoisting is safe');
  } else if (incompatibleCount > 0) {
    // Mixed with some incompatible - use overrides
    suggestion = 'hoist-with-overrides';
    confidence = 'medium';
    evidence.push('Mix of conflict severities, overrides can resolve most issues');
  } else {
    // Only major conflicts
    suggestion = 'hoist-with-overrides';
    confidence = 'medium';
    evidence.push('Major conflicts can be resolved with version overrides');
  }

  const alternatives = ['hoist', 'isolate', 'hoist-with-overrides'].filter(
    (s) => s !== suggestion
  );

  return {
    topic: 'dependency-strategy',
    suggestion,
    confidence,
    evidence,
    alternatives,
  };
}
