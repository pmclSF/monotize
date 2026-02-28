import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import { createLogger, formatHeader } from '../utils/logger.js';
import { pathExists, writeJson } from '../utils/fs.js';
import { generateConfigPlan, applyConfigPlan } from '../strategies/configure.js';

interface CLIConfigureOptions {
  apply?: boolean;
  out?: string;
  packagesDir: string;
  verbose?: boolean;
}

async function configureCommand(monorepoDir: string, options: CLIConfigureOptions): Promise<void> {
  const logger = createLogger(options.verbose);
  const resolvedDir = path.resolve(monorepoDir);

  logger.log(formatHeader('Configure'));

  // Validate the monorepo directory exists
  if (!(await pathExists(resolvedDir))) {
    logger.error(`Monorepo directory not found: ${resolvedDir}`);
    process.exit(1);
  }

  // Discover packages in the packages directory
  const pkgsDirPath = path.join(resolvedDir, options.packagesDir);
  let packageNames: string[] = [];

  if (await pathExists(pkgsDirPath)) {
    const { default: fs } = await import('fs-extra');
    const entries = await fs.readdir(pkgsDirPath, { withFileTypes: true });
    packageNames = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  }

  logger.info(`Found ${packageNames.length} package(s) in ${options.packagesDir}/`);

  // Generate the ConfigPlan
  const plan = await generateConfigPlan(
    resolvedDir,
    packageNames,
    options.packagesDir,
    {},
    logger,
  );

  // Display patches
  if (plan.patches.length > 0) {
    logger.log('');
    logger.log(chalk.cyan.bold('Patches:'));
    for (const patch of plan.patches) {
      const label = patch.before ? 'UPDATE' : 'CREATE';
      logger.log(`  [${label}] ${patch.path} — ${patch.description}`);
    }
  } else {
    logger.log('');
    logger.success('No config patches needed — everything is already configured.');
  }

  // Display warnings
  if (plan.warnings.length > 0) {
    logger.log('');
    logger.log(chalk.yellow.bold('Warnings:'));
    for (const warning of plan.warnings) {
      logger.warn(`  ${warning.config}: ${warning.reason}`);
      logger.log(`    Suggestion: ${warning.suggestion}`);
    }
  }

  // Optionally write plan JSON to file
  if (options.out) {
    const outPath = path.resolve(options.out);
    await writeJson(outPath, plan, { spaces: 2 });
    logger.log('');
    logger.success(`Plan written to ${outPath}`);
  }

  // Optionally apply
  if (options.apply) {
    logger.log('');
    logger.info('Applying config plan...');
    await applyConfigPlan(plan, resolvedDir, logger);
    logger.success('Config plan applied successfully.');
  } else if (!options.out && plan.patches.length > 0) {
    logger.log('');
    logger.log('Run with --apply to write these files, or --out <file> to save the plan as JSON.');
  }
}

export function registerConfigureCommand(program: Command): void {
  program
    .command('configure')
    .description('Scaffold shared configs (Prettier, ESLint, TypeScript) for a monorepo')
    .argument('<monorepo-dir>', 'Path to the monorepo directory')
    .option('--apply', 'Apply changes to disk')
    .option('--out <file>', 'Write plan JSON to file')
    .option('-p, --packages-dir <dir>', 'Packages subdirectory name', 'packages')
    .option('-v, --verbose', 'Verbose output')
    .action(configureCommand);
}
