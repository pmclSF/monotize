import path from 'node:path';
import { createLogger } from '../utils/logger.js';
import { writeJson } from '../utils/fs.js';
import { parseConflictStrategy } from '../utils/cli-options.js';
import { tryParsePackageManagerType } from '../strategies/package-manager.js';
import { generateAddPlan, applyAddPlan } from '../strategies/add.js';
import type { AddCommandOptions } from '../types/index.js';

interface CLIAddOptions {
  to: string;
  packagesDir: string;
  out?: string;
  apply?: boolean;
  conflictStrategy: string;
  verbose?: boolean;
  packageManager: string;
}

export async function addCommand(repo: string, options: CLIAddOptions): Promise<void> {
  const logger = createLogger(options.verbose);
  const conflictStrategy = parseConflictStrategy(options.conflictStrategy);
  const packageManager = tryParsePackageManagerType(options.packageManager);

  if (!conflictStrategy) {
    logger.error(
      `Invalid conflict strategy: ${options.conflictStrategy}. Valid options: highest, lowest, prompt`
    );
    process.exitCode = 1;
    return;
  }

  if (!packageManager) {
    logger.error(
      `Invalid package manager: ${options.packageManager}. Valid options: pnpm, yarn, yarn-berry, npm`
    );
    process.exitCode = 1;
    return;
  }

  const cmdOptions: AddCommandOptions = {
    to: path.resolve(options.to),
    packagesDir: options.packagesDir,
    out: options.out,
    apply: options.apply,
    conflictStrategy,
    verbose: options.verbose,
    packageManager,
  };

  try {
    logger.info('Generating add plan...');
    const plan = await generateAddPlan(repo, cmdOptions, logger);

    // Write plan to file
    const planPath = options.out || `add-plan-${plan.sourceRepo.name}.json`;
    const absPath = path.resolve(planPath);
    await writeJson(absPath, plan);
    logger.success(`Plan written to ${absPath}`);

    // Print summary
    logger.info(`\nAdd Plan Summary:`);
    logger.info(`  Source: ${plan.sourceRepo.original}`);
    logger.info(`  Target: ${plan.targetMonorepo}`);
    logger.info(`  Packages dir: ${plan.packagesDir}`);
    logger.info(`  Conflicts: ${plan.analysis.conflicts.length}`);
    logger.info(`  Operations: ${plan.operations.length}`);
    logger.info(`  Complexity: ${plan.analysis.complexityScore}/100`);

    if (plan.decisions.length > 0) {
      logger.info(`\nDecisions:`);
      for (const d of plan.decisions) {
        logger.info(`  ${d.id}: ${d.chosen} (alternatives: ${d.alternatives.join(', ') || 'none'})`);
      }
    }

    // Apply if requested
    if (options.apply) {
      logger.info('\nApplying plan...');
      const result = await applyAddPlan(plan, logger);
      if (result.success) {
        logger.success(`Package added at ${result.packageDir}`);
      }
    } else {
      logger.info(`\nTo apply: monorepo apply --plan ${planPath} --out ${cmdOptions.to}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Add failed: ${msg}`);
    process.exitCode = 1;
  }
}
