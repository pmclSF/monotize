import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { createGitRepo, runCLI } from '../helpers/cli-runner.js';

describe('prepare -> plan -> apply integration', () => {
  let testDir: string;

  beforeEach(async () => {
    const id = crypto.randomBytes(8).toString('hex');
    testDir = path.join(os.tmpdir(), `prepare-plan-apply-${id}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  it('produces a valid monorepo from prepared repos', async () => {
    const repoA = await createGitRepo(testDir, 'repo-a', {
      name: 'repo-a',
      version: '1.0.0',
      scripts: { test: 'vitest' },
      dependencies: { lodash: '^4.17.21' },
    }, {
      'src/index.ts': 'export const a = 1;\n',
    });

    const repoB = await createGitRepo(testDir, 'repo-b', {
      name: 'repo-b',
      version: '1.0.0',
      scripts: { lint: 'echo lint' },
      dependencies: { express: '^4.18.0' },
    }, {
      'src/index.ts': 'export const b = 2;\n',
    });

    const workspace = path.join(testDir, 'prep-workspace');
    const outDir = path.join(testDir, 'monorepo-out');
    const planFile = path.join(testDir, 'monorepo.plan.json');

    // 1) Prepare source repos in a workspace copy.
    runCLI([
      'prepare',
      repoA,
      repoB,
      '--node-version',
      '20',
      '--prep-workspace',
      workspace,
    ]);

    const preparedRepoA = path.join(workspace, 'repo-a');
    const preparedRepoB = path.join(workspace, 'repo-b');

    expect(await fs.pathExists(path.join(preparedRepoA, '.nvmrc'))).toBe(true);
    expect(await fs.pathExists(path.join(preparedRepoB, '.nvmrc'))).toBe(true);

    // 2) Plan from prepared repos.
    runCLI([
      'plan',
      preparedRepoA,
      preparedRepoB,
      '-o',
      outDir,
      '--plan-file',
      planFile,
      '--no-install',
      '-y',
    ]);

    expect(await fs.pathExists(planFile)).toBe(true);

    // 3) Apply plan.
    runCLI([
      'apply',
      '--plan',
      planFile,
      '--out',
      outDir,
    ]);

    // 4) Validate resulting monorepo structure.
    expect(await fs.pathExists(path.join(outDir, 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(outDir, 'packages', 'repo-a', 'src', 'index.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(outDir, 'packages', 'repo-b', 'src', 'index.ts'))).toBe(true);

    const rootPkg = await fs.readJson(path.join(outDir, 'package.json'));
    expect(rootPkg.private).toBe(true);
    expect(rootPkg.dependencies?.lodash).toBeDefined();
    expect(rootPkg.dependencies?.express).toBeDefined();
  });
});
