import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import crypto from 'node:crypto';
import { runAnalyze, runPlan, runVerify, runApply } from '../../../src/server/api.js';
import type { Logger } from '../../../src/types/index.js';

const fixturesDir = path.resolve(__dirname, '../../fixtures');

function createTestLogger(): Logger & { messages: Array<{ level: string; message: string }> } {
  const messages: Array<{ level: string; message: string }> = [];
  return {
    messages,
    info: (message: string) => messages.push({ level: 'info', message }),
    success: (message: string) => messages.push({ level: 'success', message }),
    warn: (message: string) => messages.push({ level: 'warn', message }),
    error: (message: string) => messages.push({ level: 'error', message }),
    debug: (message: string) => messages.push({ level: 'debug', message }),
    log: (message: string) => messages.push({ level: 'log', message }),
  };
}

// Cleanup plan files created during tests
const createdFiles: string[] = [];
afterEach(async () => {
  for (const f of createdFiles) {
    try {
      await fs.remove(f);
      // Also try the .sources directory
      await fs.remove(`${f}.sources`);
    } catch {
      // ignore
    }
  }
  createdFiles.length = 0;
});

describe('runAnalyze', () => {
  it('returns AnalyzeResult with expected fields for valid repos', async () => {
    const logger = createTestLogger();
    const repoA = path.join(fixturesDir, 'repo-a');
    const repoB = path.join(fixturesDir, 'repo-b');

    const result = await runAnalyze([repoA, repoB], logger);

    expect(result).toHaveProperty('packages');
    expect(result).toHaveProperty('conflicts');
    expect(result).toHaveProperty('collisions');
    expect(result).toHaveProperty('crossDependencies');
    expect(result).toHaveProperty('complexityScore');
    expect(result).toHaveProperty('recommendations');
    expect(result.packages.length).toBeGreaterThanOrEqual(2);
    expect(typeof result.complexityScore).toBe('number');
    expect(Array.isArray(result.recommendations)).toBe(true);
  }, 30000);

  it('throws for invalid repos instead of calling process.exit', async () => {
    const logger = createTestLogger();
    await expect(runAnalyze(['/nonexistent/path'], logger)).rejects.toThrow();
  });
});

describe('runPlan', () => {
  it('returns plan with correct structure for valid repos', async () => {
    const logger = createTestLogger();
    const repoA = path.join(fixturesDir, 'repo-a');
    const repoB = path.join(fixturesDir, 'repo-b');

    const result = await runPlan([repoA, repoB], {}, logger);
    createdFiles.push(result.planPath);

    expect(result).toHaveProperty('planPath');
    expect(result).toHaveProperty('plan');
    expect(result.plan.version).toBe(1);
    expect(result.plan.sources.length).toBe(2);
    expect(typeof result.plan.packagesDir).toBe('string');
    expect(typeof result.plan.rootPackageJson).toBe('object');
    expect(Array.isArray(result.plan.files)).toBe(true);
    expect(typeof result.plan.install).toBe('boolean');
  }, 30000);
});

describe('runPlan - workspace tool', () => {
  it('generates plan with turbo workspace tool', async () => {
    const logger = createTestLogger();
    const repoA = path.join(fixturesDir, 'repo-a');
    const repoB = path.join(fixturesDir, 'repo-b');

    const result = await runPlan(
      [repoA, repoB],
      { workspaceTool: 'turbo' },
      logger,
    );
    createdFiles.push(result.planPath);

    expect(result.plan.rootPackageJson.devDependencies).toBeDefined();
    const devDeps = result.plan.rootPackageJson.devDependencies as Record<string, string>;
    expect(devDeps.turbo).toBeDefined();

    // Should have turbo.json file in plan
    const turboFile = result.plan.files.find((f) => f.relativePath === 'turbo.json');
    expect(turboFile).toBeDefined();
  }, 30000);

  it('generates plan with workflow skip strategy', async () => {
    const logger = createTestLogger();
    const repoA = path.join(fixturesDir, 'repo-a');

    const result = await runPlan(
      [repoA],
      { workflowStrategy: 'skip' },
      logger,
    );
    createdFiles.push(result.planPath);

    // With skip, no workflow files should be generated
    const workflowFiles = result.plan.files.filter((f) =>
      f.relativePath.includes('.github/workflows'),
    );
    expect(workflowFiles).toHaveLength(0);
  }, 30000);
});

