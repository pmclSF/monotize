import path from 'node:path';
import type {
  ApplyPlan,
  ConflictStrategy,
  FileCollision,
  FileCollisionStrategy,
  Logger,
  PackageManagerConfig,
  PackageManagerType,
  PlanFile,
  WorkspaceTool,
  WorkflowMergeStrategy,
} from '../types/index.js';
import { ensureDir, pathExists, readJson, writeJson } from '../utils/fs.js';
import { validateRepoSources } from '../utils/validation.js';
import { analyzeDependencies } from '../analyzers/dependencies.js';
import { detectFileCollisions } from '../analyzers/files.js';
import { cloneOrCopyRepos } from '../strategies/copy.js';
import {
  generateRootReadme,
  mergeGitignores,
  resolveFileCollisionToContent,
} from '../strategies/merge-files.js';
import { generateWorkspaceConfig } from '../strategies/workspace-config.js';
import {
  generateWorkspaceToolConfig,
  getWorkspaceToolDependencies,
  updateScriptsForWorkspaceTool,
} from '../strategies/workspace-tools.js';
import { mergeWorkflowsToFiles } from '../strategies/workflow-merge.js';
import {
  resolveDependencyConflicts,
} from '../resolvers/dependencies.js';
import {
  createPackageManagerConfig,
  detectPackageManagerFromSources,
  generateWorkspaceFiles,
  getWorkspacesConfig,
  getGitignoreEntries,
  getPackageManagerField,
  validatePackageManager,
} from '../strategies/package-manager.js';

export interface BuildPlanOptions {
  repos: string[];
  outputDir: string;
  packagesDir: string;
  sourcesDir: string;
  conflictStrategy: ConflictStrategy;
  packageManager: PackageManagerType;
  autoDetectPm?: boolean;
  workspaceTool: WorkspaceTool;
  workflowStrategy: WorkflowMergeStrategy;
  install: boolean;
  noHoist?: boolean;
  pinVersions?: boolean;
  yes?: boolean;
  interactive?: boolean;
  verbose?: boolean;
  logger: Logger;
  promptConflictStrategy?: () => Promise<ConflictStrategy>;
  promptFileCollisionStrategy?: (
    collision: FileCollision
  ) => Promise<FileCollisionStrategy>;
}

export interface BuildPlanResult {
  plan: ApplyPlan;
  repoPaths: Array<{ path: string; name: string }>;
  collisions: FileCollision[];
  depAnalysis: Awaited<ReturnType<typeof analyzeDependencies>>;
  pmType: PackageManagerType;
  pmConfig: PackageManagerConfig;
}

