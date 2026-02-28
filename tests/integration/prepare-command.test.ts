import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { createGitRepo, runCLI, runCLIExpectError } from '../helpers/cli-runner.js';

describe('prepare command', () => {
  let testDir: string;

  beforeEach(async () => {
    const id = crypto.randomBytes(8).toString('hex');
    testDir = path.join(os.tmpdir(), `prepare-test-${id}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  describe('--out-dir mode', () => {
    it('should write patch files and checklist.md', async () => {
      const repo = await createGitRepo(testDir, 'app-a', {
        name: 'app-a',
        version: '1.0.0',
      });
      const outDir = path.join(testDir, 'patches');

      runCLI(['prepare', repo, '--node-version', '20', '--out-dir', outDir]);

      expect(await fs.pathExists(path.join(outDir, 'checklist.md'))).toBe(true);
      // Should have nvmrc patch
      expect(await fs.pathExists(path.join(outDir, 'app-a', 'nvmrc.patch'))).toBe(true);
    });

    it('should not create .monotize directory in out-dir mode', async () => {
      const repo = await createGitRepo(testDir, 'app-a', {
        name: 'app-a',
        version: '1.0.0',
      });
      const outDir = path.join(testDir, 'patches');

      runCLI(['prepare', repo, '--out-dir', outDir]);

      expect(await fs.pathExists(path.join(outDir, '.monotize'))).toBe(false);
    });

    it('should create .nvmrc patches per repo with --node-version', async () => {
      const repo1 = await createGitRepo(testDir, 'app-a', {
        name: 'app-a',
        version: '1.0.0',
      });
      const repo2 = await createGitRepo(testDir, 'app-b', {
        name: 'app-b',
        version: '1.0.0',
      });
      const outDir = path.join(testDir, 'patches');

      runCLI(['prepare', repo1, repo2, '--node-version', '20', '--out-dir', outDir]);

      expect(await fs.pathExists(path.join(outDir, 'app-a', 'nvmrc.patch'))).toBe(true);
      expect(await fs.pathExists(path.join(outDir, 'app-b', 'nvmrc.patch'))).toBe(true);
    });

    it('should create packageManager patches with --package-manager', async () => {
      const repo = await createGitRepo(testDir, 'app-a', {
        name: 'app-a',
        version: '1.0.0',
      });
      const outDir = path.join(testDir, 'patches');

      runCLI(['prepare', repo, '--package-manager', 'pnpm@9.0.0', '--out-dir', outDir]);

      expect(await fs.pathExists(path.join(outDir, 'app-a', 'package-manager.patch'))).toBe(true);
      const patchContent = await fs.readFile(path.join(outDir, 'app-a', 'package-manager.patch'), 'utf-8');
      expect(patchContent).toContain('pnpm@9.0.0');
    });

    it('should not create patch when repo already at target node version', async () => {
      const repo = await createGitRepo(
        testDir,
        'app-a',
        { name: 'app-a', version: '1.0.0' },
        { '.nvmrc': '20' }
      );
      const outDir = path.join(testDir, 'patches');

      runCLI(['prepare', repo, '--node-version', '20', '--out-dir', outDir]);

      expect(await fs.pathExists(path.join(outDir, 'app-a', 'nvmrc.patch'))).toBe(false);
    });

    it('should not create build-script patch when repo has build script', async () => {
      const repo = await createGitRepo(testDir, 'app-a', {
        name: 'app-a',
        version: '1.0.0',
        scripts: { build: 'tsc' },
      });
      const outDir = path.join(testDir, 'patches');

      runCLI(['prepare', repo, '--out-dir', outDir]);

      expect(await fs.pathExists(path.join(outDir, 'app-a', 'build-script.patch'))).toBe(false);
    });

    it('should create build-script patch when repo has no build script', async () => {
      const repo = await createGitRepo(testDir, 'app-a', {
        name: 'app-a',
        version: '1.0.0',
        scripts: { test: 'vitest' },
      });
      const outDir = path.join(testDir, 'patches');

      runCLI(['prepare', repo, '--out-dir', outDir]);

      expect(await fs.pathExists(path.join(outDir, 'app-a', 'build-script.patch'))).toBe(true);
    });
  });

  describe('--prep-workspace mode', () => {
    it('should clone repos, create branch, apply patches, and write config', async () => {
      const repo = await createGitRepo(testDir, 'app-a', {
        name: 'app-a',
        version: '1.0.0',
      });
      const workspace = path.join(testDir, 'workspace');

      runCLI(['prepare', repo, '--node-version', '20', '--prep-workspace', workspace]);

      // Branch exists
      const { execSync } = await import('node:child_process');
      const branch = execSync('git branch --list prepare/monotize', {
        cwd: path.join(workspace, 'app-a'),
        encoding: 'utf-8',
      });
      expect(branch.trim()).toContain('prepare/monotize');

      // .monotize/config.json exists
      const configPath = path.join(workspace, '.monotize', 'config.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const config = await fs.readJson(configPath);
      expect(config.version).toBe(1);
      expect(config.preparedRepos).toContain('app-a');
      expect(config.targetNodeVersion).toBe('20');
      expect(config.branchName).toBe('prepare/monotize');

      // .monotize/checklist.md exists
      expect(await fs.pathExists(path.join(workspace, '.monotize', 'checklist.md'))).toBe(true);
    });
  });

  describe('error cases', () => {
    it('should error when --patch-only and --prep-workspace are both set', () => {
      const repo = path.join(testDir, 'nonexistent');
      const result = runCLIExpectError([
        'prepare', repo,
        '--patch-only',
        '--prep-workspace', path.join(testDir, 'ws'),
      ]);
      expect(result.exitCode).not.toBe(0);
    });

    it('should error with invalid repo path', () => {
      const result = runCLIExpectError([
        'prepare',
        path.join(testDir, 'does-not-exist'),
        '--out-dir', path.join(testDir, 'out'),
      ]);
      expect(result.exitCode).not.toBe(0);
    });
  });
});