describe('runVerify', () => {
  it('returns VerifyResult for plan file', async () => {
    const logger = createTestLogger();
    const repoA = path.join(fixturesDir, 'repo-a');
    const repoB = path.join(fixturesDir, 'repo-b');

    // Generate a plan first
    const { planPath } = await runPlan([repoA, repoB], {}, logger);
    createdFiles.push(planPath);

    const result = await runVerify({ plan: planPath }, logger);

    expect(result).toHaveProperty('tier', 'static');
    expect(result).toHaveProperty('inputType', 'plan');
    expect(result).toHaveProperty('checks');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('ok');
    expect(typeof result.ok).toBe('boolean');
    expect(result.summary).toHaveProperty('total');
    expect(result.summary).toHaveProperty('pass');
    expect(result.summary).toHaveProperty('fail');
  }, 30000);

  it('throws when neither plan nor dir specified', async () => {
    const logger = createTestLogger();
    await expect(runVerify({}, logger)).rejects.toThrow('Specify either plan or dir');
  });

  it('throws when both plan and dir specified', async () => {
    const logger = createTestLogger();
    await expect(runVerify({ plan: 'a', dir: 'b' }, logger)).rejects.toThrow(
      'Specify either plan or dir, not both',
    );
  });

  it('throws for non-existent plan file', async () => {
    const logger = createTestLogger();
    await expect(
      runVerify({ plan: '/nonexistent/plan.json' }, logger),
    ).rejects.toThrow('Plan file not found');
  });

  it('throws for invalid plan file content', async () => {
    const tempDir = path.join(os.tmpdir(), `verify-api-${crypto.randomBytes(4).toString('hex')}`);
    await fs.ensureDir(tempDir);
    const planPath = path.join(tempDir, 'bad-plan.json');
    await fs.writeJson(planPath, { not: 'a valid plan' });

    const logger = createTestLogger();
    try {
      await expect(
        runVerify({ plan: planPath }, logger),
      ).rejects.toThrow('Invalid plan file');
    } finally {
      await fs.remove(tempDir);
    }
  });

  it('throws for non-existent dir', async () => {
    const logger = createTestLogger();
    await expect(
      runVerify({ dir: '/nonexistent/monorepo' }, logger),
    ).rejects.toThrow('Directory not found');
  });

  it('throws for dir without package.json', async () => {
    const tempDir = path.join(os.tmpdir(), `verify-api-${crypto.randomBytes(4).toString('hex')}`);
    await fs.ensureDir(tempDir);

    const logger = createTestLogger();
    try {
      await expect(
        runVerify({ dir: tempDir }, logger),
      ).rejects.toThrow('No package.json found');
    } finally {
      await fs.remove(tempDir);
    }
  });

  it('runs static tier on a valid directory', async () => {
    const tempDir = path.join(os.tmpdir(), `verify-api-${crypto.randomBytes(4).toString('hex')}`);
    await fs.ensureDir(tempDir);
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'test-monorepo',
      version: '1.0.0',
      workspaces: ['packages/*'],
    });

    const logger = createTestLogger();
    try {
      const result = await runVerify({ dir: tempDir, tier: 'static' }, logger);
      expect(result.tier).toBe('static');
      expect(result.inputType).toBe('dir');
      expect(result.checks.length).toBeGreaterThan(0);
    } finally {
      await fs.remove(tempDir);
    }
  });

  it('runs install tier on a valid directory', async () => {
    const tempDir = path.join(os.tmpdir(), `verify-api-${crypto.randomBytes(4).toString('hex')}`);
    await fs.ensureDir(tempDir);
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'test-monorepo',
      version: '1.0.0',
      workspaces: ['packages/*'],
    });

    const logger = createTestLogger();
    try {
      const result = await runVerify({ dir: tempDir, tier: 'install' }, logger);
      expect(result.tier).toBe('install');
      // Install tier includes static + install checks
      expect(result.checks.length).toBeGreaterThan(0);
    } finally {
      await fs.remove(tempDir);
    }
  }, 30000);

  it('runs full tier on a valid directory', async () => {
    const tempDir = path.join(os.tmpdir(), `verify-api-${crypto.randomBytes(4).toString('hex')}`);
    await fs.ensureDir(tempDir);
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'test-monorepo',
      version: '1.0.0',
      workspaces: ['packages/*'],
    });

    const logger = createTestLogger();
    try {
      const result = await runVerify({ dir: tempDir, tier: 'full' }, logger);
      expect(result.tier).toBe('full');
      // Full tier includes static + install + full checks
      expect(result.checks.length).toBeGreaterThan(0);
    } finally {
      await fs.remove(tempDir);
    }
  }, 30000);
});

describe('runApply', () => {
  it('throws for non-existent plan file', async () => {
    const logger = createTestLogger();
    await expect(
      runApply({ plan: '/nonexistent/plan.json' }, logger),
    ).rejects.toThrow('Plan file not found');
  });

  it('throws for invalid JSON plan file', async () => {
    const tempDir = path.join(os.tmpdir(), `apply-api-${crypto.randomBytes(4).toString('hex')}`);
    await fs.ensureDir(tempDir);
    const planPath = path.join(tempDir, 'bad.plan.json');
    await fs.writeFile(planPath, 'not json at all{{{');

    const logger = createTestLogger();
    try {
      await expect(
        runApply({ plan: planPath }, logger),
      ).rejects.toThrow('Plan file contains invalid JSON');
    } finally {
      await fs.remove(tempDir);
    }
  });

  it('throws for structurally invalid plan', async () => {
    const tempDir = path.join(os.tmpdir(), `apply-api-${crypto.randomBytes(4).toString('hex')}`);
    await fs.ensureDir(tempDir);
    const planPath = path.join(tempDir, 'invalid.plan.json');
    await fs.writeJson(planPath, { version: 1, sources: 'not an array' });

    const logger = createTestLogger();
    try {
      await expect(
        runApply({ plan: planPath }, logger),
      ).rejects.toThrow('Plan file is invalid');
    } finally {
      await fs.remove(tempDir);
    }
  });

  it('throws when source path does not exist', async () => {
    const tempDir = path.join(os.tmpdir(), `apply-api-${crypto.randomBytes(4).toString('hex')}`);
    await fs.ensureDir(tempDir);
    const planPath = path.join(tempDir, 'test.plan.json');
    await fs.writeJson(planPath, {
      version: 1,
      sources: [{ name: 'missing-pkg', path: '/nonexistent/source/path' }],
      packagesDir: 'packages',
      rootPackageJson: { name: 'test', version: '1.0.0' },
      files: [],
      install: false,
      installCommand: 'pnpm install',
    });

    const logger = createTestLogger();
    try {
      await expect(
        runApply({ plan: planPath, out: path.join(tempDir, 'output') }, logger),
      ).rejects.toThrow('Source path not found');
    } finally {
      // Cleanup staging dirs too
      const dirContents = await fs.readdir(tempDir);
      for (const item of dirContents) {
        await fs.remove(path.join(tempDir, item)).catch(() => {});
      }
    }
  });
});
