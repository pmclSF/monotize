import type {
  DependencyConflict,
  PackageManagerType,
  PlanDecision,
  PackageInfo,
  VerifyCheck,
} from '../types/index.js';
import { readJson, pathExists } from '../utils/fs.js';
import path from 'node:path';

/**
 * Generate package manager overrides/resolutions from resolved conflict decisions.
 */
export function generateOverrides(
  conflicts: DependencyConflict[],
  decisions: PlanDecision[],
  _pmType: PackageManagerType,
): Record<string, string> {
  const overrides: Record<string, string> = {};

  for (const conflict of conflicts) {
    // Find the decision for this conflict
    const decision = decisions.find((d) => d.id === `dep-${conflict.name}`);
    const resolvedVersion = decision?.chosen || conflict.versions[0]?.version;

    if (resolvedVersion) {
      overrides[conflict.name] = resolvedVersion;
    }
  }

  return overrides;
}

/**
 * Get the correct key name for overrides based on package manager.
 */
export function getOverridesKey(pmType: PackageManagerType): string {
  switch (pmType) {
    case 'pnpm':
      return 'pnpm.overrides';
    case 'yarn':
    case 'yarn-berry':
      return 'resolutions';
    case 'npm':
      return 'overrides';
  }
}

/**
 * Normalize internal dependencies to use workspace protocol.
 */
export function normalizeToWorkspaceProtocol(
  _rootPkgJson: Record<string, unknown>,
  packages: PackageInfo[],
  workspaceProtocol: string,
): Array<{ packageName: string; dependency: string; from: string; to: string }> {
  const updates: Array<{ packageName: string; dependency: string; from: string; to: string }> = [];
  const packageNames = new Set(packages.map((p) => p.name));

  for (const pkg of packages) {
    for (const depType of ['dependencies', 'devDependencies'] as const) {
      const deps = pkg[depType];
      if (!deps) continue;

      for (const [dep, version] of Object.entries(deps)) {
        if (packageNames.has(dep) && !version.startsWith('workspace:')) {
          updates.push({
            packageName: pkg.name,
            dependency: dep,
            from: version,
            to: workspaceProtocol,
          });
        }
      }
    }
  }

  return updates;
}

/**
 * Apply overrides to root package.json in-place.
 */
export function applyOverridesToPackageJson(
  rootPkgJson: Record<string, unknown>,
  overrides: Record<string, string>,
  pmType: PackageManagerType,
): Record<string, unknown> {
  const result = { ...rootPkgJson };
  const key = getOverridesKey(pmType);

  if (key === 'pnpm.overrides') {
    // Nested under pnpm key
    const pnpmConfig = (result.pnpm as Record<string, unknown>) || {};
    pnpmConfig.overrides = overrides;
    result.pnpm = pnpmConfig;
  } else {
    result[key] = overrides;
  }

  return result;
}

/**
 * Verify that enforcement is properly configured.
 */
export async function verifyEnforcement(
  monorepoDir: string,
  pmType: PackageManagerType,
): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];
  const rootPkgPath = path.join(monorepoDir, 'package.json');

  if (!(await pathExists(rootPkgPath))) {
    checks.push({
      id: 'enforcement-no-root-pkg',
      message: 'No root package.json found',
      status: 'fail',
      tier: 'static',
    });
    return checks;
  }

  try {
    const rootPkg = (await readJson(rootPkgPath)) as Record<string, unknown>;
    const key = getOverridesKey(pmType);

    if (key === 'pnpm.overrides') {
      const pnpmConfig = rootPkg.pnpm as Record<string, unknown> | undefined;
      const overrides = pnpmConfig?.overrides as Record<string, string> | undefined;
      if (overrides && Object.keys(overrides).length > 0) {
        checks.push({
          id: 'enforcement-overrides-present',
          message: `pnpm overrides configured (${Object.keys(overrides).length} entries)`,
          status: 'pass',
          tier: 'static',
        });
      } else {
        checks.push({
          id: 'enforcement-overrides-missing',
          message: 'No pnpm overrides configured',
          status: 'warn',
          tier: 'static',
          details: 'Consider adding pnpm.overrides to enforce dependency versions',
        });
      }
    } else {
      const overrides = rootPkg[key] as Record<string, string> | undefined;
      if (overrides && Object.keys(overrides).length > 0) {
        checks.push({
          id: 'enforcement-overrides-present',
          message: `${key} configured (${Object.keys(overrides).length} entries)`,
          status: 'pass',
          tier: 'static',
        });
      } else {
        checks.push({
          id: 'enforcement-overrides-missing',
          message: `No ${key} configured`,
          status: 'warn',
          tier: 'static',
          details: `Consider adding ${key} to enforce dependency versions`,
        });
      }
    }
  } catch {
    checks.push({
      id: 'enforcement-parse-error',
      message: 'Could not parse root package.json',
      status: 'fail',
      tier: 'static',
    });
  }

  return checks;
}
