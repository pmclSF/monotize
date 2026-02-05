import type { PackageInfo, WorkspaceConfig } from '../types/index.js';

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
}

/**
 * Generate aggregated scripts from all packages
 */
function aggregateScripts(
  packages: PackageInfo[],
  packagesDir: string
): Record<string, string> {
  const scripts: Record<string, string> = {};

  // Common scripts that can be run across all packages
  const commonScripts = ['build', 'test', 'lint', 'typecheck', 'dev', 'start'];

  for (const script of commonScripts) {
    const packagesWithScript = packages.filter((pkg) => pkg.scripts[script]);
    if (packagesWithScript.length > 0) {
      scripts[script] = `pnpm -r ${script}`;
    }
  }

  // Add per-package scripts with prefixes
  for (const pkg of packages) {
    for (const [scriptName, scriptCmd] of Object.entries(pkg.scripts)) {
      const prefixedName = `${pkg.repoName}:${scriptName}`;
      scripts[prefixedName] = `pnpm --filter ${pkg.repoName} ${scriptName}`;
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

  // Generate root package.json
  const rootPackageJson: Record<string, unknown> = {
    name: rootName,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: aggregateScripts(packages, packagesDir),
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
  allPackages: PackageInfo[]
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
        updated[name] = 'workspace:*';
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
