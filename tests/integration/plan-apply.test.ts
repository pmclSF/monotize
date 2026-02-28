import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { createGitRepo, runCLI, treeManifest } from '../helpers/cli-runner.js';
import { validatePlan } from '../../src/commands/apply.js';

describe('plan → apply roundtrip', () => {
  let testDir: string;

  beforeEach(async () => {
    const id = crypto.randomBytes(8).toString('hex');
    testDir = path.join(os.tmpdir(), `plan-apply-${id}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  it('should generate a valid plan JSON from two repos', async () => {
    const repo1 = await createGitRepo(testDir, 'app-a', {
      name: 'app-a',
      version: '1.0.0',
      dependencies: { lodash: '^4.17.21' },
      scripts: { build: 'tsc', test: 'vitest' },
    }, {
      'src/index.ts': 'export const a = 1;\n',
      '.gitignore': 'node_modules/\n',
    });

    const repo2 = await createGitRepo(testDir, 'app-b', {
      name: 'app-b',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
      scripts: { build: 'tsc', test: 'jest' },
    }, {
      'src/index.ts': 'export const b = 2;\n',
      '.gitignore': 'node_modules/\ndist/\n',
    });

    const planFile = path.join(testDir, 'test.plan.json');
    const outDir = path.join(testDir, 'output');

    runCLI([
      'plan',
      repo1, repo2,
      '-o', outDir,
      '--plan-file', planFile,
      '-y',
      '--no-install',
      '--conflict-strategy', 'highest',
    ]);

    // Plan file should exist and be valid JSON
    expect(await fs.pathExists(planFile)).toBe(true);
    const plan = await fs.readJson(planFile);
    expect(validatePlan(plan)).toBe(true);

    // Check plan structure
    expect(plan.version).toBe(1);
    expect(plan.sources).toHaveLength(2);
    expect(plan.sources.map((s: { name: string }) => s.name).sort()).toEqual(['app-a', 'app-b']);
    expect(plan.packagesDir).toBe('packages');
    expect(plan.install).toBe(false);
    expect(plan.rootPackageJson.private).toBe(true);
    expect(Array.isArray(plan.files)).toBe(true);

    // Check analysisFindings is present
    expect(plan.analysisFindings).toBeDefined();
    expect(plan.analysisFindings.declaredConflicts).toBeDefined();
    expect(plan.analysisFindings.resolvedConflicts).toBeDefined();
    expect(plan.analysisFindings.peerConflicts).toBeDefined();
    expect(plan.analysisFindings.decisions).toBeDefined();
  });

  it('should include expected files in plan', async () => {
    const repo1 = await createGitRepo(testDir, 'lib-x', {
      name: 'lib-x',
      version: '1.0.0',
      scripts: { build: 'tsc' },
    }, {
      'src/index.ts': 'export const x = 1;\n',
    });

    const planFile = path.join(testDir, 'test.plan.json');
    const outDir = path.join(testDir, 'output');

    runCLI([
      'plan',
      repo1,
      '-o', outDir,
      '--plan-file', planFile,
      '-y',
      '--no-install',
    ]);

    const plan = await fs.readJson(planFile);
    const filePaths = plan.files.map((f: { relativePath: string }) => f.relativePath);

    // Should include standard generated files
    expect(filePaths).toContain('pnpm-workspace.yaml');
    expect(filePaths).toContain('.gitignore');
    expect(filePaths).toContain('README.md');
  });

  it('should include turbo.json when workspace tool is specified', async () => {
    const repo1 = await createGitRepo(testDir, 'svc', {
      name: 'svc',
      version: '1.0.0',
      scripts: { build: 'tsc', test: 'vitest' },
    }, {
      'src/index.ts': 'export const svc = 1;\n',
    });

    const planFile = path.join(testDir, 'test.plan.json');
    const outDir = path.join(testDir, 'output');

    runCLI([
      'plan',
      repo1,
      '-o', outDir,
      '--plan-file', planFile,
      '-y',
      '--no-install',
      '--workspace-tool', 'turbo',
    ]);

    const plan = await fs.readJson(planFile);
    const filePaths = plan.files.map((f: { relativePath: string }) => f.relativePath);
    expect(filePaths).toContain('turbo.json');
  });

  it('should have valid source paths that exist on disk', async () => {
    const repo1 = await createGitRepo(testDir, 'pkg-one', {
      name: 'pkg-one',
      version: '1.0.0',
    });

    const planFile = path.join(testDir, 'test.plan.json');
    const outDir = path.join(testDir, 'output');

    runCLI([
      'plan',
      repo1,
      '-o', outDir,
      '--plan-file', planFile,
      '-y',
      '--no-install',
    ]);

    const plan = await fs.readJson(planFile);
    for (const source of plan.sources) {
      expect(await fs.pathExists(source.path)).toBe(true);
    }
  });

  it('should set install: false with --no-install', async () => {
    const repo1 = await createGitRepo(testDir, 'my-lib', {
      name: 'my-lib',
      version: '1.0.0',
    });

    const planFile = path.join(testDir, 'test.plan.json');
    const outDir = path.join(testDir, 'output');

    runCLI([
      'plan',
      repo1,
      '-o', outDir,
      '--plan-file', planFile,
      '-y',
      '--no-install',
    ]);

    const plan = await fs.readJson(planFile);
    expect(plan.install).toBe(false);
  });

  it('plan + apply roundtrip should produce a valid monorepo', async () => {
    const repo1 = await createGitRepo(testDir, 'svc-a', {
      name: 'svc-a',
      version: '1.0.0',
      dependencies: { lodash: '^4.17.21' },
      scripts: { build: 'tsc' },
    }, {
      'src/index.ts': 'export const a = 1;\n',
    });

    const repo2 = await createGitRepo(testDir, 'svc-b', {
      name: 'svc-b',
      version: '2.0.0',
      dependencies: { express: '^4.18.0' },
      scripts: { test: 'vitest' },
    }, {
      'src/index.ts': 'export const b = 2;\n',
    });

    const planFile = path.join(testDir, 'roundtrip.plan.json');
    const outDir = path.join(testDir, 'mono-out');

    // Phase 1: plan
    runCLI([
      'plan',
      repo1, repo2,
      '-o', outDir,
      '--plan-file', planFile,
      '-y',
      '--no-install',
      '--conflict-strategy', 'highest',
    ]);

    expect(await fs.pathExists(planFile)).toBe(true);

    // Phase 2: apply
    runCLI([
      'apply',
      '--plan', planFile,
      '--out', outDir,
      '--dry-run',
    ]);

    // Actually apply (non-dry-run)
    runCLI([
      'apply',
      '--plan', planFile,
      '--out', outDir,
    ]);

    // Verify output directory structure
    expect(await fs.pathExists(outDir)).toBe(true);
    expect(await fs.pathExists(path.join(outDir, 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(outDir, 'packages', 'svc-a'))).toBe(true);
    expect(await fs.pathExists(path.join(outDir, 'packages', 'svc-b'))).toBe(true);

    // Verify root package.json
    const rootPkg = await fs.readJson(path.join(outDir, 'package.json'));
    expect(rootPkg.private).toBe(true);

    // Verify package files were moved
    const tree = await treeManifest(outDir);
    expect(tree).toContain('packages/');
    expect(tree).toContain('packages/svc-a/');
    expect(tree).toContain('packages/svc-b/');
    expect(tree).toContain('package.json');
    expect(tree).toContain('README.md');
  });
});
