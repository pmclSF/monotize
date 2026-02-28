import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  ApplyPlan,
  PackageInfo,
  VerifyCheck,
  VerifyTier,
} from '../types/index.js';
import { pathExists, readJson, readFile, listDirs } from '../utils/fs.js';
import { detectCrossDependencies } from './analyze.js';
import { detectCircularDependencies } from '../analyzers/graph.js';
import { detectPackageManager, createPackageManagerConfig } from '../strategies/package-manager.js';

/**
 * Shared context passed to every check function.
 * Exactly one of plan / dir will be non-null.
 */
export interface VerifyContext {
  plan: ApplyPlan | null;
  dir: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read PackageInfo[] from a monorepo directory's packages/ subfolder. */
async function readPackagesFromDir(dir: string): Promise<PackageInfo[]> {
  const packagesDir = path.join(dir, 'packages');
  if (!(await pathExists(packagesDir))) return [];

  const dirs = await listDirs(packagesDir);
  const packages: PackageInfo[] = [];

  for (const name of dirs) {
    const pkgJsonPath = path.join(packagesDir, name, 'package.json');
    if (!(await pathExists(pkgJsonPath))) continue;
    try {
      const pkgJson = await readJson<Record<string, unknown>>(pkgJsonPath);
      packages.push({
        name: (pkgJson.name as string) || '',
        version: (pkgJson.version as string) || '',
        dependencies: (pkgJson.dependencies as Record<string, string>) || {},
        devDependencies: (pkgJson.devDependencies as Record<string, string>) || {},
        peerDependencies: (pkgJson.peerDependencies as Record<string, string>) || {},
        scripts: (pkgJson.scripts as Record<string, string>) || {},
        path: path.join(packagesDir, name),
        repoName: name,
      });
    } catch {
      // skip malformed package.json
    }
  }
  return packages;
}

/** Build PackageInfo[] from plan sources.
 *  First tries reading package.json from the source path on disk.
 *  Falls back to checking plan.files for packages/<name>/package.json entries. */
async function packagesFromPlan(plan: ApplyPlan): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  for (const source of plan.sources) {
    let pkgJson: Record<string, unknown> | null = null;

    // Try reading from the cloned source directory
    const pkgJsonPath = path.join(source.path, 'package.json');
    if (await pathExists(pkgJsonPath)) {
      try {
        pkgJson = await readJson<Record<string, unknown>>(pkgJsonPath);
      } catch { /* fall through */ }
    }

    // Fallback: check plan.files for an inline package.json
    if (!pkgJson) {
      const prefix = `${plan.packagesDir}/${source.name}/`;
      const pkgFile = plan.files.find(
        (f) => f.relativePath === `${prefix}package.json`
      );
      if (pkgFile) {
        try {
          pkgJson = JSON.parse(pkgFile.content) as Record<string, unknown>;
        } catch { /* skip */ }
      }
    }

    if (pkgJson) {
      packages.push({
        name: (pkgJson.name as string) || '',
        version: (pkgJson.version as string) || '',
        dependencies: (pkgJson.dependencies as Record<string, string>) || {},
        devDependencies: (pkgJson.devDependencies as Record<string, string>) || {},
        peerDependencies: (pkgJson.peerDependencies as Record<string, string>) || {},
        scripts: (pkgJson.scripts as Record<string, string>) || {},
        path: source.path,
        repoName: source.name,
      });
    }
  }
  return packages;
}

/** Get packages for the current context. */
async function getPackages(ctx: VerifyContext): Promise<PackageInfo[]> {
  if (ctx.plan) return packagesFromPlan(ctx.plan);
  if (ctx.dir) return readPackagesFromDir(ctx.dir);
  return [];
}

function check(
  id: string,
  message: string,
  status: VerifyCheck['status'],
  tier: VerifyTier,
  planRef?: string,
  details?: string
): VerifyCheck {
  const c: VerifyCheck = { id, message, status, tier };
  if (planRef) c.planRef = planRef;
  if (details) c.details = details;
  return c;
}

// ---------------------------------------------------------------------------
// Static tier checks
// ---------------------------------------------------------------------------

