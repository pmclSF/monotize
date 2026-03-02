import path from 'node:path';
import type { BranchPlan, BranchMigrateStrategy, Logger, PlanOperation } from '../types/index.js';
import { safeExecFile, commandExists } from '../utils/exec.js';
import { pathExists } from '../utils/fs.js';

/**
 * Check prerequisites for branch migration
 */
export async function checkBranchMigratePrerequisites(
  sourceRepo: string,
  targetMonorepo: string,
  strategy: BranchMigrateStrategy,
): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check source repo exists
  if (!(await pathExists(sourceRepo))) {
    issues.push(`Source repository not found: ${sourceRepo}`);
  }

  // Check target monorepo exists
  if (!(await pathExists(targetMonorepo))) {
    issues.push(`Target monorepo not found: ${targetMonorepo}`);
  }

  // Check git is available
  const hasGit = await commandExists('git');
  if (!hasGit) {
    issues.push('git is not installed or not on PATH');
  }

  // Check for shallow clone
  if (await pathExists(sourceRepo)) {
    try {
      const { stdout } = await safeExecFile('git', ['rev-parse', '--is-shallow-repository'], {
        cwd: sourceRepo,
      });
      if (stdout.trim() === 'true') {
        issues.push('Source repository is a shallow clone. Run `git fetch --unshallow` first.');
      }
    } catch {
      // Not a git repo or other error
      issues.push('Source path is not a valid git repository');
    }
  }

  // Strategy-specific checks
  if (strategy === 'subtree') {
    // git subtree is built-in to git, no extra check needed
  } else if (strategy === 'replay') {
    // git format-patch and git am are built-in
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Get dry-run report for a branch migration
 */
export async function branchMigrateDryRun(
  sourceRepo: string,
  branch: string,
): Promise<{ commitCount: number; estimatedTime: string; contributors: string[] }> {
  try {
    // Count commits on the branch
    const { stdout: logOutput } = await safeExecFile(
      'git',
      ['log', branch, '--oneline', '--no-merges'],
      { cwd: sourceRepo },
    );
    const commitCount = logOutput.trim().split('\n').filter(Boolean).length;

    // Get contributors
    const { stdout: authorOutput } = await safeExecFile(
      'git',
      ['log', branch, '--format=%aN', '--no-merges'],
      { cwd: sourceRepo },
    );
    const contributors = [...new Set(authorOutput.trim().split('\n').filter(Boolean))];

    // Estimate time based on commit count
    const secondsPerCommit = 0.5;
    const totalSeconds = Math.ceil(commitCount * secondsPerCommit);
    const estimatedTime =
      totalSeconds < 60
        ? `${totalSeconds} seconds`
        : `${Math.ceil(totalSeconds / 60)} minutes`;

    return { commitCount, estimatedTime, contributors };
  } catch {
    return { commitCount: 0, estimatedTime: 'unknown', contributors: [] };
  }
}

/**
 * Generate a BranchPlan for migrating a branch
 */
export async function generateBranchPlan(
  branch: string,
  sourceRepo: string,
  targetMonorepo: string,
  strategy: BranchMigrateStrategy,
  logger: Logger,
): Promise<BranchPlan> {
  const srcPath = path.resolve(sourceRepo);
  const targetPath = path.resolve(targetMonorepo);

  // Check prerequisites
  const prereqs = await checkBranchMigratePrerequisites(srcPath, targetPath, strategy);
  if (!prereqs.ok) {
    throw new Error(`Prerequisites not met:\n${prereqs.issues.map((i) => `  - ${i}`).join('\n')}`);
  }

  logger.info(`Generating branch migration plan: ${branch} (${strategy} strategy)`);

  // Get dry-run report
  const dryRunReport = await branchMigrateDryRun(srcPath, branch);
  logger.info(`Found ${dryRunReport.commitCount} commits from ${dryRunReport.contributors.length} contributors`);

  // Generate operations based on strategy
  const operations: PlanOperation[] = [];

  if (strategy === 'subtree') {
    operations.push(
      {
        id: 'add-remote',
        type: 'exec',
        description: `Add source repo as remote`,
        inputs: [srcPath],
        outputs: [],
      },
      {
        id: 'subtree-add',
        type: 'exec',
        description: `Import branch ${branch} via git subtree add`,
        inputs: [branch],
        outputs: [],
      },
      {
        id: 'remove-remote',
        type: 'exec',
        description: 'Remove temporary remote',
        inputs: [],
        outputs: [],
      },
    );
  } else {
    // replay strategy
    operations.push(
      {
        id: 'format-patch',
        type: 'exec',
        description: `Export ${dryRunReport.commitCount} commits as patches`,
        inputs: [srcPath, branch],
        outputs: ['patches/'],
      },
      {
        id: 'create-branch',
        type: 'exec',
        description: `Create branch ${branch} in target`,
        inputs: [],
        outputs: [branch],
      },
      {
        id: 'apply-patches',
        type: 'exec',
        description: 'Replay patches via git am',
        inputs: ['patches/'],
        outputs: [],
      },
    );
  }

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    branch,
    sourceRepo: srcPath,
    targetMonorepo: targetPath,
    strategy,
    operations,
    dryRunReport,
  };
}

