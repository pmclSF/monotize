import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import type {
  MergeOptions,
  ConflictStrategy,
  FileCollisionStrategy,
} from '../types/index.js';
import { createLogger, formatHeader, formatList } from '../utils/logger.js';
import {
  createTempDir,
  removeDir,
  ensureDir,
  move,
  writeJson,
  writeFile,
  pathExists,
  readJson,
} from '../utils/fs.js';
import { validateRepoSources } from '../utils/validation.js';
import {
  promptConflictStrategy,
  promptFileCollisionStrategy,
  promptConfirm,
} from '../utils/prompts.js';
import { analyzeDependencies } from '../analyzers/dependencies.js';
import { detectFileCollisions } from '../analyzers/files.js';
import { cloneOrCopyRepos } from '../strategies/copy.js';
import {
  generateRootReadme,
  handleFileCollision,
  mergeGitignores,
} from '../strategies/merge-files.js';
import {
  generateWorkspaceConfig,
  generatePnpmWorkspaceYaml,
} from '../strategies/workspace-config.js';
import {
  resolveDependencyConflicts,
  formatConflict,
  getConflictSummary,
} from '../resolvers/dependencies.js';

/**
 * CLI options passed from commander
 */
interface CLIOptions {
  output: string;
  packagesDir: string;
  dryRun?: boolean;
  yes?: boolean;
  conflictStrategy: string;
  verbose?: boolean;
  install: boolean;
  hoist?: boolean; // Commander uses --no-hoist -> hoist: false
  pinVersions?: boolean;
}

/**
 * Print the dry-run report
 */
function printDryRunReport(
  packages: Array<{ path: string; name: string }>,
  conflicts: Array<{ name: string; versions: Array<{ version: string; source: string }>; severity: string }>,
  collisions: Array<{ path: string; sources: string[]; suggestedStrategy: string }>,
  options: MergeOptions
): void {
  const logger = createLogger(options.verbose);

  logger.log(formatHeader('Dry Run Report'));

  // Packages to merge
  logger.log(chalk.bold('\nPackages to merge:'));
  logger.log(formatList(packages.map((p) => p.name)));

  // Dependency conflicts
  if (conflicts.length > 0) {
    const summary = getConflictSummary(conflicts as Array<{ name: string; versions: Array<{ version: string; source: string; type: 'dependencies' | 'devDependencies' | 'peerDependencies' }>; severity: 'minor' | 'major' | 'incompatible' }>);
    logger.log(chalk.bold('\nDependency conflicts:'));
    logger.log(
      `  ${chalk.red(summary.incompatible)} incompatible, ${chalk.yellow(summary.major)} major, ${chalk.gray(summary.minor)} minor`
    );
    logger.log('');
    for (const conflict of conflicts) {
      logger.log(`  ${formatConflict(conflict as { name: string; versions: Array<{ version: string; source: string; type: 'dependencies' | 'devDependencies' | 'peerDependencies' }>; severity: 'minor' | 'major' | 'incompatible' })}`);
    }
  } else {
    logger.log(chalk.bold('\nDependency conflicts:'));
    logger.log('  None detected');
  }

  // File collisions
  if (collisions.length > 0) {
    logger.log(chalk.bold('\nFile collisions:'));
    for (const collision of collisions) {
      logger.log(
        `  ${collision.path} (in: ${collision.sources.join(', ')}) -> ${collision.suggestedStrategy}`
      );
    }
  } else {
    logger.log(chalk.bold('\nFile collisions:'));
    logger.log('  None detected');
  }

  // Output structure
  logger.log(chalk.bold('\nOutput structure:'));
  logger.log(`  ${options.output}/`);
  logger.log(`  ├── ${options.packagesDir}/`);
  for (const pkg of packages) {
    logger.log(`  │   └── ${pkg.name}/`);
  }
  logger.log('  ├── package.json');
  logger.log('  ├── pnpm-workspace.yaml');
  logger.log('  └── README.md');

  logger.log('');
  logger.log(chalk.gray('Run without --dry-run to execute the merge.'));
}

/**
 * Main merge command handler
 */
