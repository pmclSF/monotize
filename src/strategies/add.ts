import path from 'node:path';
import { analyzeDependencies, detectFileCollisions } from '../analyzers/index.js';
import { detectCircularDependencies, computeHotspots } from '../analyzers/graph.js';
import { cloneOrCopyRepos } from './copy.js';
import type {
  AddPlan,
  AddCommandOptions,
  AnalyzeResult,
  Logger,
  PlanDecision,
  PlanOperation,
  RepoSource,
  CrossDependency,
} from '../types/index.js';
import { validateRepoSources } from '../utils/validation.js';
import { readJson, pathExists, listDirs, createTempDir } from '../utils/fs.js';

/**
 * Analyze an existing monorepo to discover its current packages
 */
async function discoverMonorepoPackages(
  monorepoPath: string,
  packagesDir: string,
): Promise<string[]> {
  const pkgDir = path.join(monorepoPath, packagesDir);
  if (!(await pathExists(pkgDir))) return [];
  const dirs = await listDirs(pkgDir);
  return dirs;
}

/**
 * Detect cross-dependencies between new repo and existing packages
 */
function detectCrossDeps(
  newPkgName: string,
  newDeps: Record<string, string>,
  existingPackageNames: string[],
): CrossDependency[] {
  const cross: CrossDependency[] = [];
  for (const [dep, version] of Object.entries(newDeps)) {
    if (existingPackageNames.includes(dep)) {
      cross.push({
        fromPackage: newPkgName,
        toPackage: dep,
        currentVersion: version,
        dependencyType: 'dependencies',
      });
    }
  }
  return cross;
}

/**
 * Generate an AddPlan for adding a repository to an existing monorepo
 */
export async function generateAddPlan(
  repoInput: string,
  options: AddCommandOptions,
  logger: Logger,
): Promise<AddPlan> {
  // Validate source
  const validation = await validateRepoSources([repoInput]);
  if (!validation.valid) {
    throw new Error(`Invalid repository source: ${validation.errors.join(', ')}`);
  }
  const source: RepoSource = validation.sources[0];

  // Check target monorepo exists
  const monorepoPath = path.resolve(options.to);
  if (!(await pathExists(monorepoPath))) {
    throw new Error(`Target monorepo does not exist: ${monorepoPath}`);
  }
  const rootPkgPath = path.join(monorepoPath, 'package.json');
  if (!(await pathExists(rootPkgPath))) {
    throw new Error(`No package.json found in monorepo: ${monorepoPath}`);
  }

  logger.info(`Analyzing target monorepo at ${monorepoPath}`);

  // Discover existing packages
  const existingPkgs = await discoverMonorepoPackages(monorepoPath, options.packagesDir);
  logger.info(`Found ${existingPkgs.length} existing packages`);

  // Clone/copy the new repo into temp dir
  const tempDir = await createTempDir('monotize-add-');
  logger.info(`Cloning ${source.original}...`);
  const clonedRepos = await cloneOrCopyRepos([source], tempDir, { logger });
  const cloned = clonedRepos[0];

  // Build paths array for analysis
  const existingRepoPaths = existingPkgs.map((p) => ({
    path: path.join(monorepoPath, options.packagesDir, p),
    name: p,
  }));
  const allRepoPaths = [...existingRepoPaths, { path: cloned.path, name: cloned.name }];

  // Analyze
  const depAnalysis = await analyzeDependencies(allRepoPaths);
  const collisions = await detectFileCollisions([{ path: cloned.path, name: cloned.name }]);
  const crossDeps = detectCrossDeps(
    cloned.name,
    depAnalysis.resolvedDependencies,
    existingPkgs,
  );
  const circular = detectCircularDependencies(crossDeps);
  const hotspots = computeHotspots(depAnalysis.packages, depAnalysis.conflicts);

  // Read new package info
  const newPkgJson = (await readJson(path.join(cloned.path, 'package.json'))) as Record<
    string,
    unknown
  >;
  const newPkgName = (newPkgJson.name as string) || source.name;
  const newDeps = (newPkgJson.dependencies as Record<string, string>) || {};
  const detailedCrossDeps = detectCrossDeps(newPkgName, newDeps, existingPkgs);

  // Calculate complexity
  const complexityScore = Math.min(
    100,
    depAnalysis.conflicts.length * 5 + collisions.length * 3 + circular.length * 10,
  );

  const analysis: AnalyzeResult = {
    packages: depAnalysis.packages,
    conflicts: depAnalysis.conflicts,
    collisions,
    crossDependencies: detailedCrossDeps,
    complexityScore,
    recommendations: [],
    circularDependencies: circular,
    hotspots,
  };

  // Generate decisions from conflicts
  const decisions: PlanDecision[] = depAnalysis.conflicts.map((c) => ({
    id: `dep-${c.name}`,
    kind: 'version-conflict',
    chosen: c.versions[0]?.version ?? 'unknown',
    alternatives: c.versions.slice(1).map((v) => v.version),
  }));

  // Generate operations
  const operations: PlanOperation[] = [
    {
      id: 'copy-package',
      type: 'copy',
      description: `Copy ${source.name} to ${options.packagesDir}/${source.name}`,
      inputs: [cloned.path],
      outputs: [path.join(options.packagesDir, source.name)],
    },
    {
      id: 'update-root-pkg',
      type: 'write',
      description: 'Update root package.json with new workspace references',
      inputs: ['package.json'],
      outputs: ['package.json'],
    },
    {
      id: 'update-workspace-config',
      type: 'write',
      description: 'Update workspace configuration',
      inputs: [],
      outputs: ['pnpm-workspace.yaml'],
    },
    {
      id: 'install-deps',
      type: 'exec',
      description: 'Install dependencies',
      inputs: [],
      outputs: ['node_modules'],
    },
  ];

  logger.success(`Add plan generated with ${operations.length} operations`);

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceRepo: source,
    targetMonorepo: monorepoPath,
    packagesDir: options.packagesDir,
    analysis,
    decisions,
    operations,
  };
}

/**
 * Apply an AddPlan to an existing monorepo
 */
export async function applyAddPlan(
  plan: AddPlan,
  logger: Logger,
): Promise<{ success: boolean; packageDir: string }> {
  const { targetMonorepo, packagesDir, sourceRepo, operations } = plan;

  // Execute operations
  for (const op of operations) {
    logger.info(`Executing: ${op.description}`);

    switch (op.type) {
      case 'copy': {
        const { copyDir, ensureDir } = await import('../utils/fs.js');
        const destDir = path.join(targetMonorepo, packagesDir, sourceRepo.name);
        await ensureDir(destDir);
        if (op.inputs[0]) {
          await copyDir(op.inputs[0], destDir);
        }
        break;
      }
      case 'write': {
        const rootPkgPath = path.join(targetMonorepo, 'package.json');
        const rootPkg = (await readJson(rootPkgPath)) as Record<string, unknown>;
        const workspaces = rootPkg.workspaces as string[] | undefined;
        if (workspaces && !workspaces.includes(`${packagesDir}/${sourceRepo.name}`)) {
          workspaces.push(`${packagesDir}/${sourceRepo.name}`);
          workspaces.sort();
        }
        const { writeJson } = await import('../utils/fs.js');
        await writeJson(rootPkgPath, rootPkg);
        break;
      }
      case 'exec': {
        logger.info('Skipping install step (run manually after reviewing changes)');
        break;
      }
    }
  }

  const packageDir = path.join(targetMonorepo, packagesDir, sourceRepo.name);
  logger.success(`Added ${sourceRepo.name} to ${packageDir}`);
  return { success: true, packageDir };
}
