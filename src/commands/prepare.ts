import path from 'node:path';
import { execFileSync } from 'node:child_process';
import chalk from 'chalk';
import { createLogger, formatHeader } from '../utils/logger.js';
import {
  createTempDir,
  removeDir,
  ensureDir,
  writeFile,
  writeJson,
} from '../utils/fs.js';
import { validateRepoSources } from '../utils/validation.js';
import { cloneOrCopyRepos } from '../strategies/copy.js';
import { analyzeReposForPreparation } from '../analyzers/prepare.js';
import { renderChecklistMarkdown } from '../strategies/prepare-checklist.js';
import type { PrepWorkspaceConfig } from '../types/index.js';

/**
 * CLI options passed from commander
 */
interface CLIPrepareOptions {
  nodeVersion?: string;
  packageManager?: string;
  patchOnly?: boolean;
  outDir?: string;
  prepWorkspace?: string;
  out?: string;
  verbose?: boolean;
  json?: boolean;
}

/**
 * Main prepare command handler.
 * Analyzes repos and generates pre-migration patches and checklist.
 */
export async function prepareCommand(repos: string[], options: CLIPrepareOptions): Promise<void> {
  const logger = createLogger(options.verbose);
  let tempDir: string | null = null;

  // Validate mutually exclusive flags
  if (options.patchOnly && options.prepWorkspace) {
    logger.error('--patch-only and --prep-workspace are mutually exclusive');
    process.exit(1);
  }

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
    // Step 1: Validate repo sources
    logger.info('Validating repository sources...');
    const validation = await validateRepoSources(repos);

    if (!validation.valid) {
      for (const error of validation.errors) {
        logger.error(error);
      }
      process.exit(1);
    }

    logger.success(`Found ${validation.sources.length} repositories to prepare`);

    // Step 2: Clone/copy repos
    let repoPaths: Array<{ path: string; name: string }>;

    if (options.prepWorkspace) {
      // Clone into the prep workspace directory
      const workspaceDir = path.resolve(options.prepWorkspace);
      await ensureDir(workspaceDir);
      logger.info(`Fetching repositories into workspace: ${workspaceDir}`);
      repoPaths = await cloneOrCopyRepos(validation.sources, workspaceDir, {
        logger,
        verbose: options.verbose,
      });
    } else {
      // Clone into a temp dir
      tempDir = await createTempDir('monotize-prepare-');
      logger.info('Fetching repositories...');
      repoPaths = await cloneOrCopyRepos(validation.sources, tempDir, {
        logger,
        verbose: options.verbose,
      });
    }

    // Step 3: Build target options
    const targetNodeVersion = options.nodeVersion ?? null;
    const targetPackageManager = options.packageManager ?? null;

    // Step 4: Run analysis
    logger.info('Analyzing repositories...');
    const analysis = await analyzeReposForPreparation(repoPaths, {
      targetNodeVersion: targetNodeVersion ?? undefined,
      targetPackageManager: targetPackageManager ?? undefined,
    });

    logger.success(`Analysis complete: ${analysis.patches.length} patches, ${analysis.checklist.length} checklist items`);

    // Step 5: Generate checklist markdown
    const checklistMd = renderChecklistMarkdown(analysis.checklist);

    // Step 6: Output based on mode
    if (options.prepWorkspace) {
      // --prep-workspace mode: apply patches, commit on branch
      const workspaceDir = path.resolve(options.prepWorkspace);
      const branchName = 'prepare/monotize';

      for (const repo of repoPaths) {
        // Initialize git if needed (local copies may not have .git)
        try {
          execFileSync('git', ['rev-parse', '--git-dir'], { cwd: repo.path, stdio: 'pipe' });
        } catch {
          execFileSync('git', ['init'], { cwd: repo.path, stdio: 'pipe' });
          execFileSync('git', ['add', '-A'], { cwd: repo.path, stdio: 'pipe' });
          execFileSync('git', ['-c', 'user.email=monotize@monotize.dev', '-c', 'user.name=monotize', 'commit', '-m', 'initial'], { cwd: repo.path, stdio: 'pipe' });
        }

        // Create branch
        execFileSync('git', ['checkout', '-b', branchName], { cwd: repo.path, stdio: 'pipe' });

        // Apply patches for this repo
        const repoPatches = analysis.patches.filter((p) => p.repoName === repo.name);
        for (const patch of repoPatches) {
          const patchPath = path.join(repo.path, '__temp_patch.diff');
          await writeFile(patchPath, patch.content);
          try {
            execFileSync('git', ['apply', patchPath], { cwd: repo.path, stdio: 'pipe' });
          } catch (applyError) {
            logger.warn(`Failed to apply patch ${patch.filename}: ${applyError instanceof Error ? applyError.message : String(applyError)}`);
          }
          // Remove temp patch file
          await removeDir(patchPath);
        }

        if (repoPatches.length > 0) {
          // Stage and commit
          execFileSync('git', ['add', '-A'], { cwd: repo.path, stdio: 'pipe' });
          execFileSync(
            'git',
            ['-c', 'user.email=monotize@monotize.dev', '-c', 'user.name=monotize', 'commit', '-m', 'chore: pre-migration preparation (monotize)'],
            { cwd: repo.path, stdio: 'pipe' }
          );
          logger.success(`Applied ${repoPatches.length} patches to ${repo.name}`);
        } else {
          logger.info(`No patches needed for ${repo.name}`);
        }
      }

      // Write .monotize/config.json
      const monotizeDir = path.join(workspaceDir, '.monotize');
      await ensureDir(monotizeDir);

      const config: PrepWorkspaceConfig = {
        version: 1,
        createdAt: new Date().toISOString(),
        preparedRepos: repoPaths.map((r) => r.name),
        targetNodeVersion,
        targetPackageManager,
        branchName,
        appliedPatches: analysis.patches.map((p) => p.filename),
      };

      await writeJson(path.join(monotizeDir, 'config.json'), config, { spaces: 2 });

      // Write checklist
      await writeFile(path.join(monotizeDir, 'checklist.md'), checklistMd);

      // Print summary
      logger.log('');
      logger.log(formatHeader('Prep workspace ready'));
      logger.log(`  ${chalk.cyan('Workspace:')} ${workspaceDir}`);
      logger.log(`  ${chalk.cyan('Branch:')} ${branchName}`);
      logger.log(`  ${chalk.cyan('Patches applied:')} ${analysis.patches.length}`);
      logger.log(`  ${chalk.cyan('Checklist items:')} ${analysis.checklist.length}`);
      logger.log('');
      logger.log('Next steps:');
      logger.log(`  # Review the checklist`);
      logger.log(`  cat ${path.join(monotizeDir, 'checklist.md')}`);
      logger.log('');
      logger.log(`  # Run the plan command`);
      logger.log(`  monorepo plan ${repoPaths.map((r) => r.path).join(' ')} -o ./monorepo`);
      logger.log('');
    } else if (options.outDir) {
      // --out-dir mode: write patches and checklist to directory
      const outDir = path.resolve(options.outDir);
      await ensureDir(outDir);

      for (const patch of analysis.patches) {
        const patchDir = path.join(outDir, path.dirname(patch.filename));
        await ensureDir(patchDir);
        await writeFile(path.join(outDir, patch.filename), patch.content);
      }

      await writeFile(path.join(outDir, 'checklist.md'), checklistMd);

      logger.log('');
      logger.log(formatHeader('Patches written'));
      logger.log(`  ${chalk.cyan('Output:')} ${outDir}`);
      logger.log(`  ${chalk.cyan('Patch files:')} ${analysis.patches.length}`);
      logger.log(`  ${chalk.cyan('Checklist:')} ${path.join(outDir, 'checklist.md')}`);
      logger.log('');
    } else {
      // Default (stdout) mode: print patches and checklist
      if (analysis.patches.length > 0) {
        logger.log(formatHeader('Patches'));
        for (const patch of analysis.patches) {
          logger.log(`\n--- ${patch.filename} ---`);
          logger.log(patch.content);
        }
      }

      logger.log(formatHeader('Checklist'));
      logger.log(checklistMd);
    }

    // --out mode: write PreparationPlan JSON
    if (options.out) {
      const { writeJson: wj } = await import('../utils/fs.js');
      const planOut = path.resolve(options.out);
      const preparationPlan = {
        schemaVersion: 1 as const,
        createdAt: new Date().toISOString(),
        checklist: analysis.checklist,
        patches: analysis.patches,
      };
      await wj(planOut, preparationPlan);
      logger.success(`PreparationPlan written to ${planOut}`);
    }

    // Cleanup temp dir if we created one
    await cleanup();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Prepare failed: ${message}`);

    if (options.verbose && error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }

    await cleanup();
    process.exit(1);
  }
}