export async function checkRootPackageJson(ctx: VerifyContext): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];

  if (ctx.plan) {
    const root = ctx.plan.rootPackageJson;
    checks.push(
      root.private === true
        ? check('root-private', 'Root package.json has private: true', 'pass', 'static', 'rootPackageJson.private')
        : check('root-private', 'Root package.json missing private: true', 'fail', 'static', 'rootPackageJson.private')
    );
    checks.push(
      root.name
        ? check('root-name', 'Root package.json has name field', 'pass', 'static')
        : check('root-name', 'Root package.json missing name field', 'fail', 'static')
    );
    checks.push(
      root.scripts && typeof root.scripts === 'object' && Object.keys(root.scripts).length > 0
        ? check('root-scripts-exist', 'Root package.json has scripts', 'pass', 'static')
        : check('root-scripts-exist', 'Root package.json has no scripts', 'warn', 'static')
    );
  } else if (ctx.dir) {
    const rootPkgPath = path.join(ctx.dir, 'package.json');
    try {
      const root = await readJson<Record<string, unknown>>(rootPkgPath);
      checks.push(
        root.private === true
          ? check('root-private', 'Root package.json has private: true', 'pass', 'static', 'rootPackageJson.private')
          : check('root-private', 'Root package.json missing private: true', 'fail', 'static', 'rootPackageJson.private')
      );
      checks.push(
        root.name
          ? check('root-name', 'Root package.json has name field', 'pass', 'static')
          : check('root-name', 'Root package.json missing name field', 'fail', 'static')
      );
      checks.push(
        root.scripts && typeof root.scripts === 'object' && Object.keys(root.scripts as Record<string, unknown>).length > 0
          ? check('root-scripts-exist', 'Root package.json has scripts', 'pass', 'static')
          : check('root-scripts-exist', 'Root package.json has no scripts', 'warn', 'static')
      );
    } catch {
      checks.push(check('root-private', 'Could not read root package.json', 'fail', 'static'));
    }
  }

  return checks;
}

export async function checkWorkspaceConfig(ctx: VerifyContext): Promise<VerifyCheck[]> {
  if (ctx.plan) {
    const hasPnpmWs = ctx.plan.files.some(
      (f) => f.relativePath === 'pnpm-workspace.yaml'
    );
    const hasWorkspacesField =
      ctx.plan.rootPackageJson.workspaces !== undefined;
    if (hasPnpmWs || hasWorkspacesField) {
      return [check('workspace-config', 'Workspace configuration found', 'pass', 'static', 'files[pnpm-workspace.yaml]')];
    }
    return [check('workspace-config', 'No workspace configuration found (pnpm-workspace.yaml or workspaces field)', 'fail', 'static', 'files[pnpm-workspace.yaml]')];
  }

  if (ctx.dir) {
    const hasPnpmWs = await pathExists(path.join(ctx.dir, 'pnpm-workspace.yaml'));
    let hasWorkspacesField = false;
    try {
      const root = await readJson<Record<string, unknown>>(path.join(ctx.dir, 'package.json'));
      hasWorkspacesField = root.workspaces !== undefined;
    } catch { /* ignore */ }

    if (hasPnpmWs || hasWorkspacesField) {
      return [check('workspace-config', 'Workspace configuration found', 'pass', 'static', 'files[pnpm-workspace.yaml]')];
    }
    return [check('workspace-config', 'No workspace configuration found', 'fail', 'static', 'files[pnpm-workspace.yaml]')];
  }

  return [];
}

export async function checkPackageNames(ctx: VerifyContext): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];
  const packages = await getPackages(ctx);

  if (packages.length === 0) {
    checks.push(check('pkg-names', 'No packages found', 'warn', 'static'));
    return checks;
  }

  for (const pkg of packages) {
    const sourceRef = ctx.plan
      ? `sources[${pkg.repoName}].name`
      : undefined;
    if (pkg.name) {
      checks.push(check(`pkg-name:${pkg.repoName}`, `Package ${pkg.repoName} has name "${pkg.name}"`, 'pass', 'static', sourceRef));
    } else {
      checks.push(check(`pkg-name:${pkg.repoName}`, `Package ${pkg.repoName} missing name in package.json`, 'fail', 'static', sourceRef));
    }
  }

  return checks;
}

export async function checkRootScripts(ctx: VerifyContext): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];
  const packages = await getPackages(ctx);
  // Include both package names and source/directory names as valid filter targets
  const packageNames = new Set([
    ...packages.map((p) => p.name),
    ...packages.map((p) => p.repoName),
  ]);

  let scripts: Record<string, string> = {};

  if (ctx.plan) {
    scripts = (ctx.plan.rootPackageJson.scripts as Record<string, string>) || {};
  } else if (ctx.dir) {
    try {
      const root = await readJson<Record<string, unknown>>(path.join(ctx.dir, 'package.json'));
      scripts = (root.scripts as Record<string, string>) || {};
    } catch {
      return [check('root-scripts', 'Could not read root package.json scripts', 'warn', 'static')];
    }
  }

  // Check --filter refs point to real packages
  for (const [name, cmd] of Object.entries(scripts)) {
    const filterMatch = cmd.match(/--filter\s+(\S+)/);
    if (filterMatch) {
      const filterPkg = filterMatch[1];
      if (packageNames.has(filterPkg)) {
        checks.push(check(`root-script:${name}`, `Script "${name}" filter ref "${filterPkg}" resolves to a real package`, 'pass', 'static', `rootPackageJson.scripts.${name}`));
      } else {
        checks.push(check(`root-script:${name}`, `Script "${name}" filter ref "${filterPkg}" does not match any package`, 'fail', 'static', `rootPackageJson.scripts.${name}`));
      }
    }
  }

  if (checks.length === 0) {
    checks.push(check('root-scripts', 'No --filter references found in root scripts', 'pass', 'static'));
  }

  return checks;
}

