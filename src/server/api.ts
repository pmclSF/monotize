import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  AnalyzeResult,
  ApplyPlan,
  ConfigureResult,
  ConflictStrategy,
  Logger,
  PrepareAnalysis,
  VerifyCheck,
  VerifyResult,
  VerifyTier,
  WorkflowMergeStrategy,
  WorkspaceTool,
} from '../types/index.js';
import { validateRepoSources } from '../utils/validation.js';
import {
  createTempDir,
  removeDir,
  ensureDir,
  writeJson,
  readFile,
  pathExists,
  writeFile,
  move,
} from '../utils/fs.js';
import { analyzeDependencies } from '../analyzers/dependencies.js';
import { detectFileCollisions } from '../analyzers/files.js';
import { detectCircularDependencies, computeHotspots } from '../analyzers/graph.js';
import { cloneOrCopyRepos } from '../strategies/copy.js';
import { analyzeReposForPreparation } from '../analyzers/prepare.js';
import {
  detectCrossDependencies,
  calculateComplexityScore,
  generateRecommendations,
} from '../commands/analyze.js';
import {
  resolveDependencyConflicts,
  getConflictSummary,
} from '../resolvers/dependencies.js';
import {
  generateWorkspaceConfig,
} from '../strategies/workspace-config.js';
import {
  generateWorkspaceToolConfig,
  getWorkspaceToolDependencies,
  updateScriptsForWorkspaceTool,
} from '../strategies/workspace-tools.js';
import { mergeWorkflowsToFiles } from '../strategies/workflow-merge.js';
import {
  generateRootReadme,
  mergeGitignores,
  resolveFileCollisionToContent,
} from '../strategies/merge-files.js';
import {
  createPackageManagerConfig,
  generateWorkspaceFiles,
  getWorkspacesConfig,
  getGitignoreEntries,
  getPackageManagerField,
  parsePackageManagerType,
  validatePackageManager,
} from '../strategies/package-manager.js';
import { validatePlan } from '../commands/apply.js';
import type { VerifyContext } from '../commands/verify-checks.js';
import {
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
} from '../commands/verify-checks.js';
import {
  getLogPath,
  createOperationLog,
  readOperationLog,
  isStepCompleted,
  appendLogEntry,
  computePlanHash,
} from '../utils/operation-log.js';
import type { OperationLogEntry, ApplyStepId } from '../types/index.js';
import { readJson } from '../utils/fs.js';
import crypto from 'node:crypto';

// ─── Analyze ───────────────────────────────────────────────────────────────