export async function mergeCommand(repos: string[], options: CLIOptions): Promise<void> {
  const logger = createLogger(options.verbose);
  let tempDir: string | null = null;

  // Convert CLI options to MergeOptions
  const mergeOptions: MergeOptions = {
    output: path.resolve(options.output),
    packagesDir: options.packagesDir,
    dryRun: options.dryRun,
    yes: options.yes,
    conflictStrategy: options.conflictStrategy as ConflictStrategy,
    verbose: options.verbose,
    install: options.install,
    noHoist: options.hoist === false, // Commander: --no-hoist sets hoist to false
    pinVersions: options.pinVersions,
  };

  // Robust cleanup function - doesn't throw on failure
  const cleanup = async () => {
    if (tempDir) {
      try {
        logger.debug(`Cleaning up temp directory: ${tempDir}`);
        await removeDir(tempDir);
      } catch (error) {
        // Log warning but don't throw - cleanup failure shouldn't mask original error
        logger.warn(`Failed to cleanup temp directory ${tempDir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  process.on('SIGINT', async () => {
    logger.warn('\nInterrupted. Cleaning up...');
    await cleanup();
    process.exit(1);
  });

  try {
    // Step 1: Validate repo sources
    logger.info('Validating repository sources...');
    const validation = await validateRepoSources(repos);

    if (!validation.valid) {
      for (const error of validation.errors) {
        logger.error(error);
      }
      process.exit(1);
    }

    logger.success(`Found ${validation.sources.length} repositories to merge`);

    // Step 2: Create temp working directory
    tempDir = await createTempDir();
    logger.debug(`Created temp directory: ${tempDir}`);

    // Step 3: Clone/copy each repo to temp dir
    logger.info('Fetching repositories...');
    const repoPaths = await cloneOrCopyRepos(validation.sources, tempDir, {
      logger,
      verbose: mergeOptions.verbose,
    });

    // Step 4: Run dependency analysis
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

    // Step 5: Run file collision detection
    logger.info('Detecting file collisions...');
    const collisions = await detectFileCollisions(repoPaths);

    if (collisions.length > 0) {
      logger.warn(`Found ${collisions.length} file collisions`);
    } else {
      logger.success('No file collisions detected');
    }

    // Step 6: If --dry-run, print report and exit
    if (mergeOptions.dryRun) {
      printDryRunReport(repoPaths, depAnalysis.conflicts, collisions, mergeOptions);
      await cleanup();
      return;
    }

    // Step 7: Resolve conflicts
    let conflictStrategy = mergeOptions.conflictStrategy;

    if (depAnalysis.conflicts.length > 0 && conflictStrategy === 'prompt' && !mergeOptions.yes) {
      conflictStrategy = await promptConflictStrategy();
    } else if (mergeOptions.yes && conflictStrategy === 'prompt') {
      conflictStrategy = 'highest';
    }

    const resolvedDeps = await resolveDependencyConflicts(
      depAnalysis.conflicts,
      conflictStrategy,
      depAnalysis.resolvedDependencies,
      depAnalysis.resolvedDevDependencies
    );

    // Resolve file collisions
    const fileStrategies = new Map<string, FileCollisionStrategy>();

    for (const collision of collisions) {
      let strategy = collision.suggestedStrategy as FileCollisionStrategy;

      if (!mergeOptions.yes && collision.suggestedStrategy !== 'skip') {
        strategy = await promptFileCollisionStrategy(collision);
      }

      fileStrategies.set(collision.path, strategy);
    }

    // Step 8: Check if output directory exists
    if (await pathExists(mergeOptions.output)) {
      if (!mergeOptions.yes) {
        const overwrite = await promptConfirm(
          `Output directory ${mergeOptions.output} already exists. Overwrite?`,
          false
        );
        if (!overwrite) {
          logger.warn('Aborted by user');
          await cleanup();
          return;
        }
      }
      await removeDir(mergeOptions.output);
    }

    // Step 9: Create output directory structure
    logger.info('Creating monorepo structure...');
    await ensureDir(mergeOptions.output);
    const packagesPath = path.join(mergeOptions.output, mergeOptions.packagesDir);
    await ensureDir(packagesPath);

    // Step 10: Move repos to packages/<name>/
    for (const repo of repoPaths) {
      const targetPath = path.join(packagesPath, repo.name);
      await move(repo.path, targetPath);
      logger.debug(`Moved ${repo.name} to ${targetPath}`);
    }

    // Update repoPaths to point to new locations
    const movedRepoPaths = repoPaths.map((r) => ({
      path: path.join(packagesPath, r.name),
      name: r.name,
    }));

    // Step 10b: If --pin-versions, update each package.json to use exact versions
    if (mergeOptions.pinVersions) {
      logger.debug('Pinning dependency versions (removing ^ and ~ ranges)');
      for (const repo of movedRepoPaths) {
        const pkgJsonPath = path.join(repo.path, 'package.json');
        if (await pathExists(pkgJsonPath)) {
          try {
            const pkgJson = await readJson<Record<string, unknown>>(pkgJsonPath);
            let modified = false;

            const pinDeps = (deps: Record<string, string> | undefined): Record<string, string> | undefined => {
              if (!deps) return deps;
              const pinned: Record<string, string> = {};
              for (const [name, version] of Object.entries(deps)) {
                // Remove ^ and ~ prefixes to pin to exact version
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

    // Step 11: Generate root package.json with workspaces
    // If --no-hoist, don't put dependencies in root (each package keeps its own)
    const workspaceConfig = generateWorkspaceConfig(depAnalysis.packages, {
      rootName: path.basename(mergeOptions.output),
      packagesDir: mergeOptions.packagesDir,
      dependencies: mergeOptions.noHoist ? {} : resolvedDeps.dependencies,
      devDependencies: mergeOptions.noHoist ? {} : resolvedDeps.devDependencies,
    });

    if (mergeOptions.noHoist) {
      logger.debug('Using --no-hoist: dependencies stay in each package');
    }

    await writeJson(
      path.join(mergeOptions.output, 'package.json'),
      workspaceConfig.rootPackageJson,
      { spaces: 2 }
    );
    logger.debug('Created root package.json');

    // Step 12: Generate pnpm-workspace.yaml
    const pnpmWorkspaceContent = generatePnpmWorkspaceYaml(mergeOptions.packagesDir);
    await writeFile(
      path.join(mergeOptions.output, 'pnpm-workspace.yaml'),
      pnpmWorkspaceContent
    );
    logger.debug('Created pnpm-workspace.yaml');

    // Step 12b: If --no-hoist, create .npmrc to prevent hoisting
    if (mergeOptions.noHoist) {
      const npmrcContent = `# Prevent dependency hoisting - each package manages its own dependencies
# This helps avoid type conflicts between packages with different version requirements
shamefully-hoist=false
hoist=false

# Use lowest satisfying versions to avoid breaking changes in newer releases
resolution-mode=lowest
`;
      await writeFile(path.join(mergeOptions.output, '.npmrc'), npmrcContent);
      logger.debug('Created .npmrc with no-hoist configuration');
    }

    // Step 13: Handle file collisions
    for (const collision of collisions) {
      const strategy = fileStrategies.get(collision.path) || collision.suggestedStrategy as FileCollisionStrategy;
      await handleFileCollision(collision, strategy, movedRepoPaths, mergeOptions.output);
    }

    // If no .gitignore collision but we should create one
    const hasGitignoreCollision = collisions.some((c) => c.path === '.gitignore');
    if (!hasGitignoreCollision) {
      // Check if any repo has a .gitignore and merge them all
      const gitignorePaths = movedRepoPaths
        .map((r) => path.join(r.path, '.gitignore'))
        .filter(async (p) => await pathExists(p));

      if (gitignorePaths.length > 0) {
        const merged = await mergeGitignores(gitignorePaths);
        await writeFile(path.join(mergeOptions.output, '.gitignore'), merged);
      } else {
        // Create a basic .gitignore
        const basicGitignore = `node_modules/
dist/
.DS_Store
*.log
`;
        await writeFile(path.join(mergeOptions.output, '.gitignore'), basicGitignore);
      }
    }

    // Step 14: Generate root README.md
    const readmeContent = generateRootReadme(
      movedRepoPaths.map((r) => r.name),
      mergeOptions.packagesDir
    );
    await writeFile(path.join(mergeOptions.output, 'README.md'), readmeContent);
    logger.debug('Created README.md');

    // Step 15: Run pnpm install (unless --no-install)
    if (mergeOptions.install) {
      logger.info('Installing dependencies...');
      try {
        execSync('pnpm install', {
          cwd: mergeOptions.output,
          stdio: mergeOptions.verbose ? 'inherit' : 'pipe',
        });
        logger.success('Dependencies installed');
      } catch (error) {
        logger.warn('Failed to install dependencies. Run "pnpm install" manually.');
      }
    } else {
      logger.info('Skipping dependency installation (--no-install)');
    }

    // Step 16: Print success summary
    logger.log('');
    logger.success(chalk.bold('Monorepo created successfully!'));
    logger.log('');
    logger.log(`  ${chalk.cyan('Location:')} ${mergeOptions.output}`);
    logger.log(`  ${chalk.cyan('Packages:')} ${movedRepoPaths.length}`);

    if (depAnalysis.conflicts.length > 0) {
      logger.log(
        `  ${chalk.cyan('Resolved conflicts:')} ${depAnalysis.conflicts.length}`
      );
    }

    logger.log('');
    logger.log('Next steps:');
    logger.log(`  cd ${mergeOptions.output}`);
    if (!mergeOptions.install) {
      logger.log('  pnpm install');
    }
    logger.log('  pnpm build');

    // Clean up temp directory
    await cleanup();
    tempDir = null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Merge failed: ${message}`);

    if (mergeOptions.verbose && error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }

    await cleanup();
    process.exit(1);
  }
}