export async function checkTsconfigSanity(ctx: VerifyContext): Promise<VerifyCheck[]> {
  // Plan mode: return skip-warn since we can't resolve file paths
  if (ctx.plan) {
    return [check('tsconfig', 'tsconfig validation skipped in plan mode (requires --dir)', 'warn', 'static', undefined, 'Use --dir to validate tsconfig files')];
  }

  if (!ctx.dir) return [];

  const checks: VerifyCheck[] = [];

  // Check root tsconfig
  const rootTsconfigPath = path.join(ctx.dir, 'tsconfig.json');
  if (await pathExists(rootTsconfigPath)) {
    try {
      const content = await readFile(rootTsconfigPath);
      JSON.parse(content);
      checks.push(check('tsconfig:root', 'Root tsconfig.json is valid JSON', 'pass', 'static'));

      // Check references resolve
      const tsconfig = JSON.parse(content) as Record<string, unknown>;
      if (Array.isArray(tsconfig.references)) {
        for (const ref of tsconfig.references) {
          const refPath = (ref as Record<string, unknown>).path as string;
          if (refPath) {
            const resolved = path.resolve(ctx.dir, refPath);
            const resolvedTsconfig = (await pathExists(path.join(resolved, 'tsconfig.json')))
              || (await pathExists(resolved));
            if (resolvedTsconfig) {
              checks.push(check(`tsconfig-ref:${refPath}`, `tsconfig reference "${refPath}" resolves`, 'pass', 'static'));
            } else {
              checks.push(check(`tsconfig-ref:${refPath}`, `tsconfig reference "${refPath}" does not resolve`, 'fail', 'static'));
            }
          }
        }
      }
    } catch {
      checks.push(check('tsconfig:root', 'Root tsconfig.json is not valid JSON', 'fail', 'static'));
    }
  }

  // Check package tsconfigs
  const packages = await readPackagesFromDir(ctx.dir);
  for (const pkg of packages) {
    const pkgTsconfigPath = path.join(pkg.path, 'tsconfig.json');
    if (await pathExists(pkgTsconfigPath)) {
      try {
        const content = await readFile(pkgTsconfigPath);
        JSON.parse(content);
        checks.push(check(`tsconfig:${pkg.repoName}`, `Package ${pkg.repoName} tsconfig.json is valid JSON`, 'pass', 'static'));
      } catch {
        checks.push(check(`tsconfig:${pkg.repoName}`, `Package ${pkg.repoName} tsconfig.json is not valid JSON`, 'fail', 'static'));
      }
    }
  }

  if (checks.length === 0) {
    checks.push(check('tsconfig', 'No tsconfig.json files found', 'pass', 'static'));
  }

  return checks;
}

export async function checkCircularDeps(ctx: VerifyContext): Promise<VerifyCheck[]> {
  const packages = await getPackages(ctx);
  if (packages.length === 0) {
    return [check('circular-deps', 'No packages to check for circular dependencies', 'pass', 'static')];
  }

  const crossDeps = detectCrossDependencies(packages);
  const circular = detectCircularDependencies(crossDeps);

  if (circular.length === 0) {
    return [check('circular-deps', 'No circular dependencies detected', 'pass', 'static', 'analysisFindings.decisions')];
  }

  return circular.map((c, i) => check(
    `circular-dep:${i}`,
    `Circular dependency: ${c.cycle.join(' -> ')} -> ${c.cycle[0]}`,
    'warn',
    'static',
    'analysisFindings.decisions',
    `Edge types: ${c.edgeTypes.join(', ')}`
  ));
}

export async function checkRequiredFields(ctx: VerifyContext): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];
  const packages = await getPackages(ctx);

  // Check each package has version
  for (const pkg of packages) {
    if (pkg.version) {
      checks.push(check(`pkg-version:${pkg.repoName}`, `Package ${pkg.repoName} has version`, 'pass', 'static'));
    } else {
      checks.push(check(`pkg-version:${pkg.repoName}`, `Package ${pkg.repoName} missing version field`, 'warn', 'static'));
    }
  }

  // Check root has engines
  let hasEngines = false;
  if (ctx.plan) {
    hasEngines = ctx.plan.rootPackageJson.engines !== undefined;
  } else if (ctx.dir) {
    try {
      const root = await readJson<Record<string, unknown>>(path.join(ctx.dir, 'package.json'));
      hasEngines = root.engines !== undefined;
    } catch { /* ignore */ }
  }

  checks.push(
    hasEngines
      ? check('root-engines', 'Root package.json has engines field', 'pass', 'static', 'rootPackageJson.engines')
      : check('root-engines', 'Root package.json missing engines field', 'warn', 'static', 'rootPackageJson.engines')
  );

  return checks;
}