export async function runAnalyze(
  repos: string[],
  logger: Logger,
): Promise<AnalyzeResult> {
  // Validate
  logger.info('Validating repository sources...');
  const validation = await validateRepoSources(repos);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
  logger.success(`Found ${validation.sources.length} repositories to analyze`);

  // Clone/copy to temp
  const tempDir = await createTempDir();
  try {
    logger.info('Fetching repositories...');
    const repoPaths = await cloneOrCopyRepos(validation.sources, tempDir, {
      logger,
      verbose: true,
    });

    logger.info('Analyzing dependencies...');
    const depAnalysis = await analyzeDependencies(repoPaths);

    logger.info('Detecting file collisions...');
    const collisions = await detectFileCollisions(repoPaths);

    const crossDependencies = detectCrossDependencies(depAnalysis.packages);
    const circularDependencies = detectCircularDependencies(crossDependencies);
    const hotspots = computeHotspots(depAnalysis.packages, depAnalysis.conflicts);
    const peerConflicts = depAnalysis.findings?.peerConflicts ?? [];

    const complexityScore = calculateComplexityScore(
      depAnalysis.packages,
      depAnalysis.conflicts,
      collisions,
      crossDependencies,
      peerConflicts,
      circularDependencies,
    );

    const recommendations = generateRecommendations(
      depAnalysis.packages,
      depAnalysis.conflicts,
      collisions,
      crossDependencies,
      peerConflicts,
      circularDependencies,
    );

    const result: AnalyzeResult = {
      packages: depAnalysis.packages,
      conflicts: depAnalysis.conflicts,
      collisions,
      crossDependencies,
      complexityScore,
      recommendations,
      circularDependencies: circularDependencies.length > 0 ? circularDependencies : undefined,
      hotspots: hotspots.length > 0 ? hotspots : undefined,
      findings: depAnalysis.findings,
    };

    logger.success('Analysis complete');
    return result;
  } finally {
    try {
      await removeDir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ─── Plan ──────────────────────────────────────────────────────────────────

export interface PlanOptions {
  output?: string;
  packagesDir?: string;
  conflictStrategy?: ConflictStrategy;
  packageManager?: string;
  workspaceTool?: WorkspaceTool;
  workflowStrategy?: WorkflowMergeStrategy;
  install?: boolean;
  hoist?: boolean;
  pinVersions?: boolean;
}

export async function runPlan(
  repos: string[],
  options: PlanOptions,
  logger: Logger,
): Promise<{ planPath: string; plan: ApplyPlan }> {
  const outputDir = path.resolve(options.output || './monorepo');
  const packagesDir = options.packagesDir || 'packages';
  const workspaceTool: WorkspaceTool = options.workspaceTool || 'none';
  const workflowStrategy: WorkflowMergeStrategy = options.workflowStrategy || 'combine';
  const noHoist = options.hoist === false;
  const conflictStrategy: ConflictStrategy = options.conflictStrategy || 'highest';

  // Generate plan file path
  const planFilePath = path.resolve(`${path.basename(outputDir)}.plan.json`);
  const sourcesDir = `${planFilePath}.sources`;

  // Validate
  logger.info('Validating repository sources...');
  const validation = await validateRepoSources(repos);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
  logger.success(`Found ${validation.sources.length} repositories to merge`);

  // Clone/copy repos
  await ensureDir(sourcesDir);
  logger.info('Fetching repositories...');
  const repoPaths = await cloneOrCopyRepos(validation.sources, sourcesDir, {
    logger,
    verbose: true,
  });

  // Package manager
  const pmType = parsePackageManagerType(options.packageManager || 'pnpm');
  const pmValidation = validatePackageManager(pmType);
  if (!pmValidation.valid) {
    throw new Error(pmValidation.error!);
  }
  const pmConfig = createPackageManagerConfig(pmType);

  // Analyze dependencies
  logger.info('Analyzing dependencies...');
  const depAnalysis = await analyzeDependencies(repoPaths);

  if (depAnalysis.conflicts.length > 0) {
    const summary = getConflictSummary(depAnalysis.conflicts);
    logger.warn(
      `Found ${depAnalysis.conflicts.length} dependency conflicts ` +
      `(${summary.incompatible} incompatible, ${summary.major} major, ${summary.minor} minor)`,
    );
  }

  // File collisions
  logger.info('Detecting file collisions...');
  const collisions = await detectFileCollisions(repoPaths);

  // Resolve dependency conflicts (always use non-interactive strategy)
  const resolvedDeps = await resolveDependencyConflicts(
    depAnalysis.conflicts,
    conflictStrategy,
    depAnalysis.resolvedDependencies,
    depAnalysis.resolvedDevDependencies,
  );

  // Generate workspace config
  const workspaceConfig = generateWorkspaceConfig(depAnalysis.packages, {
    rootName: path.basename(outputDir),
    packagesDir,
    dependencies: noHoist ? {} : resolvedDeps.dependencies,
    devDependencies: noHoist ? {} : resolvedDeps.devDependencies,
    pmConfig,
  });

  // Update scripts for workspace tool
  if (workspaceTool !== 'none') {
    const availableScripts = Object.keys(
      (workspaceConfig.rootPackageJson.scripts as Record<string, string>) || {},
    );
    const updatedScripts = updateScriptsForWorkspaceTool(
      workspaceConfig.rootPackageJson.scripts as Record<string, string>,
      workspaceTool,
      availableScripts,
    );
    workspaceConfig.rootPackageJson.scripts = updatedScripts;

    const toolDeps = getWorkspaceToolDependencies(workspaceTool);
    const existingDevDeps =
      (workspaceConfig.rootPackageJson.devDependencies as Record<string, string>) || {};
    workspaceConfig.rootPackageJson.devDependencies = { ...existingDevDeps, ...toolDeps };
  }

  // Add workspaces field for yarn/npm
  const workspacesConfig = getWorkspacesConfig(pmConfig, packagesDir);
  if (workspacesConfig) {
    workspaceConfig.rootPackageJson.workspaces = workspacesConfig;
  }
  workspaceConfig.rootPackageJson.packageManager = getPackageManagerField(pmConfig);

  // Collect plan files
  const planFiles: Array<{ relativePath: string; content: string }> = [];

  // Workspace files
  const workspaceFilesList = generateWorkspaceFiles(pmConfig, packagesDir);
  for (const file of workspaceFilesList) {
    planFiles.push({ relativePath: file.filename, content: file.content });
  }

  // Workspace tool config
  if (workspaceTool !== 'none') {
    const toolConfig = generateWorkspaceToolConfig(depAnalysis.packages, workspaceTool);
    if (toolConfig) {
      planFiles.push({ relativePath: toolConfig.filename, content: toolConfig.content });
    }
  }

  // Merge workflows
  if (workflowStrategy !== 'skip') {
    logger.info('Processing CI/CD workflows...');
    try {
      const workflowFiles = await mergeWorkflowsToFiles(repoPaths, workflowStrategy);
      planFiles.push(
        ...workflowFiles.map((f) => ({ relativePath: f.relativePath, content: f.content })),
      );
    } catch (error) {
      logger.warn(
        `Failed to process workflows: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Handle file collisions (use suggested strategy for non-interactive)
  for (const collision of collisions) {
    const collisionFiles = await resolveFileCollisionToContent(
      collision,
      collision.suggestedStrategy,
      repoPaths,
    );
    planFiles.push(
      ...collisionFiles.map((f) => ({ relativePath: f.relativePath, content: f.content })),
    );
  }

  // .gitignore
  const hasGitignoreCollision = collisions.some((c) => c.path === '.gitignore');
  if (!hasGitignoreCollision) {
    const gitignorePaths: string[] = [];
    for (const r of repoPaths) {
      const p = path.join(r.path, '.gitignore');
      if (await pathExists(p)) {
        gitignorePaths.push(p);
      }
    }
    let gitignoreContent =
      gitignorePaths.length > 0
        ? await mergeGitignores(gitignorePaths)
        : 'node_modules/\ndist/\n.DS_Store\n*.log\n';
    const pmEntries = getGitignoreEntries(pmConfig);
    if (pmEntries.length > 0) {
      gitignoreContent += '\n# Package manager\n' + pmEntries.join('\n') + '\n';
    }
    planFiles.push({ relativePath: '.gitignore', content: gitignoreContent });
  }

  // README
  const readmeContent = generateRootReadme(
    repoPaths.map((r) => r.name),
    packagesDir,
    pmConfig,
  );
  planFiles.push({ relativePath: 'README.md', content: readmeContent });

  // Assemble plan
  const plan: ApplyPlan = {
    version: 1,
    sources: repoPaths.map((r) => ({ name: r.name, path: r.path })),
    packagesDir,
    rootPackageJson: workspaceConfig.rootPackageJson,
    files: planFiles,
    install: options.install !== false,
    installCommand: pmConfig.installCommand,
    analysisFindings: depAnalysis.findings,
  };

  // Write plan file
  await ensureDir(path.dirname(planFilePath));
  await writeJson(planFilePath, plan, { spaces: 2 });

  logger.success('Plan generated successfully');
  return { planPath: planFilePath, plan };
}

// ─── Apply ─────────────────────────────────────────────────────────────────

export interface ApplyOptions {
  plan: string;
  out?: string;
}

export async function runApply(
  options: ApplyOptions,
  logger: Logger,
  signal?: AbortSignal,
): Promise<{ outputDir: string; packageCount: number }> {
  const planPath = path.resolve(options.plan);
  const outputDir = path.resolve(options.out || './monorepo');

  if (!(await pathExists(planPath))) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  const planContent = await readFile(planPath);
  const planHash = computePlanHash(planContent);

  let plan: ApplyPlan;
  try {
    plan = JSON.parse(planContent);
  } catch {
    throw new Error('Plan file contains invalid JSON');
  }

  if (!validatePlan(plan)) {
    throw new Error('Plan file is invalid');
  }

  // Create staging directory
  const nonce = crypto.randomBytes(4).toString('hex');
  const stagingDir = `${outputDir}.staging-${nonce}`;
  const logPath = getLogPath(stagingDir);
  await createOperationLog(logPath, planHash);
  const logEntries = await readOperationLog(logPath);

  logger.info('Starting transactional apply...');

  // Validate source paths
  for (const source of plan.sources) {
    if (!(await pathExists(source.path))) {
      throw new Error(
        `Source path not found: ${source.path} (for package "${source.name}")`,
      );
    }
  }

  // Helper to execute a step
  const executeStep = async (
    stepId: ApplyStepId,
    fn: () => Promise<string[]>,
  ): Promise<void> => {
    if (signal?.aborted) throw new Error('Operation cancelled');
    if (isStepCompleted(logEntries, stepId)) {
      logger.debug(`Step "${stepId}" already completed, skipping`);
      return;
    }
    logger.info(`Running step: ${stepId}`);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendLogEntry(logPath, {
        id: stepId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
        error: message,
      });
      throw error;
    }
  };

  try {
    // Step 1: scaffold
    await executeStep('scaffold', async () => {
      await ensureDir(stagingDir);
      const packagesPath = path.join(stagingDir, plan.packagesDir);
      await ensureDir(packagesPath);
      return [stagingDir, packagesPath];
    });

    // Step 2: move-packages
    await executeStep('move-packages', async () => {
      const outputs: string[] = [];
      for (const source of plan.sources) {
        if (signal?.aborted) throw new Error('Operation cancelled');
        const targetPath = path.join(stagingDir, plan.packagesDir, source.name);
        if (await pathExists(targetPath)) {
          outputs.push(path.join(plan.packagesDir, source.name));
          continue;
        }
        await move(source.path, targetPath);
        outputs.push(path.join(plan.packagesDir, source.name));
        logger.info(`Moved ${source.name} → ${plan.packagesDir}/${source.name}`);
      }
      return outputs;
    });

    // Step 3: write-root
    await executeStep('write-root', async () => {
      await writeJson(path.join(stagingDir, 'package.json'), plan.rootPackageJson, {
        spaces: 2,
      });
      return ['package.json'];
    });

    // Step 4: write-extras
    await executeStep('write-extras', async () => {
      const outputs: string[] = [];
      for (const file of plan.files) {
        if (signal?.aborted) throw new Error('Operation cancelled');
        const filePath = path.join(stagingDir, file.relativePath);
        await ensureDir(path.dirname(filePath));
        await writeFile(filePath, file.content);
        outputs.push(file.relativePath);
      }
      return outputs;
    });

    // Step 5: install (async with spawn)
    if (plan.install) {
      await executeStep('install', async () => {
        const cmd = plan.installCommand || 'pnpm install --ignore-scripts';
        logger.info(`Installing dependencies: ${cmd}`);
        const [exe, ...args] = cmd.split(' ');

        await new Promise<void>((resolve, reject) => {
          const child = spawn(exe, args, { cwd: stagingDir, stdio: 'pipe' });

          if (signal) {
            const onAbort = () => {
              child.kill('SIGTERM');
              reject(new Error('Operation cancelled'));
            };
            signal.addEventListener('abort', onAbort, { once: true });
            child.on('close', () => signal.removeEventListener('abort', onAbort));
          }

          child.stdout?.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n').filter(Boolean);
            for (const line of lines) logger.info(line);
          });

          child.stderr?.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n').filter(Boolean);
            for (const line of lines) logger.warn(line);
          });

          child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Install exited with code ${code}`));
          });

          child.on('error', reject);
        });

        return ['node_modules/'];
      });
    }

    // Atomic finalize
    logger.info('Finalizing...');
    if (await pathExists(outputDir)) {
      await removeDir(outputDir);
    }
    await move(stagingDir, outputDir);

    logger.success('Apply completed successfully');
    return { outputDir, packageCount: plan.sources.length };
  } catch (error) {
    // Try to clean up staging on failure
    try {
      if (await pathExists(stagingDir)) {
        await removeDir(stagingDir);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ─── Verify ────────────────────────────────────────────────────────────────

export interface VerifyOptions {
  plan?: string;
  dir?: string;
  tier?: VerifyTier;
}

const TIER_ORDER: VerifyTier[] = ['static', 'install', 'full'];

export async function runVerify(
  options: VerifyOptions,
  logger: Logger,
): Promise<VerifyResult> {
  const tier = options.tier || 'static';

  if (options.plan && options.dir) {
    throw new Error('Specify either plan or dir, not both');
  }
  if (!options.plan && !options.dir) {
    throw new Error('Specify either plan or dir');
  }

  let ctx: VerifyContext;
  let inputType: 'plan' | 'dir';
  let inputPath: string;

  if (options.plan) {
    inputType = 'plan';
    inputPath = path.resolve(options.plan);
    if (!(await pathExists(inputPath))) {
      throw new Error(`Plan file not found: ${inputPath}`);
    }
    const data = await readJson(inputPath);
    if (!validatePlan(data)) {
      throw new Error('Invalid plan file');
    }
    ctx = { plan: data as ApplyPlan, dir: null };
  } else {
    inputType = 'dir';
    inputPath = path.resolve(options.dir!);
    if (!(await pathExists(inputPath))) {
      throw new Error(`Directory not found: ${inputPath}`);
    }
    if (!(await pathExists(path.join(inputPath, 'package.json')))) {
      throw new Error(`No package.json found in ${inputPath}`);
    }
    ctx = { plan: null, dir: inputPath };
  }

  logger.info(`Running ${tier} tier verification...`);

  const checks: VerifyCheck[] = [];

  // Static tier (always)
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

  logger.success(`Verification complete: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`);
  return result;
}

// ─── Prepare ────────────────────────────────────────────────────────────────

export interface PrepareOptions {
  targetNodeVersion?: string;
  targetPackageManager?: string;
}

export async function runPrepare(
  repos: string[],
  options: PrepareOptions,
  logger: Logger,
): Promise<PrepareAnalysis> {
  // Validate
  logger.info('Validating repository sources...');
  const validation = await validateRepoSources(repos);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
  logger.success(`Found ${validation.sources.length} repositories to prepare`);

  // Clone/copy to temp
  const tempDir = await createTempDir();
  try {
    logger.info('Fetching repositories...');
    const repoPaths = await cloneOrCopyRepos(validation.sources, tempDir, {
      logger,
      verbose: true,
    });

    logger.info('Analyzing repos for preparation...');
    const result = await analyzeReposForPreparation(repoPaths, {
      targetNodeVersion: options.targetNodeVersion ?? undefined,
      targetPackageManager: options.targetPackageManager ?? undefined,
    });

    logger.info(`Found ${result.checklist.length} checklist items, ${result.patches.length} patches`);
    logger.success('Preparation analysis complete');
    return result;
  } finally {
    try {
      await removeDir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ─── Configure ──────────────────────────────────────────────────────────────

export interface ConfigureOptions {
  packagesDir: string;
  packageNames: string[];
  workspaceTool?: WorkspaceTool;
  baseDir?: string;
}

export async function runConfigure(
  options: ConfigureOptions,
  logger: Logger,
): Promise<ConfigureResult> {
  const { packagesDir, packageNames } = options;
  const baseDir = options.baseDir || process.cwd();
  const scaffoldedFiles: ConfigureResult['scaffoldedFiles'] = [];
  const skippedConfigs: ConfigureResult['skippedConfigs'] = [];

  await ensureDir(baseDir);

  // 1. tsconfig.base.json — shared compiler options
  logger.info('Scaffolding tsconfig.base.json...');
  const tsconfigBase = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: 'dist',
      rootDir: 'src',
    },
    exclude: ['node_modules', 'dist'],
  };
  await writeJson(path.join(baseDir, 'tsconfig.base.json'), tsconfigBase, { spaces: 2 });
  scaffoldedFiles.push({ relativePath: 'tsconfig.base.json', description: 'Shared TypeScript compiler options' });

  // 2. Root tsconfig.json with project references
  logger.info('Scaffolding root tsconfig.json...');
  const rootTsconfig = {
    files: [],
    references: packageNames.map((name) => ({
      path: `./${packagesDir}/${name}`,
    })),
  };
  await writeJson(path.join(baseDir, 'tsconfig.json'), rootTsconfig, { spaces: 2 });
  scaffoldedFiles.push({ relativePath: 'tsconfig.json', description: 'Root TypeScript config with project references' });

  // 3. Per-package tsconfig.json
  for (const name of packageNames) {
    const pkgTsconfigRelPath = path.join(packagesDir, name, 'tsconfig.json');
    const pkgTsconfigAbsPath = path.join(baseDir, pkgTsconfigRelPath);
    await ensureDir(path.dirname(pkgTsconfigAbsPath));
    const pkgTsconfig = {
      extends: '../../tsconfig.base.json',
      compilerOptions: {
        outDir: 'dist',
        rootDir: 'src',
      },
      include: ['src'],
    };
    await writeJson(pkgTsconfigAbsPath, pkgTsconfig, { spaces: 2 });
    scaffoldedFiles.push({ relativePath: pkgTsconfigRelPath, description: `TypeScript config for ${name}` });
    logger.info(`Scaffolded ${pkgTsconfigRelPath}`);
  }

  // 4. .prettierrc.json (JSON-only)
  logger.info('Scaffolding .prettierrc.json...');
  const prettierConfig = {
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    tabWidth: 2,
  };
  await writeJson(path.join(baseDir, '.prettierrc.json'), prettierConfig, { spaces: 2 });
  scaffoldedFiles.push({ relativePath: '.prettierrc.json', description: 'Prettier configuration (JSON)' });

  // 5. .eslintrc.json (JSON-only)
  logger.info('Scaffolding .eslintrc.json...');
  const eslintConfig = {
    root: true,
    env: { node: true, es2022: true },
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
    ],
    rules: {},
  };
  await writeJson(path.join(baseDir, '.eslintrc.json'), eslintConfig, { spaces: 2 });
  scaffoldedFiles.push({ relativePath: '.eslintrc.json', description: 'ESLint configuration (JSON)' });

  // Log skipped executable configs
  skippedConfigs.push({
    name: 'eslint.config.js',
    reason: 'Executable configs require manual migration; scaffolded .eslintrc.json instead',
  });
  skippedConfigs.push({
    name: 'prettier.config.js',
    reason: 'Executable configs require manual migration; scaffolded .prettierrc.json instead',
  });
  skippedConfigs.push({
    name: 'eslint.config.mjs',
    reason: 'ESM flat configs require manual migration; scaffolded .eslintrc.json instead',
  });

  for (const skip of skippedConfigs) {
    logger.warn(`Skipped ${skip.name}: ${skip.reason}`);
  }

  logger.success(`Scaffolded ${scaffoldedFiles.length} config files`);
  return { scaffoldedFiles, skippedConfigs };
}
