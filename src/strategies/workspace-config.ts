import type { PackageInfo, WorkspaceConfig, CrossDependency, PackageManagerConfig } from '../types/index.js';
import {
  createPackageManagerConfig,
  getPackageManagerField,
} from './package-manager.js';

/**
 * Options for generating workspace configuration
 */
export interface WorkspaceConfigOptions {
  /** Name for the root package */
  rootName?: string;
  /** Subdirectory for packages */
  packagesDir: string;
  /** Resolved dependencies */
  dependencies: Record<string, string>;
  /** Resolved dev dependencies */
  devDependencies: Record<string, string>;
  /** Package manager configuration */
  pmConfig?: PackageManagerConfig;
}

/**
 * Generate aggregated scripts from all packages
 */
function aggregateScripts(
  packages: PackageInfo[],
  _packagesDir: string,
  pmConfig: PackageManagerConfig
): Record<string, string> {
  const scripts: Record<string, string> = {};

  // Common scripts that can be run across all packages
  const commonScripts = ['build', 'test', 'lint', 'typecheck', 'dev', 'start'];

  for (const script of commonScripts) {
    const packagesWithScript = packages.filter((pkg) => pkg.scripts[script]);
    if (packagesWithScript.length > 0) {
      scripts[script] = pmConfig.runAllCommand(script);
    }
  }

  // Add per-package scripts with prefixes
  for (const pkg of packages) {
    for (const scriptName of Object.keys(pkg.scripts)) {
      const prefixedName = `${pkg.repoName}:${scriptName}`;
      scripts[prefixedName] = pmConfig.runFilteredCommand(pkg.repoName, scriptName);
    }
  }

  return scripts;
}

/**
 * Generate workspace configuration for the monorepo
 */
export function generateWorkspaceConfig(
  packages: PackageInfo[],
  options: WorkspaceConfigOptions
): WorkspaceConfig {
  const { rootName = 'monorepo', packagesDir, dependencies, devDependencies } = options;

  // Use provided pmConfig or default to pnpm
  const pmConfig = options.pmConfig || createPackageManagerConfig('pnpm');

  // Generate root package.json
  const rootPackageJson: Record<string, unknown> = {
    name: rootName,
    version: '0.0.0',
    private: true,
    type: 'module',
    packageManager: getPackageManagerField(pmConfig),
    scripts: aggregateScripts(packages, packagesDir, pmConfig),
    dependencies: Object.keys(dependencies).length > 0 ? dependencies : undefined,
    devDependencies: Object.keys(devDependencies).length > 0 ? devDependencies : undefined,
    engines: {
      node: '>=18',
    },
  };

  // Clean up undefined values
  Object.keys(rootPackageJson).forEach((key) => {
    if (rootPackageJson[key] === undefined) {
      delete rootPackageJson[key];
    }
  });

  // Generate pnpm-workspace.yaml content
  const pnpmWorkspace = {
    packages: [`${packagesDir}/*`],
  };

  return {
    rootPackageJson,
    pnpmWorkspace,
  };
}

/**
 * Update a package's package.json for workspace usage
 */
export function updatePackageForWorkspace(
  pkg: PackageInfo,
  allPackages: PackageInfo[],
  workspaceProtocol: string = 'workspace:*'
): Record<string, unknown> {
  const packageJson: Record<string, unknown> = {
    name: pkg.name,
    version: pkg.version,
  };

  // Keep scripts as-is
  if (Object.keys(pkg.scripts).length > 0) {
    packageJson.scripts = pkg.scripts;
  }

  // Update dependencies to use workspace protocol for internal packages
  const internalPackageNames = new Set(allPackages.map((p) => p.name));

  const updateDeps = (deps: Record<string, string>): Record<string, string> => {
    const updated: Record<string, string> = {};
    for (const [name, version] of Object.entries(deps)) {
      if (internalPackageNames.has(name)) {
        updated[name] = workspaceProtocol;
      } else {
        updated[name] = version;
      }
    }
    return updated;
  };

  if (Object.keys(pkg.dependencies).length > 0) {
    packageJson.dependencies = updateDeps(pkg.dependencies);
  }

  if (Object.keys(pkg.devDependencies).length > 0) {
    packageJson.devDependencies = updateDeps(pkg.devDependencies);
  }

  if (Object.keys(pkg.peerDependencies).length > 0) {
    packageJson.peerDependencies = pkg.peerDependencies;
  }

  return packageJson;
}

/**
 * Generate pnpm-workspace.yaml content as string
 */
export function generatePnpmWorkspaceYaml(packagesDir: string): string {
  return `packages:
  - '${packagesDir}/*'
`;
}

/**
 * Detect cross-dependencies between packages
 */
export function detectCrossDependencies(packages: PackageInfo[]): CrossDependency[] {
  const crossDeps: CrossDependency[] = [];
  const packageNames = new Set(packages.map((p) => p.name));

  for (const pkg of packages) {
    const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

    for (const depType of depTypes) {
      const deps = pkg[depType];
      for (const [depName, version] of Object.entries(deps)) {
        if (packageNames.has(depName)) {
          crossDeps.push({
            fromPackage: pkg.name,
            toPackage: depName,
            currentVersion: version,
            dependencyType: depType,
          });
        }
      }
    }
  }

  return crossDeps;
}

/**
 * Rewrite dependencies to use workspace protocol for cross-dependencies
 */
export function rewriteToWorkspaceProtocol(
  packageJson: Record<string, unknown>,
  crossDeps: CrossDependency[]
): Record<string, unknown> {
  const crossDepTargets = new Set(crossDeps.map((d) => d.toPackage));
  const result = { ...packageJson };

  const rewriteDeps = (deps: Record<string, string> | undefined): Record<string, string> | undefined => {
    if (!deps) return deps;

    const rewritten: Record<string, string> = {};
    for (const [name, version] of Object.entries(deps)) {
      if (crossDepTargets.has(name) && !version.startsWith('workspace:')) {
        rewritten[name] = 'workspace:*';
      } else {
        rewritten[name] = version;
      }
    }
    return rewritten;
  };

  if (result.dependencies) {
    result.dependencies = rewriteDeps(result.dependencies as Record<string, string>);
  }
  if (result.devDependencies) {
    result.devDependencies = rewriteDeps(result.devDependencies as Record<string, string>);
  }
  if (result.peerDependencies) {
    result.peerDependencies = rewriteDeps(result.peerDependencies as Record<string, string>);
  }

  return result;
}
