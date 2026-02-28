import path from 'node:path';
import { createLogger } from '../utils/logger.js';
import { writeJson } from '../utils/fs.js';
import { generateBranchPlan, applyBranchPlan } from '../strategies/migrate-branch.js';
import type { BranchMigrateStrategy } from '../types/index.js';

interface CLIMigrateBranchOptions {
  from: string;
  to: string;
  strategy: string;
  out?: string;
  apply?: boolean;
  verbose?: boolean;
}

export async function migrateBranchCommand(
  branch: string,
  options: CLIMigrateBranchOptions,
): Promise<void> {
  const logger = createLogger(options.verbose);
  const strategy = options.strategy as BranchMigrateStrategy;

  try {
    logger.info(`Generating branch migration plan for '${branch}'...`);
    logger.info(`Strategy: ${strategy} ${strategy === 'replay' ? '(experimental)' : '(recommended)'}`);

    const plan = await generateBranchPlan(
      branch,
      path.resolve(options.from),
      path.resolve(options.to),
      strategy,
      logger,
    );

    // Write plan
    const planPath = options.out || `branch-plan-${branch}.json`;
    const absPath = path.resolve(planPath);
    await writeJson(absPath, plan);
    logger.success(`Branch plan written to ${absPath}`);

    // Print dry-run report
    if (plan.dryRunReport) {
      logger.info(`\nDry-Run Report:`);
      logger.info(`  Branch: ${plan.branch}`);
      logger.info(`  Commits: ${plan.dryRunReport.commitCount}`);
      logger.info(`  Estimated time: ${plan.dryRunReport.estimatedTime}`);
      logger.info(`  Contributors: ${plan.dryRunReport.contributors.join(', ') || 'none'}`);
    }

    logger.info(`\nOperations (${plan.operations.length}):`);
    for (const op of plan.operations) {
      logger.info(`  ${op.id}: ${op.description}`);
    }

    // Apply if requested
    if (options.apply) {
      logger.info('\nApplying branch migration...');
      // Derive subdir from source repo name
      const repoName = path.basename(plan.sourceRepo);
      const subdir = `packages/${repoName}`;
      await applyBranchPlan(plan, subdir, logger);
      logger.success(`Branch '${branch}' migrated successfully`);
    } else {
      logger.info(`\nTo apply: monorepo migrate-branch ${branch} --from ${options.from} --to ${options.to} --strategy ${strategy} --apply`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Branch migration failed: ${msg}`);
    process.exitCode = 1;
  }
}