// ---------------------------------------------------------------------------
// Install tier checks (dir mode only)
// ---------------------------------------------------------------------------

export async function checkInstall(ctx: VerifyContext): Promise<VerifyCheck[]> {
  if (!ctx.dir) {
    return [check('install', 'Install check requires --dir', 'warn', 'install')];
  }

  const pm = await detectPackageManager(ctx.dir);
  const pmType = pm || 'pnpm';
  const config = createPackageManagerConfig(pmType);

  try {
    const [cmd, ...args] = config.installCommand.split(' ');
    execFileSync(cmd, args, { cwd: ctx.dir, stdio: 'pipe', timeout: 120_000 });
    return [check('install', `Package install (${config.installCommand}) succeeded`, 'pass', 'install', 'installCommand')];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [check('install', `Package install failed`, 'fail', 'install', 'installCommand', msg)];
  }
}

export async function checkLockfileConsistency(ctx: VerifyContext): Promise<VerifyCheck[]> {
  if (!ctx.dir) {
    return [check('lockfile', 'Lockfile check requires --dir', 'warn', 'install')];
  }

  // Check for any known lockfile
  const lockfiles = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'];
  for (const lf of lockfiles) {
    const lfPath = path.join(ctx.dir, lf);
    if (await pathExists(lfPath)) {
      const content = await readFile(lfPath);
      if (content.trim().length > 0) {
        return [check('lockfile', `Lockfile ${lf} exists and is non-empty`, 'pass', 'install')];
      }
      return [check('lockfile', `Lockfile ${lf} exists but is empty`, 'fail', 'install')];
    }
  }

  return [check('lockfile', 'No lockfile found after install', 'fail', 'install')];
}

export async function checkNodeModules(ctx: VerifyContext): Promise<VerifyCheck[]> {
  if (!ctx.dir) {
    return [check('node-modules', 'node_modules check requires --dir', 'warn', 'install')];
  }

  if (await pathExists(path.join(ctx.dir, 'node_modules'))) {
    return [check('node-modules', 'node_modules/ directory exists', 'pass', 'install')];
  }
  return [check('node-modules', 'node_modules/ directory not found', 'fail', 'install')];
}

// ---------------------------------------------------------------------------
// Full tier checks (dir mode only)
// ---------------------------------------------------------------------------

export async function checkBuildScripts(ctx: VerifyContext): Promise<VerifyCheck[]> {
  if (!ctx.dir) {
    return [check('build', 'Build check requires --dir', 'warn', 'full')];
  }

  const checks: VerifyCheck[] = [];
  const packages = await readPackagesFromDir(ctx.dir);

  for (const pkg of packages) {
    if (!pkg.scripts.build) continue;

    try {
      execFileSync('npm', ['run', 'build'], { cwd: pkg.path, stdio: 'pipe', timeout: 120_000 });
      checks.push(check(`build:${pkg.repoName}`, `Build succeeded for ${pkg.name}`, 'pass', 'full', `sources[${pkg.repoName}].name`));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push(check(`build:${pkg.repoName}`, `Build failed for ${pkg.name}`, 'fail', 'full', `sources[${pkg.repoName}].name`, msg));
    }
  }

  if (checks.length === 0) {
    checks.push(check('build', 'No packages have a build script', 'pass', 'full'));
  }

  return checks;
}

export async function checkTestScripts(ctx: VerifyContext): Promise<VerifyCheck[]> {
  if (!ctx.dir) {
    return [check('test', 'Test check requires --dir', 'warn', 'full')];
  }

  const checks: VerifyCheck[] = [];
  const packages = await readPackagesFromDir(ctx.dir);

  for (const pkg of packages) {
    if (!pkg.scripts.test) continue;

    try {
      execFileSync('npm', ['run', 'test'], { cwd: pkg.path, stdio: 'pipe', timeout: 120_000 });
      checks.push(check(`test:${pkg.repoName}`, `Tests passed for ${pkg.name}`, 'pass', 'full', `sources[${pkg.repoName}].name`));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.push(check(`test:${pkg.repoName}`, `Tests failed for ${pkg.name}`, 'fail', 'full', `sources[${pkg.repoName}].name`, msg));
    }
  }

  if (checks.length === 0) {
    checks.push(check('test', 'No packages have a test script', 'pass', 'full'));
  }

  return checks;
}