export async function buildApplyPlan(options: BuildPlanOptions): Promise<BuildPlanResult> {
  const logger = options.logger;
  const outputDir = path.resolve(options.outputDir);
  const packagesDir = options.packagesDir;
  const interactive = options.interactive ?? false;
  const yes = options.yes ?? false;
  const noHoist = options.noHoist ?? false;
  const pinVersions = options.pinVersions ?? false;

  logger.info('Validating repository sources...');
  const validation = await validateRepoSources(options.repos);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
  logger.success(`Found ${validation.sources.length} repositories to merge`);

  await ensureDir(options.sourcesDir);
  logger.info('Fetching repositories...');
  const repoPaths = await cloneOrCopyRepos(validation.sources, options.sourcesDir, {
    logger,
    verbose: options.verbose,
  });

  let pmType = options.packageManager;
  if (options.autoDetectPm) {
    const detected = await detectPackageManagerFromSources(repoPaths);
    if (detected) {
      pmType = detected;
    }
  }

  const pmValidation = validatePackageManager(pmType);
  if (!pmValidation.valid) {
    throw new Error(pmValidation.error || 'Invalid package manager');
  }
  const pmConfig = createPackageManagerConfig(pmType);

  logger.info('Analyzing dependencies...');
  const depAnalysis = await analyzeDependencies(repoPaths);

  logger.info('Detecting file collisions...');
  const collisions = await detectFileCollisions(repoPaths);

  let conflictStrategy = options.conflictStrategy;
  if (depAnalysis.conflicts.length > 0 && conflictStrategy === 'prompt') {
    if (interactive && !yes && options.promptConflictStrategy) {
      conflictStrategy = await options.promptConflictStrategy();
    } else {
      conflictStrategy = 'highest';
    }
  }

  const resolvedDeps = await resolveDependencyConflicts(
    depAnalysis.conflicts,
    conflictStrategy,
    depAnalysis.resolvedDependencies,
    depAnalysis.resolvedDevDependencies
  );

  const fileStrategies = new Map<string, FileCollisionStrategy>();
  for (const collision of collisions) {
    let strategy = collision.suggestedStrategy as FileCollisionStrategy;
    if (interactive && !yes && collision.suggestedStrategy !== 'skip' && options.promptFileCollisionStrategy) {
      strategy = await options.promptFileCollisionStrategy(collision);
    }
    fileStrategies.set(collision.path, strategy);
  }

  const workspaceConfig = generateWorkspaceConfig(depAnalysis.packages, {
    rootName: path.basename(outputDir),
    packagesDir,
    dependencies: noHoist ? {} : resolvedDeps.dependencies,
    devDependencies: noHoist ? {} : resolvedDeps.devDependencies,
    pmConfig,
  });

  if (options.workspaceTool !== 'none') {
    const availableScripts = Object.keys(
      (workspaceConfig.rootPackageJson.scripts as Record<string, string>) || {}
    );
    const updatedScripts = updateScriptsForWorkspaceTool(
      workspaceConfig.rootPackageJson.scripts as Record<string, string>,
      options.workspaceTool,
      availableScripts
    );
    workspaceConfig.rootPackageJson.scripts = updatedScripts;

    const toolDeps = getWorkspaceToolDependencies(options.workspaceTool);
    const existingDevDeps =
      (workspaceConfig.rootPackageJson.devDependencies as Record<string, string>) || {};
    workspaceConfig.rootPackageJson.devDependencies = { ...existingDevDeps, ...toolDeps };
  }

  const workspacesConfig = getWorkspacesConfig(pmConfig, packagesDir);
  if (workspacesConfig) {
    workspaceConfig.rootPackageJson.workspaces = workspacesConfig;
  }
  workspaceConfig.rootPackageJson.packageManager = getPackageManagerField(pmConfig);

  const planFiles: PlanFile[] = [];

  const workspaceFiles = generateWorkspaceFiles(pmConfig, packagesDir);
  for (const file of workspaceFiles) {
    planFiles.push({ relativePath: file.filename, content: file.content });
  }

  if (options.workspaceTool !== 'none') {
    const toolConfig = generateWorkspaceToolConfig(depAnalysis.packages, options.workspaceTool);
    if (toolConfig) {
      planFiles.push({ relativePath: toolConfig.filename, content: toolConfig.content });
    }
  }

  if (options.workflowStrategy !== 'skip') {
    logger.info('Processing CI/CD workflows...');
    try {
      const workflowFiles = await mergeWorkflowsToFiles(repoPaths, options.workflowStrategy);
      planFiles.push(
        ...workflowFiles.map((f) => ({ relativePath: f.relativePath, content: f.content }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to process workflows: ${message}`);
    }
  }

  for (const collision of collisions) {
    const strategy = fileStrategies.get(collision.path) || (collision.suggestedStrategy as FileCollisionStrategy);
    const collisionFiles = await resolveFileCollisionToContent(collision, strategy, repoPaths);
    planFiles.push(
      ...collisionFiles.map((f) => ({ relativePath: f.relativePath, content: f.content }))
    );
  }

  const hasGitignoreCollision = collisions.some((c) => c.path === '.gitignore');
  if (!hasGitignoreCollision) {
    const gitignorePaths: string[] = [];
    for (const r of repoPaths) {
      const p = path.join(r.path, '.gitignore');
      if (await pathExists(p)) {
        gitignorePaths.push(p);
      }
    }

    let gitignoreContent =
      gitignorePaths.length > 0
        ? await mergeGitignores(gitignorePaths)
        : 'node_modules/\ndist/\n.DS_Store\n*.log\n';
    const pmEntries = getGitignoreEntries(pmConfig);
    if (pmEntries.length > 0) {
      gitignoreContent += '\n# Package manager\n' + pmEntries.join('\n') + '\n';
    }
    planFiles.push({ relativePath: '.gitignore', content: gitignoreContent });
  }

  const readmeContent = generateRootReadme(
    repoPaths.map((r) => r.name),
    packagesDir,
    pmConfig
  );
  planFiles.push({ relativePath: 'README.md', content: readmeContent });

  if (noHoist) {
    const npmrcContent = `# Prevent dependency hoisting - each package manages its own dependencies
# This helps avoid type conflicts between packages with different version requirements
shamefully-hoist=false
hoist=false

# Use lowest satisfying versions to avoid breaking changes in newer releases
resolution-mode=lowest
`;
    planFiles.push({ relativePath: '.npmrc', content: npmrcContent });
  }

  if (pinVersions) {
    logger.debug('Pinning dependency versions (removing ^ and ~ ranges)');
    for (const repo of repoPaths) {
      const pkgJsonPath = path.join(repo.path, 'package.json');
      if (!(await pathExists(pkgJsonPath))) continue;
      try {
        const pkgJson = await readJson<Record<string, unknown>>(pkgJsonPath);
        let modified = false;

        const pinDeps = (
          deps: Record<string, string> | undefined
        ): Record<string, string> | undefined => {
          if (!deps) return deps;
          const pinned: Record<string, string> = {};
          for (const [name, version] of Object.entries(deps)) {
            if (version.startsWith('^') || version.startsWith('~')) {
              pinned[name] = version.slice(1);
              modified = true;
            } else {
              pinned[name] = version;
            }
          }
          return pinned;
        };

        pkgJson.dependencies = pinDeps(pkgJson.dependencies as Record<string, string>);
        pkgJson.devDependencies = pinDeps(pkgJson.devDependencies as Record<string, string>);
        pkgJson.peerDependencies = pinDeps(pkgJson.peerDependencies as Record<string, string>);

        if (modified) {
          await writeJson(pkgJsonPath, pkgJson, { spaces: 2 });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to pin versions in ${repo.name}: ${message}`);
      }
    }
  }

  const plan: ApplyPlan = {
    version: 1,
    sources: repoPaths.map((r) => ({ name: r.name, path: r.path })),
    packagesDir,
    rootPackageJson: workspaceConfig.rootPackageJson,
    files: planFiles,
    install: options.install,
    installCommand: pmConfig.installCommand,
    analysisFindings: depAnalysis.findings,
  };

  return {
    plan,
    repoPaths,
    collisions,
    depAnalysis,
    pmType,
    pmConfig,
  };
}
