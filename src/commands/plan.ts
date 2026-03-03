import path from 'node:path';
import chalk from 'chalk';
import type {
  ConflictStrategy,
  PackageManagerType,
  WorkspaceTool,
  WorkflowMergeStrategy,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { CliExitError } from '../utils/errors.js';
import {
  removeDir,
  ensureDir,
  writeJson,
} from '../utils/fs.js';
import {
  promptConflictStrategy,
  promptFileCollisionStrategy,
} from '../utils/prompts.js';
import {
  parseConflictStrategy,
  parseWorkspaceTool,
  parseWorkflowStrategy,
} from '../utils/cli-options.js';
import { getConflictSummary } from '../resolvers/dependencies.js';
import {
  getPackageManagerDisplayName,
  tryParsePackageManagerType,
} from '../strategies/package-manager.js';
import { buildApplyPlan } from '../core/plan-builder.js';

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

export async function planCommand(repos: string[], options: CLIPlanOptions): Promise<void> {
  const logger = createLogger(options.verbose);

  const outputDir = path.resolve(options.output);
  const packagesDir = options.packagesDir;
  const yes = options.yes ?? false;
  const noHoist = options.hoist === false;

  const workspaceTool = parseWorkspaceTool(options.workspaceTool || 'none');
  const workflowStrategy = parseWorkflowStrategy(options.workflowStrategy || 'combine');
  const parsedConflictStrategy = parseConflictStrategy(options.conflictStrategy);
  const parsedPm = tryParsePackageManagerType(options.packageManager || 'pnpm');

  if (!workspaceTool) {
    logger.error(
      `Invalid workspace tool: ${options.workspaceTool}. Valid options: turbo, nx, none`
    );
    throw new CliExitError();
  }

  if (!workflowStrategy) {
    logger.error(
      `Invalid workflow strategy: ${options.workflowStrategy}. Valid options: combine, keep-first, keep-last, skip`
    );
    throw new CliExitError();
  }

  if (!parsedConflictStrategy) {
    logger.error(
      `Invalid conflict strategy: ${options.conflictStrategy}. Valid options: highest, lowest, prompt`
    );
    throw new CliExitError();
  }

  if (!parsedPm) {
    logger.error(
      `Invalid package manager: ${options.packageManager}. Valid options: pnpm, yarn, yarn-berry, npm`
    );
    throw new CliExitError();
  }

  const planFilePath = options.planFile
    ? path.resolve(options.planFile)
    : path.resolve(`${path.basename(outputDir)}.plan.json`);
  const sourcesDir = `${planFilePath}.sources`;

  const cleanupSources = async () => {
    try {
      await removeDir(sourcesDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug(`Failed to clean plan sources directory ${sourcesDir}: ${message}`);
    }
  };

  const onSigint = async () => {
    logger.warn('\nInterrupted. Cleaning up...');
    await cleanupSources();
    process.exit(130);
  };
  process.on('SIGINT', onSigint);

  try {
    await ensureDir(sourcesDir);

    const result = await buildApplyPlan({
      repos,
      outputDir,
      packagesDir,
      sourcesDir,
      conflictStrategy: parsedConflictStrategy,
      packageManager: parsedPm,
      autoDetectPm: options.autoDetectPm,
      workspaceTool,
      workflowStrategy,
      install: options.install,
      noHoist,
      pinVersions: options.pinVersions,
      yes,
      interactive: !yes,
      verbose: options.verbose,
      logger,
      promptConflictStrategy,
      promptFileCollisionStrategy,
    });

    if (result.depAnalysis.conflicts.length > 0) {
      const summary = getConflictSummary(result.depAnalysis.conflicts);
      logger.warn(
        `Found ${result.depAnalysis.conflicts.length} dependency conflicts ` +
        `(${summary.incompatible} incompatible, ${summary.major} major, ${summary.minor} minor)`
      );
    } else {
      logger.success('No dependency conflicts detected');
    }

    if (result.collisions.length > 0) {
      logger.warn(`Found ${result.collisions.length} file collisions`);
    } else {
      logger.success('No file collisions detected');
    }

    await ensureDir(path.dirname(planFilePath));
    await writeJson(planFilePath, result.plan, { spaces: 2 });

    logger.log('');
    logger.success(chalk.bold('Plan generated successfully!'));
    logger.log('');
    logger.log(`  ${chalk.cyan('Plan file:')} ${planFilePath}`);
    logger.log(`  ${chalk.cyan('Sources:')} ${sourcesDir}`);
    logger.log(`  ${chalk.cyan('Packages:')} ${result.repoPaths.length}`);
    logger.log(`  ${chalk.cyan('Package manager:')} ${getPackageManagerDisplayName(result.pmType)}`);
    logger.log(`  ${chalk.cyan('Extra files:')} ${result.plan.files.length}`);

    if (result.depAnalysis.conflicts.length > 0) {
      logger.log(`  ${chalk.cyan('Resolved conflicts:')} ${result.depAnalysis.conflicts.length}`);
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
    await cleanupSources();
    throw new CliExitError();
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

export type PlanCommandDeps = {
  _unused?: never;
};

export type PlanCommandOptions = {
  conflictStrategy: ConflictStrategy;
  workspaceTool: WorkspaceTool;
  workflowStrategy: WorkflowMergeStrategy;
  packageManager: PackageManagerType;
};
