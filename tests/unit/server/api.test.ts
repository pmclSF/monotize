import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { runAnalyze, runPlan, runVerify } from '../../../src/server/api.js';
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
});