/**
 * Apply a BranchPlan using subtree strategy
 */
async function applySubtreeImport(
  plan: BranchPlan,
  subdir: string,
  logger: Logger,
): Promise<void> {
  const { sourceRepo, branch, targetMonorepo } = plan;
  const remoteName = `monotize-import-${Date.now()}`;

  try {
    // Add remote
    logger.info(`Adding remote ${remoteName}...`);
    await safeExecFile('git', ['remote', 'add', remoteName, sourceRepo], {
      cwd: targetMonorepo,
    });

    // Fetch
    logger.info(`Fetching ${branch}...`);
    await safeExecFile('git', ['fetch', remoteName, branch], {
      cwd: targetMonorepo,
    });

    // Subtree add
    logger.info(`Importing via subtree add to ${subdir}...`);
    await safeExecFile(
      'git',
      ['subtree', 'add', `--prefix=${subdir}`, `${remoteName}/${branch}`, '--squash'],
      { cwd: targetMonorepo },
    );

    logger.success(`Branch ${branch} imported to ${subdir}`);
  } finally {
    // Cleanup remote
    try {
      await safeExecFile('git', ['remote', 'remove', remoteName], {
        cwd: targetMonorepo,
      });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Apply a BranchPlan using patch replay strategy
 */
async function applyPatchReplay(
  plan: BranchPlan,
  subdir: string,
  logger: Logger,
): Promise<void> {
  const { sourceRepo, branch, targetMonorepo } = plan;

  // Export patches
  logger.info(`Exporting patches from ${branch}...`);
  const patchDir = path.join(targetMonorepo, '.monotize', 'patches', branch);
  const { ensureDir } = await import('../utils/fs.js');
  await ensureDir(patchDir);

  await safeExecFile(
    'git',
    ['format-patch', `main..${branch}`, '-o', patchDir],
    { cwd: sourceRepo },
  );

  // Create branch in target
  logger.info(`Creating branch ${branch} in target...`);
  await safeExecFile('git', ['checkout', '-b', branch], {
    cwd: targetMonorepo,
  });

  // Apply patches
  logger.info('Replaying patches...');
  try {
    await safeExecFile(
      'git',
      ['am', '--directory', subdir, `${patchDir}/*.patch`],
      { cwd: targetMonorepo },
    );
    logger.success(`Branch ${branch} replayed to ${subdir}`);
  } catch (err: unknown) {
    logger.warn('Patch replay may have conflicts. Check with `git am --show-current-patch`');
    throw err;
  }
}

/**
 * Apply a BranchPlan
 */
export async function applyBranchPlan(
  plan: BranchPlan,
  subdir: string,
  logger: Logger,
): Promise<void> {
  if (plan.strategy === 'subtree') {
    await applySubtreeImport(plan, subdir, logger);
  } else {
    await applyPatchReplay(plan, subdir, logger);
  }
}
