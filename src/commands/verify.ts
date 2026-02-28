import path from 'node:path';
import chalk from 'chalk';
import type { VerifyCheck, VerifyResult, VerifyTier } from '../types/index.js';
import { pathExists, readJson } from '../utils/fs.js';
import { createLogger, formatHeader } from '../utils/logger.js';
import { validatePlan } from './apply.js';
import {
  type VerifyContext,
  checkRootPackageJson,
  checkWorkspaceConfig,
  checkPackageNames,
  checkRootScripts,
  checkTsconfigSanity,
  checkCircularDeps,
  checkRequiredFields,
  checkInstall,
  checkLockfileConsistency,
  checkNodeModules,
  checkBuildScripts,
  checkTestScripts,
} from './verify-checks.js';

interface CLIVerifyOptions {
  plan?: string;
  dir?: string;
  tier?: string;
  json?: boolean;
  verbose?: boolean;
}

const TIER_ORDER: VerifyTier[] = ['static', 'install', 'full'];

function parseTier(input?: string): VerifyTier {
  if (input === 'install' || input === 'full') return input;
  return 'static';
}

export async function verifyCommand(options: CLIVerifyOptions): Promise<void> {
  const logger = createLogger(options.verbose);
  const tier = parseTier(options.tier);

  // Validate exactly one of --plan / --dir
  if (options.plan && options.dir) {
    logger.error('Specify either --plan or --dir, not both');
    process.exit(1);
  }
  if (!options.plan && !options.dir) {
    logger.error('Specify either --plan <file> or --dir <directory>');
    process.exit(1);
  }

  let ctx: VerifyContext;
  let inputType: 'plan' | 'dir';
  let inputPath: string;

  if (options.plan) {
    inputType = 'plan';
    inputPath = path.resolve(options.plan);
    if (!(await pathExists(inputPath))) {
      logger.error(`Plan file not found: ${inputPath}`);
      process.exit(1);
    }
    const data = await readJson(inputPath);
    if (!validatePlan(data)) {
      logger.error('Invalid plan file');
      process.exit(1);
    }
    ctx = { plan: data, dir: null };
  } else {
    inputType = 'dir';
    inputPath = path.resolve(options.dir!);
    if (!(await pathExists(inputPath))) {
      logger.error(`Directory not found: ${inputPath}`);
      process.exit(1);
    }
    if (!(await pathExists(path.join(inputPath, 'package.json')))) {
      logger.error(`No package.json found in ${inputPath}`);
      process.exit(1);
    }
    ctx = { plan: null, dir: inputPath };
  }

  // Run checks by tier
  const checks: VerifyCheck[] = [];

  // Static tier (always runs)
  const staticChecks = await Promise.all([
    checkRootPackageJson(ctx),
    checkWorkspaceConfig(ctx),
    checkPackageNames(ctx),
    checkRootScripts(ctx),
    checkTsconfigSanity(ctx),
    checkCircularDeps(ctx),
    checkRequiredFields(ctx),
  ]);
  checks.push(...staticChecks.flat());

  // Install tier
  const tierIdx = TIER_ORDER.indexOf(tier);
  if (tierIdx >= 1) {
    const installChecks = await Promise.all([
      checkInstall(ctx),
      checkLockfileConsistency(ctx),
      checkNodeModules(ctx),
    ]);
    checks.push(...installChecks.flat());
  }

  // Full tier
  if (tierIdx >= 2) {
    const fullChecks = await Promise.all([
      checkBuildScripts(ctx),
      checkTestScripts(ctx),
    ]);
    checks.push(...fullChecks.flat());
  }

  // Assemble result
  const summary = {
    total: checks.length,
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };

  const result: VerifyResult = {
    tier,
    inputType,
    inputPath,
    checks,
    summary,
    ok: summary.fail === 0,
    timestamp: new Date().toISOString(),
  };

  // Output
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printVerifyReport(result, options.verbose ?? false);
  }

  process.exit(result.ok ? 0 : 1);
}

function printVerifyReport(result: VerifyResult, verbose: boolean): void {
  console.log(formatHeader(`Verify (${result.tier} tier) — ${result.inputType}: ${result.inputPath}`));

  const fails = result.checks.filter((c) => c.status === 'fail');
  const warns = result.checks.filter((c) => c.status === 'warn');
  const passes = result.checks.filter((c) => c.status === 'pass');

  if (fails.length > 0) {
    console.log(chalk.red.bold('\nFailures:'));
    for (const c of fails) {
      console.log(chalk.red(`  [FAIL] ${c.message}`));
      if (verbose && c.planRef) console.log(chalk.gray(`         planRef: ${c.planRef}`));
      if (verbose && c.details) console.log(chalk.gray(`         ${c.details}`));
    }
  }

  if (warns.length > 0) {
    console.log(chalk.yellow.bold('\nWarnings:'));
    for (const c of warns) {
      console.log(chalk.yellow(`  [WARN] ${c.message}`));
      if (verbose && c.planRef) console.log(chalk.gray(`         planRef: ${c.planRef}`));
      if (verbose && c.details) console.log(chalk.gray(`         ${c.details}`));
    }
  }

  if (passes.length > 0) {
    console.log(chalk.green.bold('\nPassed:'));
    for (const c of passes) {
      console.log(chalk.green(`  [PASS] ${c.message}`));
      if (verbose && c.planRef) console.log(chalk.gray(`         planRef: ${c.planRef}`));
    }
  }

  console.log(`\n${result.summary.total} checks: ${result.summary.pass} pass, ${result.summary.warn} warn, ${result.summary.fail} fail`);

  if (result.ok) {
    console.log(chalk.green.bold('\nVerification passed'));
  } else {
    console.log(chalk.red.bold('\nVerification failed'));
  }
}
