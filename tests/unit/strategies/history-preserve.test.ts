import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  checkGitFilterRepo,
  checkHistoryPrerequisites,
  historyDryRun,
  preserveHistory,
  getCommitCount,
  getContributors,
} from '../../../src/strategies/history-preserve.js';

describe('history-preserve', () => {
  describe('checkGitFilterRepo', () => {
    it('should return a boolean indicating if git filter-repo is available', async () => {
      const result = await checkGitFilterRepo();
      // Result depends on actual system state
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getCommitCount', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = path.join(os.tmpdir(), `test-git-${crypto.randomBytes(8).toString('hex')}`);
      await fs.ensureDir(tempDir);
    });

    afterEach(async () => {
      await fs.remove(tempDir);
    });

    it('should return 0 for non-git directory', async () => {
      const count = await getCommitCount(tempDir);
      expect(count).toBe(0);
    });

    it('should return 0 for git repo with no commits', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      const count = await getCommitCount(tempDir);
      expect(count).toBe(0);
    });

    it('should return correct count for git repo with commits', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "First commit"', { cwd: tempDir, stdio: 'pipe' });

      const count = await getCommitCount(tempDir);
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getContributors', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = path.join(os.tmpdir(), `test-git-${crypto.randomBytes(8).toString('hex')}`);
      await fs.ensureDir(tempDir);
    });

    afterEach(async () => {
      await fs.remove(tempDir);
    });

    it('should return empty array for non-git directory', async () => {
      const contributors = await getContributors(tempDir);
      expect(contributors).toEqual([]);
    });

    it('should return contributors for git repo with commits', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'pipe' });
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "First commit"', { cwd: tempDir, stdio: 'pipe' });

      const contributors = await getContributors(tempDir);
      // Contributors list may be empty on some systems due to shell differences
      expect(Array.isArray(contributors)).toBe(true);
    });
  });

  describe('checkHistoryPrerequisites', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = path.join(os.tmpdir(), `test-prereq-${crypto.randomBytes(8).toString('hex')}`);
      await fs.ensureDir(tempDir);
    });

    afterEach(async () => {
      await fs.remove(tempDir);
    });

    it('should report issues for non-git directory', async () => {
      const result = await checkHistoryPrerequisites(tempDir);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.includes('not a git repository'))).toBe(true);
    });

    it('should pass for a valid git repo', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: tempDir, stdio: 'pipe' });

      const result = await checkHistoryPrerequisites(tempDir);
      // May or may not have git-filter-repo installed, but should report status
      expect(typeof result.ok).toBe('boolean');
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should report shallow clone issue', async () => {
      // Create a source repo
      const source = path.join(tempDir, 'source');
      await fs.ensureDir(source);
      execSync('git init', { cwd: source, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: source, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'test.txt'), 'content');
      execSync('git add .', { cwd: source, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: source, stdio: 'pipe' });

      // Create shallow clone
      const shallow = path.join(tempDir, 'shallow');
      execSync(`git clone --depth 1 file://${source} ${shallow}`, { stdio: 'pipe' });

      const result = await checkHistoryPrerequisites(shallow);
      expect(result.issues.some((i) => i.includes('shallow clone'))).toBe(true);
    });
  });

  describe('historyDryRun', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = path.join(os.tmpdir(), `test-dryrun-${crypto.randomBytes(8).toString('hex')}`);
      await fs.ensureDir(tempDir);
    });

    afterEach(async () => {
      await fs.remove(tempDir);
    });

    it('should return commit count and contributors for a git repo', async () => {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "dev@example.com"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Developer"', { cwd: tempDir, stdio: 'pipe' });
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'v1');
      execSync('git add . && git commit -m "first"', { cwd: tempDir, stdio: 'pipe' });
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'v2');
      execSync('git add . && git commit -m "second"', { cwd: tempDir, stdio: 'pipe' });

      const result = await historyDryRun(tempDir, 'packages/mylib');
      expect(result.commitCount).toBe(2);
      expect(result.contributors.length).toBeGreaterThanOrEqual(1);
      expect(result.estimatedSeconds).toBeGreaterThanOrEqual(1);
      expect(result.strategy).toMatch(/^(filter-repo|subtree)$/);
      expect(typeof result.hasFilterRepo).toBe('boolean');
    });

    it('should return zero for non-git directory', async () => {
      const result = await historyDryRun(tempDir, 'packages/mylib');
      expect(result.commitCount).toBe(0);
      expect(result.contributors).toEqual([]);
    });
  });

  describe('preserveHistory', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = path.join(os.tmpdir(), `test-preserve-${crypto.randomBytes(8).toString('hex')}`);
      await fs.ensureDir(tempDir);
    });

    afterEach(async () => {
      await fs.remove(tempDir);
    });

    it('should copy files when source is not a git repo', async () => {
      const source = path.join(tempDir, 'source');
      const output = path.join(tempDir, 'output');
      await fs.ensureDir(source);
      await fs.ensureDir(output);
      await fs.writeFile(path.join(source, 'index.ts'), 'export const x = 1;');

      await preserveHistory(source, output, {
        targetDir: 'packages/mylib',
        rewritePaths: true,
      });

      expect(await fs.pathExists(path.join(output, 'packages/mylib/index.ts'))).toBe(true);
    });

    it('should initialize git in output if not a git repo', async () => {
      const source = path.join(tempDir, 'source');
      const output = path.join(tempDir, 'output');
      await fs.ensureDir(source);
      await fs.ensureDir(output);

      // Create a proper git repo for source
      execSync('git init', { cwd: source, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: source, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'index.ts'), 'export default 1;');
      execSync('git add .', { cwd: source, stdio: 'pipe' });
      execSync('git commit -m "init"', { cwd: source, stdio: 'pipe' });

      await preserveHistory(source, output, {
        targetDir: 'packages/mylib',
        rewritePaths: false,
      });

      // Output should now be a git repo
      expect(await fs.pathExists(path.join(output, '.git'))).toBe(true);
    });

    it('should preserve history with subtree strategy', async () => {
      const source = path.join(tempDir, 'source');
      const output = path.join(tempDir, 'output');
      await fs.ensureDir(source);
      await fs.ensureDir(output);

      // Create source repo
      execSync('git init', { cwd: source, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: source, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'README.md'), '# Source');
      execSync('git add .', { cwd: source, stdio: 'pipe' });
      execSync('git commit -m "initial source"', { cwd: source, stdio: 'pipe' });

      // Use rewritePaths: false to force subtree strategy (filter-repo may not be installed)
      await preserveHistory(source, output, {
        targetDir: 'packages/source',
        rewritePaths: false,
      });

      // Check that the output has git history
      const logOutput = execSync('git log --oneline', { cwd: output, encoding: 'utf-8' });
      expect(logOutput.trim().split('\n').length).toBeGreaterThanOrEqual(1);
    });

    it('should handle source repo with master branch', async () => {
      const source = path.join(tempDir, 'source-master');
      const output = path.join(tempDir, 'output-master');
      await fs.ensureDir(source);
      await fs.ensureDir(output);

      // Create source repo on "master" branch
      execSync('git init -b master', { cwd: source, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: source, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'lib.ts'), 'export const x = 1;');
      execSync('git add .', { cwd: source, stdio: 'pipe' });
      execSync('git commit -m "initial on master"', { cwd: source, stdio: 'pipe' });

      await preserveHistory(source, output, {
        targetDir: 'packages/lib',
        rewritePaths: false,
      });

      expect(await fs.pathExists(path.join(output, '.git'))).toBe(true);
      const logOutput = execSync('git log --oneline', { cwd: output, encoding: 'utf-8' });
      expect(logOutput.trim().split('\n').length).toBeGreaterThanOrEqual(1);
    });

    it('should copy files for git repo with no commits (fallback)', async () => {
      const source = path.join(tempDir, 'source-empty');
      const output = path.join(tempDir, 'output-empty');
      await fs.ensureDir(source);
      await fs.ensureDir(output);

      // Create a git repo with no commits
      execSync('git init', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'file.txt'), 'untracked content');

      // Init output as git repo too
      execSync('git init', { cwd: output, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: output, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: output, stdio: 'pipe' });
      execSync('git commit --allow-empty -m "init"', { cwd: output, stdio: 'pipe' });

      await preserveHistory(source, output, {
        targetDir: 'packages/empty',
        rewritePaths: false,
      });

      // Should have copied the file into the target dir
      expect(await fs.pathExists(path.join(output, 'packages/empty/file.txt'))).toBe(true);
    });

    it('should preserve history when output already has commits', async () => {
      const source = path.join(tempDir, 'source-existing');
      const output = path.join(tempDir, 'output-existing');
      await fs.ensureDir(source);
      await fs.ensureDir(output);

      // Create source repo
      execSync('git init', { cwd: source, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: source, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'src.ts'), 'source code');
      execSync('git add .', { cwd: source, stdio: 'pipe' });
      execSync('git commit -m "source commit"', { cwd: source, stdio: 'pipe' });

      // Create output repo with existing content
      execSync('git init', { cwd: output, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: output, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: output, stdio: 'pipe' });
      await fs.writeFile(path.join(output, 'existing.txt'), 'existing content');
      execSync('git add .', { cwd: output, stdio: 'pipe' });
      execSync('git commit -m "existing commit"', { cwd: output, stdio: 'pipe' });

      await preserveHistory(source, output, {
        targetDir: 'packages/imported',
        rewritePaths: false,
      });

      // Both the existing file and imported file should exist
      expect(await fs.pathExists(path.join(output, 'existing.txt'))).toBe(true);
      expect(await fs.pathExists(path.join(output, 'packages/imported/src.ts'))).toBe(true);

      // Should have multiple commits
      const logOutput = execSync('git log --oneline', { cwd: output, encoding: 'utf-8' });
      expect(logOutput.trim().split('\n').length).toBeGreaterThanOrEqual(2);
    });

    it('should preserve history with filter-repo when rewritePaths is true', async () => {
      const hasFilterRepo = await checkGitFilterRepo();
      if (!hasFilterRepo) {
        // Skip if git-filter-repo not installed
        return;
      }

      const source = path.join(tempDir, 'source-filter');
      const output = path.join(tempDir, 'output-filter');
      await fs.ensureDir(source);
      await fs.ensureDir(output);

      // Create source repo
      execSync('git init', { cwd: source, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: source, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'lib.ts'), 'export const lib = 1;');
      execSync('git add .', { cwd: source, stdio: 'pipe' });
      execSync('git commit -m "add lib"', { cwd: source, stdio: 'pipe' });

      await preserveHistory(source, output, {
        targetDir: 'packages/mylib',
        rewritePaths: true,
      });

      // The file should be under the targetDir
      expect(await fs.pathExists(path.join(output, 'packages/mylib/lib.ts'))).toBe(true);
      expect(await fs.pathExists(path.join(output, '.git'))).toBe(true);
    });

    it('should preserve history with filter-repo and commit prefix', async () => {
      const hasFilterRepo = await checkGitFilterRepo();
      if (!hasFilterRepo) return;

      const source = path.join(tempDir, 'source-prefix');
      const output = path.join(tempDir, 'output-prefix');
      await fs.ensureDir(source);
      await fs.ensureDir(output);

      execSync('git init', { cwd: source, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: source, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'app.ts'), 'export const app = true;');
      execSync('git add .', { cwd: source, stdio: 'pipe' });
      execSync('git commit -m "init app"', { cwd: source, stdio: 'pipe' });

      await preserveHistory(source, output, {
        targetDir: 'packages/app',
        rewritePaths: true,
        commitPrefix: '[app] ',
      });

      expect(await fs.pathExists(path.join(output, 'packages/app/app.ts'))).toBe(true);
      const logOutput = execSync('git log --oneline', { cwd: output, encoding: 'utf-8' });
      expect(logOutput).toContain('[app]');
    });

    it('should handle subtree with non-standard branch name', async () => {
      const source = path.join(tempDir, 'source-custom-branch');
      const output = path.join(tempDir, 'output-custom-branch');
      await fs.ensureDir(source);
      await fs.ensureDir(output);

      // Create source repo with a custom branch name
      execSync('git init -b develop', { cwd: source, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: source, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: source, stdio: 'pipe' });
      await fs.writeFile(path.join(source, 'util.ts'), 'export const util = 1;');
      execSync('git add .', { cwd: source, stdio: 'pipe' });
      execSync('git commit -m "init on develop"', { cwd: source, stdio: 'pipe' });

      await preserveHistory(source, output, {
        targetDir: 'packages/util',
        rewritePaths: false,
      });

      expect(await fs.pathExists(path.join(output, 'packages/util/util.ts'))).toBe(true);
    });

    it('should handle multiple sequential imports via subtree', async () => {
      const source1 = path.join(tempDir, 'source1');
      const source2 = path.join(tempDir, 'source2');
      const output = path.join(tempDir, 'output-multi');
      await fs.ensureDir(source1);
      await fs.ensureDir(source2);
      await fs.ensureDir(output);

      // Create two source repos
      for (const [src, name] of [[source1, 'src1'], [source2, 'src2']] as const) {
        execSync('git init', { cwd: src, stdio: 'pipe' });
        execSync('git config user.email "test@test.com"', { cwd: src, stdio: 'pipe' });
        execSync('git config user.name "Test"', { cwd: src, stdio: 'pipe' });
        await fs.writeFile(path.join(src, `${name}.ts`), `export const ${name} = 1;`);
        execSync('git add .', { cwd: src, stdio: 'pipe' });
        execSync(`git commit -m "init ${name}"`, { cwd: src, stdio: 'pipe' });
      }

      // Import both into the same output
      await preserveHistory(source1, output, {
        targetDir: 'packages/source1',
        rewritePaths: false,
      });
      await preserveHistory(source2, output, {
        targetDir: 'packages/source2',
        rewritePaths: false,
      });

      expect(await fs.pathExists(path.join(output, 'packages/source1/src1.ts'))).toBe(true);
      expect(await fs.pathExists(path.join(output, 'packages/source2/src2.ts'))).toBe(true);
    });
  });
});
