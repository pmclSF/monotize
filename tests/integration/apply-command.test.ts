import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { createTestDir, createGitRepo, runCLI, treeManifest } from '../helpers/cli-runner.js';
import {
  getLogPath,
  createOperationLog,
  appendLogEntry,
  readOperationLog,
  computePlanHash,
} from '../../src/utils/operation-log.js';
import type { ApplyPlan, OperationLogEntry } from '../../src/types/index.js';

/**
 * Helper to write a plan file and return its path.
 */
async function writePlan(dir: string, plan: ApplyPlan): Promise<string> {
  const planPath = path.join(dir, 'migration.plan.json');
  await fs.writeJson(planPath, plan, { spaces: 2 });
  return planPath;
}

describe('apply command - integration', () => {
  let workDir: string;
  let cleanup: () => Promise<void>;
  let repoAlpha: string;
  let repoBeta: string;

  beforeAll(async () => {
    const tmp = await createTestDir('apply-int');
    workDir = tmp.dir;
    cleanup = tmp.cleanup;

    repoAlpha = await createGitRepo(
      workDir,
      'alpha',
      {
        name: 'alpha',
        version: '1.0.0',
        scripts: { build: 'tsc', test: 'vitest' },
        dependencies: { lodash: '^4.17.21' },
      },
      {
        'src/index.ts': 'export const name = "alpha";\n',
        '.gitignore': 'node_modules/\ndist/\n',
      }
    );

    repoBeta = await createGitRepo(
      workDir,
      'beta',
      {
        name: 'beta',
        version: '2.0.0',
        scripts: { build: 'tsc', test: 'jest' },
        dependencies: { express: '^4.18.0' },
      },
      {
        'src/index.ts': 'export const name = "beta";\n',
      }
    );
  });

  afterAll(async () => {
    await cleanup();
  });

  function makePlan(overrides: Partial<ApplyPlan> = {}): ApplyPlan {
    return {
      version: 1,
      sources: [
        { name: 'alpha', path: repoAlpha },
        { name: 'beta', path: repoBeta },
      ],
      packagesDir: 'packages',
      rootPackageJson: {
        name: 'test-monorepo',
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts: {
          build: 'pnpm -r build',
          test: 'pnpm -r test',
        },
        dependencies: {
          lodash: '^4.17.21',
          express: '^4.18.0',
        },
        engines: { node: '>=18' },
      },
      files: [
        { relativePath: 'pnpm-workspace.yaml', content: "packages:\n  - 'packages/*'\n" },
        { relativePath: '.gitignore', content: 'node_modules/\ndist/\n' },
        { relativePath: 'README.md', content: '# Test Monorepo\n' },
      ],
      install: false,
      ...overrides,
    };
  }

  describe('full apply', () => {
    let outputDir: string;

    beforeAll(async () => {
      // Each apply moves the source repos, so we need fresh copies
      const freshDir = path.join(workDir, 'fresh-full');
      await fs.ensureDir(freshDir);
      const srcAlpha = path.join(freshDir, 'alpha');
      const srcBeta = path.join(freshDir, 'beta');
      await fs.copy(repoAlpha, srcAlpha);
      await fs.copy(repoBeta, srcBeta);

      outputDir = path.join(workDir, 'out-full');
      const plan = makePlan({
        sources: [
          { name: 'alpha', path: srcAlpha },
          { name: 'beta', path: srcBeta },
        ],
      });
      const planPath = await writePlan(freshDir, plan);
      runCLI(['apply', '--plan', planPath, '-o', outputDir]);
    });

    it('should produce the expected output tree', async () => {
      const manifest = await treeManifest(outputDir);
      expect(manifest).toMatchSnapshot();
    });

    it('should produce a valid root package.json', async () => {
      const pkg = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(pkg.name).toBe('test-monorepo');
      expect(pkg.private).toBe(true);
      expect(pkg.dependencies.lodash).toBe('^4.17.21');
    });

    it('should produce pnpm-workspace.yaml', async () => {
      const content = await fs.readFile(
        path.join(outputDir, 'pnpm-workspace.yaml'),
        'utf-8'
      );
      expect(content).toContain("packages/*");
    });

    it('should place packages correctly', async () => {
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'alpha'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'beta'))).toBe(true);
    });

    it('should remove staging directory and log after success', async () => {
      const parent = path.dirname(outputDir);
      const entries = await fs.readdir(parent);
      const stagingDirs = entries.filter((e) => e.includes('.staging-'));
      expect(stagingDirs).toHaveLength(0);
      const logFiles = entries.filter((e) => e.endsWith('.ops.jsonl'));
      expect(logFiles).toHaveLength(0);
    });
  });

  describe('dry-run', () => {
    it('should print steps without creating files', async () => {
      const dryDir = path.join(workDir, 'dry-src');
      await fs.ensureDir(dryDir);
      await fs.copy(repoAlpha, path.join(dryDir, 'alpha'));

      const plan = makePlan({
        sources: [{ name: 'alpha', path: path.join(dryDir, 'alpha') }],
      });
      const planPath = await writePlan(dryDir, plan);
      const outputDir = path.join(workDir, 'out-dry');

      const result = runCLI(['apply', '--plan', planPath, '-o', outputDir, '--dry-run']);
      expect(result.stdout).toContain('Dry Run');
      expect(result.stdout).toContain('scaffold');
      expect(result.stdout).toContain('move-packages');
      expect(fs.existsSync(outputDir)).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove staging artifacts', async () => {
      const outputDir = path.join(workDir, 'out-cleanup');
      const stagingDir = `${outputDir}.staging-abcd1234`;
      const logFile = `${stagingDir}.ops.jsonl`;

      await fs.ensureDir(stagingDir);
      await fs.writeFile(logFile, '{"id":"header"}\n', 'utf-8');

      // Need a dummy plan for --cleanup (commander requires it)
      const dummyPlanDir = path.join(workDir, 'dummy-cleanup');
      await fs.ensureDir(dummyPlanDir);
      await fs.copy(repoAlpha, path.join(dummyPlanDir, 'alpha'));
      const planPath = await writePlan(dummyPlanDir, makePlan({
        sources: [{ name: 'alpha', path: path.join(dummyPlanDir, 'alpha') }],
      }));

      runCLI(['apply', '--plan', planPath, '-o', outputDir, '--cleanup']);

      expect(fs.existsSync(stagingDir)).toBe(false);
      expect(fs.existsSync(logFile)).toBe(false);
    });
  });

  describe('resume after manual partial apply', () => {
    it('should complete from where a previous run left off', async () => {
      const resumeDir = path.join(workDir, 'resume-src');
      await fs.ensureDir(resumeDir);
      const srcAlpha = path.join(resumeDir, 'alpha');
      const srcBeta = path.join(resumeDir, 'beta');
      await fs.copy(repoAlpha, srcAlpha);
      await fs.copy(repoBeta, srcBeta);

      const outputDir = path.join(workDir, 'out-resume');
      const plan = makePlan({
        sources: [
          { name: 'alpha', path: srcAlpha },
          { name: 'beta', path: srcBeta },
        ],
      });
      const planPath = await writePlan(resumeDir, plan);
      const planContent = await fs.readFile(planPath, 'utf-8');
      const planHash = computePlanHash(planContent);

      // Simulate a partial run: create staging dir with scaffold completed
      const stagingDir = `${outputDir}.staging-aabb1122`;
      const logPath = getLogPath(stagingDir);

      await fs.ensureDir(stagingDir);
      await fs.ensureDir(path.join(stagingDir, 'packages'));

      // Move packages manually (simulating step 2 completion)
      await fs.move(srcAlpha, path.join(stagingDir, 'packages', 'alpha'));
      await fs.move(srcBeta, path.join(stagingDir, 'packages', 'beta'));

      // Write partial operation log
      await createOperationLog(logPath, planHash);
      await appendLogEntry(logPath, {
        id: 'scaffold',
        status: 'completed',
        timestamp: new Date().toISOString(),
      });
      await appendLogEntry(logPath, {
        id: 'move-packages',
        status: 'completed',
        timestamp: new Date().toISOString(),
      });

      // Resume — should skip scaffold + move-packages, execute write-root + write-extras
      runCLI(['apply', '--plan', planPath, '-o', outputDir, '--resume', '-v']);

      // Verify output is complete
      expect(await fs.pathExists(path.join(outputDir, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'pnpm-workspace.yaml'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'README.md'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'alpha'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'beta'))).toBe(true);

      // Staging artifacts should be cleaned up
      expect(fs.existsSync(stagingDir)).toBe(false);
      expect(fs.existsSync(logPath)).toBe(false);
    });
  });

  describe('plan hash mismatch on resume', () => {
    it('should error when plan has changed since staging was created', async () => {
      const mismatchDir = path.join(workDir, 'mismatch-src');
      await fs.ensureDir(mismatchDir);
      await fs.copy(repoAlpha, path.join(mismatchDir, 'alpha'));

      const outputDir = path.join(workDir, 'out-mismatch');
      const plan = makePlan({
        sources: [{ name: 'alpha', path: path.join(mismatchDir, 'alpha') }],
      });
      const planPath = await writePlan(mismatchDir, plan);

      // Create staging with a different hash
      const stagingDir = `${outputDir}.staging-ccdd3344`;
      const logPath = getLogPath(stagingDir);
      await fs.ensureDir(stagingDir);
      await createOperationLog(logPath, 'different-hash-value');

      // Resume should fail
      try {
        runCLI(['apply', '--plan', planPath, '-o', outputDir, '--resume']);
        expect.fail('Should have thrown');
      } catch (error) {
        const err = error as { stderr?: string; stdout?: string };
        const output = (err.stderr || '') + (err.stdout || '');
        expect(output).toContain('Plan file has changed');
      }

      // Clean up staging artifacts
      await fs.remove(stagingDir).catch(() => {});
      await fs.remove(logPath).catch(() => {});
    });
  });

  describe('idempotency', () => {
    it('should produce identical output on second run', async () => {
      // First run
      const run1Dir = path.join(workDir, 'idempotent-1');
      await fs.ensureDir(run1Dir);
      await fs.copy(repoAlpha, path.join(run1Dir, 'alpha'));
      const plan1 = makePlan({
        sources: [{ name: 'alpha', path: path.join(run1Dir, 'alpha') }],
      });
      const planPath1 = await writePlan(run1Dir, plan1);
      const out1 = path.join(workDir, 'out-idem-1');
      runCLI(['apply', '--plan', planPath1, '-o', out1]);

      // Second run with fresh source copy
      const run2Dir = path.join(workDir, 'idempotent-2');
      await fs.ensureDir(run2Dir);
      await fs.copy(repoAlpha, path.join(run2Dir, 'alpha'));
      const plan2 = makePlan({
        sources: [{ name: 'alpha', path: path.join(run2Dir, 'alpha') }],
      });
      const planPath2 = await writePlan(run2Dir, plan2);
      const out2 = path.join(workDir, 'out-idem-2');
      runCLI(['apply', '--plan', planPath2, '-o', out2]);

      // Compare trees
      const tree1 = await treeManifest(out1);
      const tree2 = await treeManifest(out2);
      expect(tree1).toEqual(tree2);

      // Compare root package.json
      const pkg1 = await fs.readJson(path.join(out1, 'package.json'));
      const pkg2 = await fs.readJson(path.join(out2, 'package.json'));
      expect(pkg1).toEqual(pkg2);
    });
  });
});
