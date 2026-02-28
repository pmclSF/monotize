import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import {
  createTestDir,
  createGitRepo,
  runCLI,
  runCLIExpectError,
} from '../helpers/cli-runner.js';
import type { VerifyResult } from '../../src/types/index.js';

const CLI_PATH = path.join(__dirname, '../../bin/monorepo.js');

/** Run CLI and return stdout regardless of exit code. Quotes each arg. */
function runCLIAnyExit(args: string[], cwd?: string): { stdout: string; exitCode: number } {
  const quotedArgs = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
  try {
    const stdout = execSync(`node "${CLI_PATH}" ${quotedArgs}`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { stdout, exitCode: 0 };
  } catch (error) {
    const e = error as { status?: number; stdout?: string };
    return { stdout: e.stdout || '', exitCode: e.status || 1 };
  }
}

const FLAKY_TEST_RETRIES = 2;

describe('verify command integration', () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const created = await createTestDir('verify-int');
    tempDir = created.dir;
    cleanup = created.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  // -----------------------------------------------------------------------
  // Static tier on plan file
  // -----------------------------------------------------------------------
  describe('static tier on plan file', () => {
    it('should pass verification on a valid plan', { retry: FLAKY_TEST_RETRIES }, async () => {
      const repoA = await createGitRepo(tempDir, 'repo-a', {
        name: 'pkg-a',
        version: '1.0.0',
        scripts: { build: 'echo build' },
      });
      const repoB = await createGitRepo(tempDir, 'repo-b', {
        name: 'pkg-b',
        version: '1.0.0',
        scripts: { test: 'echo test' },
      });

      const planFile = path.join(tempDir, 'plan.json');
      runCLI([
        'plan',
        repoA,
        repoB,
        '--plan-file',
        planFile,
        '-y',
        '--no-install',
      ]);

      const { stdout } = runCLI([
        'verify',
        '--plan',
        planFile,
        '--json',
      ]);
      const result: VerifyResult = JSON.parse(stdout);
      expect(result.ok).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.summary.fail).toBe(0);
      expect(result.inputType).toBe('plan');
      expect(result.tier).toBe('static');
    });

    it('should fail verification on a bad plan (missing private)', { retry: FLAKY_TEST_RETRIES }, async () => {
      // Create a plan, then manually remove private: true
      const repoA = await createGitRepo(tempDir, 'repo-a', {
        name: 'pkg-a',
        version: '1.0.0',
      });

      const planFile = path.join(tempDir, 'plan.json');
      runCLI([
        'plan',
        repoA,
        '--plan-file',
        planFile,
        '-y',
        '--no-install',
      ]);

      // Tamper with the plan: remove private field
      const plan = await fs.readJson(planFile);
      delete plan.rootPackageJson.private;
      await fs.writeJson(planFile, plan, { spaces: 2 });

      const { stdout, exitCode } = runCLIExpectError([
        'verify',
        '--plan',
        planFile,
        '--json',
      ]);
      const result: VerifyResult = JSON.parse(stdout);
      expect(result.ok).toBe(false);
      expect(exitCode).not.toBe(0);
      const privateFail = result.checks.find((c) => c.id === 'root-private');
      expect(privateFail?.status).toBe('fail');
    });
  });

  // -----------------------------------------------------------------------
  // Static tier on directory (fixture)
  // -----------------------------------------------------------------------
  describe('static tier on directory', () => {
    it('should verify repo-nested-workspace fixture', { retry: FLAKY_TEST_RETRIES }, async () => {
      const fixtureDir = path.join(__dirname, '../fixtures/repo-nested-workspace');
      const { stdout } = runCLIAnyExit(['verify', '--dir', fixtureDir, '--json']);

      const result: VerifyResult = JSON.parse(stdout);
      expect(result.inputType).toBe('dir');
      expect(result.checks.length).toBeGreaterThan(0);
      // Snapshot the check ids/statuses (excludes timestamps/paths)
      expect(
        result.checks.map((c) => ({ id: c.id, status: c.status, tier: c.tier }))
      ).toMatchSnapshot();
    });
  });

  // -----------------------------------------------------------------------
  // Static tier on plan→apply roundtrip
  // -----------------------------------------------------------------------
  describe('plan → apply → verify roundtrip', () => {
    it('should pass on applied monorepo', { retry: FLAKY_TEST_RETRIES }, async () => {
      const repoA = await createGitRepo(tempDir, 'repo-a', {
        name: 'pkg-a',
        version: '1.0.0',
        scripts: { build: 'echo build' },
      });
      const repoB = await createGitRepo(tempDir, 'repo-b', {
        name: 'pkg-b',
        version: '1.0.0',
        scripts: { test: 'echo test' },
      });

      const planFile = path.join(tempDir, 'plan.json');
      const outputDir = path.join(tempDir, 'monorepo');

      runCLI([
        'plan',
        repoA,
        repoB,
        '--plan-file',
        planFile,
        '-y',
        '--no-install',
      ]);

      runCLI([
        'apply',
        '--plan',
        planFile,
        '-o',
        outputDir,
      ]);

      const { stdout } = runCLI([
        'verify',
        '--dir',
        outputDir,
        '--json',
      ]);
      const result: VerifyResult = JSON.parse(stdout);
      expect(result.ok).toBe(true);
      expect(result.inputType).toBe('dir');
    });
  });

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------
  describe('error cases', () => {
    it('should error when both --plan and --dir are given', () => {
      const { exitCode } = runCLIExpectError([
        'verify',
        '--plan',
        'some-plan.json',
        '--dir',
        'some-dir',
      ]);
      expect(exitCode).not.toBe(0);
    });

    it('should error when neither --plan nor --dir are given', () => {
      const { exitCode } = runCLIExpectError(['verify']);
      expect(exitCode).not.toBe(0);
    });

    it('should error when plan file does not exist', () => {
      const { exitCode } = runCLIExpectError([
        'verify',
        '--plan',
        '/tmp/nonexistent-plan-file-xyz.json',
      ]);
      expect(exitCode).not.toBe(0);
    });
  });
});
