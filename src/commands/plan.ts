import path from 'node:path';
import chalk from 'chalk';
import type {
  ConflictStrategy,
  FileCollisionStrategy,
  WorkspaceTool,
  WorkflowMergeStrategy,
  PackageManagerType,
  ApplyPlan,
  PlanFile,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import {
  createTempDir,
  removeDir,
  ensureDir,
  writeJson,
  readJson,
  pathExists,
} from '../utils/fs.js';
import { validateRepoSources } from '../utils/validation.js';
import {
  promptConflictStrategy,
  promptFileCollisionStrategy,
} from '../utils/prompts.js';
import { analyzeDependencies } from '../analyzers/dependencies.js';
import { detectFileCollisions } from '../analyzers/files.js';
import { cloneOrCopyRepos } from '../strategies/copy.js';
import {
  generateRootReadme,
  mergeGitignores,
  resolveFileCollisionToContent,
} from '../strategies/merge-files.js';
import {
  generateWorkspaceConfig,
} from '../strategies/workspace-config.js';
import {
  generateWorkspaceToolConfig,
  getWorkspaceToolDependencies,
  updateScriptsForWorkspaceTool,
} from '../strategies/workspace-tools.js';
import { mergeWorkflowsToFiles } from '../strategies/workflow-merge.js';
import {
  resolveDependencyConflicts,
  getConflictSummary,
} from '../resolvers/dependencies.js';
import {
  createPackageManagerConfig,
  detectPackageManagerFromSources,
  generateWorkspaceFiles,
  getWorkspacesConfig,
  getGitignoreEntries,
  getPackageManagerField,
  parsePackageManagerType,
  validatePackageManager,
  getPackageManagerDisplayName,
} from '../strategies/package-manager.js';

/**
 * CLI options passed from commander
 */
interface CLIPlanOptions {
  output: string;
  packagesDir: string;
  planFile?: string;
  yes?: boolean;
  conflictStrategy: string;
  verbose?: boolean;
  install: boolean;
  hoist?: boolean;
  pinVersions?: boolean;
  packageManager?: string;
  autoDetectPm?: boolean;
  workspaceTool?: string;
  workflowStrategy?: string;
}

/**
 * Main plan command handler.
 * Mirrors the merge command flow but serializes an ApplyPlan instead of writing to disk.
 */
export async function planCommand(repos: string[], options: CLIPlanOptions): Promise<void> {
  const logger = createLogger(options.verbose);
  let tempDir: string | null = null;

  const outputDir = path.resolve(options.output);
  const packagesDir = options.packagesDir;
  const workspaceTool = (options.workspaceTool as WorkspaceTool) || 'none';
  const workflowStrategy = (options.workflowStrategy as WorkflowMergeStrategy) || 'combine';
  const noHoist = options.hoist === false;
  const yes = options.yes ?? false;

  // Determine plan file path
  const planFilePath = options.planFile
    ? path.resolve(options.planFile)
    : path.resolve(`${path.basename(outputDir)}.plan.json`);

  // Sources directory: co-located with plan file
  const sourcesDir = `${planFilePath}.sources`;

  // Robust cleanup function
  const cleanup = async () => {
    if (tempDir) {
      try {
        logger.debug(`Cleaning up temp directory: ${tempDir}`);
        await removeDir(tempDir);
      } catch (error) {
        logger.warn(`Failed to cleanup temp directory: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  process.on('SIGINT', async () => {
    logger.warn('\nInterrupted. Cleaning up...');
    await cleanup();
    process.exit(1);
  });

  try {
    // Step 1: Determine package manager
    let pmType: PackageManagerType = parsePackageManagerType(options.packageManager || 'pnpm');

    // Step 2: Validate repo sources
    logger.info('Validating repository sources...');
    const validation = await validateRepoSources(repos);

    if (!validation.valid) {
      for (const error of validation.errors) {
        logger.error(error);
      }
      process.exit(1);
    }

    logger.success(`Found ${validation.sources.length} repositories to merge`);

    // Step 3: Clone/copy repos into the persistent sources directory
    await ensureDir(sourcesDir);
    logger.info('Fetching repositories...');
    const repoPaths = await cloneOrCopyRepos(validation.sources, sourcesDir, {
      logger,
      verbose: options.verbose,
    });

    // Step 4: Auto-detect package manager if requested
    if (options.autoDetectPm) {
      const detected = await detectPackageManagerFromSources(repoPaths);
      if (detected) {
        pmType = detected;
        logger.info(`Auto-detected package manager: ${getPackageManagerDisplayName(pmType)}`);
      } else {
        logger.debug('No package manager detected from sources, using default');
      }
    }

    // Step 5: Validate package manager is installed
    const pmValidation = validatePackageManager(pmType);
    if (!pmValidation.valid) {
      logger.error(pmValidation.error!);
      process.exit(1);
    }

    const pmConfig = createPackageManagerConfig(pmType);
    logger.debug(`Using package manager: ${getPackageManagerDisplayName(pmType)} v${pmConfig.version}`);

    // Step 6: Analyze dependencies
    logger.info('Analyzing dependencies...');
    const depAnalysis = await analyzeDependencies(repoPaths);

    if (depAnalysis.conflicts.length > 0) {
      const summary = getConflictSummary(depAnalysis.conflicts);
      logger.warn(
        `Found ${depAnalysis.conflicts.length} dependency conflicts ` +
          `(${summary.incompatible} incompatible, ${summary.major} major, ${summary.minor} minor)`
      );
    } else {
      logger.success('No dependency conflicts detected');
    }

    // Step 7: Detect file collisions
    logger.info('Detecting file collisions...');
    const collisions = await detectFileCollisions(repoPaths);

    if (collisions.length > 0) {
      logger.warn(`Found ${collisions.length} file collisions`);
    } else {
      logger.success('No file collisions detected');
    }

    // Step 8: Resolve dependency conflicts
    let conflictStrategy = options.conflictStrategy as ConflictStrategy;

    if (depAnalysis.conflicts.length > 0 && conflictStrategy === 'prompt' && !yes) {
      conflictStrategy = await promptConflictStrategy();
    } else if (yes && conflictStrategy === 'prompt') {
      conflictStrategy = 'highest';
    }

    const resolvedDeps = await resolveDependencyConflicts(
      depAnalysis.conflicts,
      conflictStrategy,
      depAnalysis.resolvedDependencies,
      depAnalysis.resolvedDevDependencies
    );

    // Step 9: Resolve file collision strategies
    const fileStrategies = new Map<string, FileCollisionStrategy>();

    for (const collision of collisions) {
      let strategy = collision.suggestedStrategy as FileCollisionStrategy;

      if (!yes && collision.suggestedStrategy !== 'skip') {
        strategy = await promptFileCollisionStrategy(collision);
      }

      fileStrategies.set(collision.path, strategy);
    }

    // Step 10: Generate workspace config
    const workspaceConfig = generateWorkspaceConfig(depAnalysis.packages, {
      rootName: path.basename(outputDir),
      packagesDir,
      dependencies: noHoist ? {} : resolvedDeps.dependencies,
      devDependencies: noHoist ? {} : resolvedDeps.devDependencies,
      pmConfig,
    });

    if (noHoist) {
      logger.debug('Using --no-hoist: dependencies stay in each package');
    }

    // Step 10b: Update scripts for workspace tool
    if (workspaceTool !== 'none') {
      const availableScripts = Object.keys(workspaceConfig.rootPackageJson.scripts as Record<string, string> || {});
      const updatedScripts = updateScriptsForWorkspaceTool(
        workspaceConfig.rootPackageJson.scripts as Record<string, string>,
        workspaceTool,
        availableScripts
      );
      workspaceConfig.rootPackageJson.scripts = updatedScripts;

      const toolDeps = getWorkspaceToolDependencies(workspaceTool);
      const existingDevDeps = (workspaceConfig.rootPackageJson.devDependencies as Record<string, string>) || {};
      workspaceConfig.rootPackageJson.devDependencies = { ...existingDevDeps, ...toolDeps };
      logger.debug(`Configured for ${workspaceTool} workspace tool`);
    }

    // Add workspaces field for yarn/npm
    const workspacesConfig = getWorkspacesConfig(pmConfig, packagesDir);
    if (workspacesConfig) {
      workspaceConfig.rootPackageJson.workspaces = workspacesConfig;
    }

    // Set packageManager field
    workspaceConfig.rootPackageJson.packageManager = getPackageManagerField(pmConfig);

    // Collect all plan files
    const planFiles: PlanFile[] = [];

    // Step 11: Workspace files (pnpm-workspace.yaml for pnpm)
    const workspaceFilesList = generateWorkspaceFiles(pmConfig, packagesDir);
    for (const file of workspaceFilesList) {
      planFiles.push({ relativePath: file.filename, content: file.content });
    }

    // Step 12: Workspace tool config (turbo.json / nx.json)
    if (workspaceTool !== 'none') {
      const toolConfig = generateWorkspaceToolConfig(depAnalysis.packages, workspaceTool);
      if (toolConfig) {
        planFiles.push({ relativePath: toolConfig.filename, content: toolConfig.content });
      }
    }

    // Step 13: Merge workflows
    if (workflowStrategy !== 'skip') {
      logger.info('Processing CI/CD workflows...');
      try {
        const workflowFiles = await mergeWorkflowsToFiles(repoPaths, workflowStrategy);
        planFiles.push(...workflowFiles.map(f => ({ relativePath: f.relativePath, content: f.content })));
        if (workflowFiles.length > 0) {
          logger.debug(`Prepared ${workflowFiles.length} workflow file(s)`);
        }
      } catch (error) {
        logger.warn(`Failed to process workflows: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Step 14: Handle file collisions
    for (const collision of collisions) {
      const strategy = fileStrategies.get(collision.path) || collision.suggestedStrategy as FileCollisionStrategy;
      const collisionFiles = await resolveFileCollisionToContent(collision, strategy, repoPaths);
      planFiles.push(...collisionFiles.map(f => ({ relativePath: f.relativePath, content: f.content })));
    }

    // Step 15: Generate .gitignore
    const hasGitignoreCollision = collisions.some((c) => c.path === '.gitignore');
    if (!hasGitignoreCollision) {
      const gitignorePaths: string[] = [];
      for (const r of repoPaths) {
        const p = path.join(r.path, '.gitignore');
        if (await pathExists(p)) {
          gitignorePaths.push(p);
        }
      }

      let gitignoreContent: string;
      if (gitignorePaths.length > 0) {
        gitignoreContent = await mergeGitignores(gitignorePaths);
      } else {
        gitignoreContent = `node_modules/\ndist/\n.DS_Store\n*.log\n`;
      }

      // Append PM-specific entries
      const pmEntries = getGitignoreEntries(pmConfig);
      if (pmEntries.length > 0) {
        gitignoreContent += '\n# Package manager\n' + pmEntries.join('\n') + '\n';
      }

      planFiles.push({ relativePath: '.gitignore', content: gitignoreContent });
    }

    // Step 16: Generate README
    const readmeContent = generateRootReadme(
      repoPaths.map((r) => r.name),
      packagesDir,
      pmConfig
    );
    planFiles.push({ relativePath: 'README.md', content: readmeContent });

    // Step 17: Generate .npmrc if --no-hoist
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

    // Step 18: Pin versions in source package.jsons if requested
    if (options.pinVersions) {
      logger.debug('Pinning dependency versions (removing ^ and ~ ranges)');
      for (const repo of repoPaths) {
        const pkgJsonPath = path.join(repo.path, 'package.json');
        if (await pathExists(pkgJsonPath)) {
          try {
            const pkgJson = await readJson<Record<string, unknown>>(pkgJsonPath);
            let modified = false;

            const pinDeps = (deps: Record<string, string> | undefined): Record<string, string> | undefined => {
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
              logger.debug(`Pinned versions in ${repo.name}/package.json`);
            }
          } catch (error) {
            logger.warn(`Failed to pin versions in ${repo.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }

    // Step 19: Assemble the ApplyPlan
    const plan: ApplyPlan = {
      version: 1,
      sources: repoPaths.map((r) => ({ name: r.name, path: r.path })),
      packagesDir,
      rootPackageJson: workspaceConfig.rootPackageJson,
      files: planFiles,
      install: options.install,
      installCommand: pmConfig.installCommand,
    };

    // Step 20: Write plan file
    await ensureDir(path.dirname(planFilePath));
    await writeJson(planFilePath, plan, { spaces: 2 });

    // Step 21: Print summary
    logger.log('');
    logger.success(chalk.bold('Plan generated successfully!'));
    logger.log('');
    logger.log(`  ${chalk.cyan('Plan file:')} ${planFilePath}`);
    logger.log(`  ${chalk.cyan('Sources:')} ${sourcesDir}`);
    logger.log(`  ${chalk.cyan('Packages:')} ${repoPaths.length}`);
    logger.log(`  ${chalk.cyan('Package manager:')} ${getPackageManagerDisplayName(pmType)}`);
    logger.log(`  ${chalk.cyan('Extra files:')} ${planFiles.length}`);

    if (depAnalysis.conflicts.length > 0) {
      logger.log(
        `  ${chalk.cyan('Resolved conflicts:')} ${depAnalysis.conflicts.length}`
      );
    }

    logger.log('');
    logger.log('Next steps:');
    logger.log(`  # Review the plan`);
    logger.log(`  cat ${planFilePath}`);
    logger.log('');
    logger.log(`  # Apply the plan`);
    logger.log(`  monorepo apply --plan ${planFilePath} --out ${outputDir}`);
    logger.log('');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Plan failed: ${message}`);

    if (options.verbose && error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }

    await cleanup();
    process.exit(1);
  }
}
