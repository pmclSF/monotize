import path from 'node:path';
import { createLogger } from '../utils/logger.js';
import { writeJson } from '../utils/fs.js';
import { generateAddPlan, applyAddPlan } from '../strategies/add.js';
import type { AddCommandOptions, ConflictStrategy, PackageManagerType } from '../types/index.js';

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

  const cmdOptions: AddCommandOptions = {
    to: path.resolve(options.to),
    packagesDir: options.packagesDir,
    out: options.out,
    apply: options.apply,
    conflictStrategy: options.conflictStrategy as ConflictStrategy,
    verbose: options.verbose,
    packageManager: options.packageManager as PackageManagerType,
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
