import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import fs from 'fs-extra';
import type {
  ApplyPlan,
  ApplyStepId,
  OperationLogEntry,
  Logger,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import {
  ensureDir,
  move,
  writeJson,
  writeFile,
  readFile,
  pathExists,
  removeDir,
} from '../utils/fs.js';
import {
  getLogPath,
  createOperationLog,
  readOperationLog,
  isStepCompleted,
  appendLogEntry,
  computePlanHash,
} from '../utils/operation-log.js';

/**
 * CLI options passed from commander
 */
interface CLIApplyOptions {
  plan: string;
  out: string;
  resume?: boolean;
  cleanup?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Validate that a parsed object conforms to the ApplyPlan schema.
 */
export function validatePlan(data: unknown): data is ApplyPlan {
  if (typeof data !== 'object' || data === null) return false;
  const plan = data as Record<string, unknown>;
  if (plan.version !== 1) return false;
  if (!Array.isArray(plan.sources) || plan.sources.length === 0) return false;
  if (typeof plan.packagesDir !== 'string') return false;
  if (typeof plan.rootPackageJson !== 'object' || plan.rootPackageJson === null) return false;
  if (!Array.isArray(plan.files)) return false;
  if (typeof plan.install !== 'boolean') return false;
  for (const source of plan.sources) {
    if (typeof source !== 'object' || source === null) return false;
    const s = source as Record<string, unknown>;
    if (typeof s.name !== 'string' || typeof s.path !== 'string') return false;
  }
  for (const file of plan.files) {
    if (typeof file !== 'object' || file === null) return false;
    const f = file as Record<string, unknown>;
    if (typeof f.relativePath !== 'string' || typeof f.content !== 'string') return false;
  }
  return true;
}

/**
 * Find staging directories matching <output>.staging-<hex> pattern.
 */
export async function findStagingDirs(outputDir: string): Promise<string[]> {
  const parent = path.dirname(outputDir);
  const base = path.basename(outputDir);
  try {
    const entries = await fs.readdir(parent);
    const pattern = new RegExp(
      `^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.staging-[0-9a-f]{8}$`
    );
    return entries
      .filter((e) => pattern.test(e))
      .map((e) => path.join(parent, e));
  } catch {
    return [];
  }
}

/**
 * Execute a single apply step with logging.
 * Returns false if aborted.
 */
async function executeStep(
  stepId: ApplyStepId,
  logPath: string,
  logEntries: OperationLogEntry[],
  signal: AbortSignal,
  logger: Logger,
  fn: () => Promise<string[]>
): Promise<boolean> {
  if (signal.aborted) return false;

  if (isStepCompleted(logEntries, stepId)) {
    logger.debug(`Step "${stepId}" already completed, skipping`);
    return true;
  }

  logger.debug(`Starting step: ${stepId}`);
  const start = Date.now();

  try {
    const outputs = await fn();
    const entry: OperationLogEntry = {
      id: stepId,
      status: 'completed',
      timestamp: new Date().toISOString(),
      outputs,
      durationMs: Date.now() - start,
    };
    await appendLogEntry(logPath, entry);
    logger.debug(`Completed step: ${stepId} (${entry.durationMs}ms)`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const entry: OperationLogEntry = {
      id: stepId,
      status: 'failed',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      error: message,
    };
    await appendLogEntry(logPath, entry);
    throw error;
  }
}

/**
 * Main apply command handler
 */
export async function applyCommand(options: CLIApplyOptions): Promise<void> {
  const logger = createLogger(options.verbose);
  const outputDir = path.resolve(options.out);

  // --cleanup: remove staging artifacts and exit
  if (options.cleanup) {
    const stagingDirs = await findStagingDirs(outputDir);
    if (stagingDirs.length === 0) {
      logger.info('No staging artifacts found.');
      return;
    }
    for (const dir of stagingDirs) {
      const logFile = getLogPath(dir);
      await removeDir(dir);
      if (await pathExists(logFile)) {
        await fs.remove(logFile);
      }
      logger.info(`Removed: ${path.basename(dir)}`);
    }
    logger.success(`Cleaned up ${stagingDirs.length} staging artifact(s).`);
    return;
  }

  // Load and validate plan
  const planPath = path.resolve(options.plan);
  if (!(await pathExists(planPath))) {
    logger.error(`Plan file not found: ${planPath}`);
    process.exit(1);
  }

  const planContent = await readFile(planPath);
  const planHash = computePlanHash(planContent);

  let plan: ApplyPlan;
  try {
    plan = JSON.parse(planContent);
  } catch {
    logger.error('Plan file contains invalid JSON.');
    process.exit(1);
    return; // unreachable, satisfies TS
  }

  if (!validatePlan(plan)) {
    logger.error('Plan file is invalid. Check version, sources, packagesDir, rootPackageJson, files, and install fields.');
    process.exit(1);
    return;
  }

  // --dry-run: print steps and exit
  if (options.dryRun) {
    logger.log(chalk.bold('\nDry Run — Apply Plan'));
    logger.log(`\n  Plan: ${planPath}`);
    logger.log(`  Output: ${outputDir}`);
    logger.log(`  Packages dir: ${plan.packagesDir}`);
    logger.log(`\n  Steps:`);
    logger.log(`    1. scaffold       — Create ${outputDir} and ${plan.packagesDir}/`);
    logger.log(`    2. move-packages  — Move ${plan.sources.length} package(s): ${plan.sources.map((s) => s.name).join(', ')}`);
    logger.log(`    3. write-root     — Write root package.json`);
    logger.log(`    4. write-extras   — Write ${plan.files.length} file(s): ${plan.files.map((f) => f.relativePath).join(', ')}`);
    if (plan.install) {
      logger.log(`    5. install        — Run: ${plan.installCommand || 'pnpm install'}`);
    } else {
      logger.log(`    5. install        — Skipped (install: false)`);
    }
    logger.log(`\n  Atomic finalize: rename staging dir → ${outputDir}`);
    logger.log('');
    return;
  }

  // Determine staging directory
  let stagingDir: string;
  let logPath: string;
  let logEntries: OperationLogEntry[] = [];

  if (options.resume) {
    const stagingDirs = await findStagingDirs(outputDir);
    if (stagingDirs.length === 0) {
      logger.error('No staging directory found to resume. Run without --resume to start fresh.');
      process.exit(1);
      return;
    }
    if (stagingDirs.length > 1) {
      logger.error(`Multiple staging directories found. Run with --cleanup first.`);
      process.exit(1);
      return;
    }
    stagingDir = stagingDirs[0];
    logPath = getLogPath(stagingDir);
    logEntries = await readOperationLog(logPath);

    // Verify plan hash
    const headerEntry = logEntries.find((e) => e.id === 'header');
    if (headerEntry?.planHash && headerEntry.planHash !== planHash) {
      logger.error('Plan file has changed since the staging directory was created. Use --cleanup first.');
      process.exit(1);
      return;
    }

    const completedSteps = logEntries.filter((e) => e.status === 'completed').length;
    logger.info(`Resuming from staging directory (${completedSteps} step(s) already completed)`);
  } else {
    const nonce = crypto.randomBytes(4).toString('hex');
    stagingDir = `${outputDir}.staging-${nonce}`;
    logPath = getLogPath(stagingDir);
    await createOperationLog(logPath, planHash);
    logEntries = await readOperationLog(logPath);
    logger.info('Starting transactional apply...');
  }

  // Validate source paths exist (skip if move-packages already completed on resume)
  if (!isStepCompleted(logEntries, 'move-packages')) {
    for (const source of plan.sources) {
      if (!(await pathExists(source.path))) {
        logger.error(`Source path not found: ${source.path} (for package "${source.name}")`);
        logger.info('Source repos may have been cleaned up. Regenerate the plan file.');
        process.exit(1);
      }
    }
  }

  // Set up abort handling
  const controller = new AbortController();
  const { signal } = controller;

  const onSigint = () => {
    logger.warn('\nCancelled. Staging directory preserved for --resume.');
    controller.abort();
  };
  process.on('SIGINT', onSigint);

  try {
    // Step 1: scaffold
    const scaffoldOk = await executeStep('scaffold', logPath, logEntries, signal, logger, async () => {
      await ensureDir(stagingDir);
      const packagesPath = path.join(stagingDir, plan.packagesDir);
      await ensureDir(packagesPath);
      return [stagingDir, packagesPath];
    });
    if (!scaffoldOk) return;

    // Step 2: move-packages
    const moveOk = await executeStep('move-packages', logPath, logEntries, signal, logger, async () => {
      const outputs: string[] = [];
      for (const source of plan.sources) {
        if (signal.aborted) break;
        const targetPath = path.join(stagingDir, plan.packagesDir, source.name);
        if (await pathExists(targetPath)) {
          logger.debug(`Package "${source.name}" already in staging, skipping`);
          outputs.push(path.join(plan.packagesDir, source.name));
          continue;
        }
        await move(source.path, targetPath);
        outputs.push(path.join(plan.packagesDir, source.name));
        logger.debug(`Moved ${source.name} → ${plan.packagesDir}/${source.name}`);
      }
      if (signal.aborted) {
        throw new Error('Aborted during move-packages');
      }
      return outputs;
    });
    if (!moveOk) return;

    // Step 3: write-root
    const writeRootOk = await executeStep('write-root', logPath, logEntries, signal, logger, async () => {
      await writeJson(path.join(stagingDir, 'package.json'), plan.rootPackageJson, { spaces: 2 });
      return ['package.json'];
    });
    if (!writeRootOk) return;

    // Step 4: write-extras
    const writeExtrasOk = await executeStep('write-extras', logPath, logEntries, signal, logger, async () => {
      const outputs: string[] = [];
      for (const file of plan.files) {
        if (signal.aborted) break;
        const filePath = path.join(stagingDir, file.relativePath);
        await ensureDir(path.dirname(filePath));
        await writeFile(filePath, file.content);
        outputs.push(file.relativePath);
      }
      if (signal.aborted) {
        throw new Error('Aborted during write-extras');
      }
      return outputs;
    });
    if (!writeExtrasOk) return;

    // Step 5: install
    if (plan.install) {
      const installOk = await executeStep('install', logPath, logEntries, signal, logger, async () => {
        const cmd = plan.installCommand || 'pnpm install';
        logger.info(`Installing dependencies: ${cmd}`);
        execSync(cmd, {
          cwd: stagingDir,
          stdio: options.verbose ? 'inherit' : 'pipe',
        });
        return ['node_modules/'];
      });
      if (!installOk) return;
    }

    // Atomic finalize: rename staging → output
    logger.info('Finalizing...');
    if (await pathExists(outputDir)) {
      await removeDir(outputDir);
    }
    await move(stagingDir, outputDir);
    // Remove the log file — operation is complete
    if (await pathExists(logPath)) {
      await fs.remove(logPath);
    }

    logger.log('');
    logger.success(chalk.bold('Apply completed successfully!'));
    logger.log(`  ${chalk.cyan('Location:')} ${outputDir}`);
    logger.log(`  ${chalk.cyan('Packages:')} ${plan.sources.length}`);
    logger.log('');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (signal.aborted) {
      logger.info(`Staging directory: ${stagingDir}`);
      logger.info(`Operation log: ${logPath}`);
      logger.info('Run with --resume to continue.');
    } else {
      logger.error(`Apply failed: ${message}`);
      logger.info(`Staging directory preserved at: ${stagingDir}`);
      logger.info('Fix the issue and run with --resume, or use --cleanup to remove staging artifacts.');
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}
