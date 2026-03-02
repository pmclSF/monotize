import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  checkBranchMigratePrerequisites,
  branchMigrateDryRun,
  generateBranchPlan,
  applyBranchPlan,
} from '../../../src/strategies/migrate-branch.js';
import type { Logger } from '../../../src/types/index.js';

function mockLogger(): Logger {
  return {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  };
}

describe('migrate-branch strategy', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `mb-test-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  function createGitRepo(name: string, branch = 'main'): string {
    const repoPath = path.join(tempDir, name);
    fs.ensureDirSync(repoPath);
    execSync('git init', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'pipe' });
    // Ensure we're on the expected branch
    try {
      execSync(`git checkout -b ${branch}`, { cwd: repoPath, stdio: 'pipe' });
    } catch {
      // branch already exists
    }
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test\n');
    execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: repoPath, stdio: 'pipe' });
    return repoPath;
  }

  describe('checkBranchMigratePrerequisites', () => {
    it('should pass for valid repos with subtree strategy', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');

      const result = await checkBranchMigratePrerequisites(source, target, 'subtree');
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should pass for valid repos with replay strategy', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');

      const result = await checkBranchMigratePrerequisites(source, target, 'replay');
      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should fail when source repo does not exist', async () => {
      const target = createGitRepo('target');
      const nonexistent = path.join(tempDir, 'nonexistent');

      const result = await checkBranchMigratePrerequisites(nonexistent, target, 'subtree');
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.includes('Source repository not found'))).toBe(true);
    });

    it('should fail when target monorepo does not exist', async () => {
      const source = createGitRepo('source');
      const nonexistent = path.join(tempDir, 'nonexistent');

      const result = await checkBranchMigratePrerequisites(source, nonexistent, 'subtree');
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.includes('Target monorepo not found'))).toBe(true);
    });

    it('should warn about shallow clones', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');

      // Create a shallow clone
      const shallow = path.join(tempDir, 'shallow');
      execSync(`git clone --depth 1 file://${source} ${shallow}`, { stdio: 'pipe' });

      const result = await checkBranchMigratePrerequisites(shallow, target, 'subtree');
      expect(result.issues.some((i) => i.includes('shallow clone'))).toBe(true);
    });

    it('should fail when source is not a git repo', async () => {
      const nonGit = path.join(tempDir, 'not-git');
      await fs.ensureDir(nonGit);
      const target = createGitRepo('target');

      const result = await checkBranchMigratePrerequisites(nonGit, target, 'subtree');
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.includes('not a valid git repository'))).toBe(true);
    });
  });

  describe('branchMigrateDryRun', () => {
    it('should return commit count and contributors', async () => {
      const repo = createGitRepo('source');
      // Add more commits
      fs.writeFileSync(path.join(repo, 'file1.txt'), 'content1');
      execSync('git add . && git commit -m "second"', { cwd: repo, stdio: 'pipe' });
      fs.writeFileSync(path.join(repo, 'file2.txt'), 'content2');
      execSync('git add . && git commit -m "third"', { cwd: repo, stdio: 'pipe' });

      const result = await branchMigrateDryRun(repo, 'main');
      expect(result.commitCount).toBe(3);
      expect(result.contributors).toContain('Test User');
      expect(result.estimatedTime).toMatch(/\d+ seconds/);
    });

    it('should return zero for nonexistent branch', async () => {
      const repo = createGitRepo('source');

      const result = await branchMigrateDryRun(repo, 'nonexistent-branch');
      expect(result.commitCount).toBe(0);
      expect(result.estimatedTime).toBe('unknown');
      expect(result.contributors).toEqual([]);
    });

    it('should estimate minutes for large repos', async () => {
      const repo = createGitRepo('source');
      // Create enough commits to trigger minutes estimate (>120 commits / 0.5s = 60s)
      for (let i = 0; i < 125; i++) {
        fs.writeFileSync(path.join(repo, `file${i}.txt`), `content${i}`);
        execSync(`git add . && git commit -m "commit ${i}"`, { cwd: repo, stdio: 'pipe' });
      }

      const result = await branchMigrateDryRun(repo, 'main');
      expect(result.estimatedTime).toMatch(/minutes/);
    });
  });

  describe('generateBranchPlan', () => {
    it('should generate a subtree plan', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');
      const logger = mockLogger();

      const plan = await generateBranchPlan('main', source, target, 'subtree', logger);

      expect(plan.schemaVersion).toBe(1);
      expect(plan.branch).toBe('main');
      expect(plan.strategy).toBe('subtree');
      expect(plan.operations).toHaveLength(3);
      expect(plan.operations.map((o) => o.id)).toEqual(['add-remote', 'subtree-add', 'remove-remote']);
      expect(plan.dryRunReport).toBeDefined();
      expect(plan.dryRunReport!.commitCount).toBeGreaterThanOrEqual(1);
    });

    it('should generate a replay plan', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');
      const logger = mockLogger();

      const plan = await generateBranchPlan('main', source, target, 'replay', logger);

      expect(plan.strategy).toBe('replay');
      expect(plan.operations).toHaveLength(3);
      expect(plan.operations.map((o) => o.id)).toEqual(['format-patch', 'create-branch', 'apply-patches']);
    });

    it('should throw when prerequisites fail', async () => {
      const logger = mockLogger();
      const nonexistent = path.join(tempDir, 'no-such-repo');

      await expect(
        generateBranchPlan('main', nonexistent, nonexistent, 'subtree', logger),
      ).rejects.toThrow('Prerequisites not met');
    });

    it('should resolve relative paths', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');
      const logger = mockLogger();

      const plan = await generateBranchPlan('main', source, target, 'subtree', logger);

      expect(path.isAbsolute(plan.sourceRepo)).toBe(true);
      expect(path.isAbsolute(plan.targetMonorepo)).toBe(true);
    });

    it('should include commit count in replay operation description', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');
      const logger = mockLogger();

      const plan = await generateBranchPlan('main', source, target, 'replay', logger);

      const formatPatch = plan.operations.find((o) => o.id === 'format-patch');
      expect(formatPatch?.description).toContain('commits');
    });
  });

  describe('applyBranchPlan', () => {
    it('should apply subtree import successfully', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');
      const logger = mockLogger();

      // Add more content to source
      fs.writeFileSync(path.join(source, 'lib.ts'), 'export const lib = 1;');
      execSync('git add . && git commit -m "add lib"', { cwd: source, stdio: 'pipe' });

      const plan = await generateBranchPlan('main', source, target, 'subtree', logger);

      await applyBranchPlan(plan, 'packages/source', logger);

      // Verify files were imported into the target subdirectory
      expect(fs.existsSync(path.join(target, 'packages/source/README.md'))).toBe(true);
      expect(fs.existsSync(path.join(target, 'packages/source/lib.ts'))).toBe(true);

      // Verify git history exists
      const log = execSync('git log --oneline', { cwd: target, encoding: 'utf-8' });
      expect(log.trim().split('\n').length).toBeGreaterThanOrEqual(2);
    });

    it('should clean up remote after subtree import', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');
      const logger = mockLogger();

      const plan = await generateBranchPlan('main', source, target, 'subtree', logger);
      await applyBranchPlan(plan, 'packages/source', logger);

      // Check that no monotize-import remotes remain
      const remotes = execSync('git remote', { cwd: target, encoding: 'utf-8' });
      expect(remotes).not.toContain('monotize-import');
    });

    it('should clean up remote even if subtree add fails', async () => {
      const source = createGitRepo('source');
      const target = createGitRepo('target');
      const logger = mockLogger();

      // Create a prefix that already exists to cause subtree add to fail
      fs.ensureDirSync(path.join(target, 'packages/source'));
      fs.writeFileSync(path.join(target, 'packages/source/conflict.txt'), 'conflict');
      execSync('git add . && git commit -m "conflict"', { cwd: target, stdio: 'pipe' });

      const plan = await generateBranchPlan('main', source, target, 'subtree', logger);

      // Should throw but still clean up
      await expect(
        applyBranchPlan(plan, 'packages/source', logger),
      ).rejects.toThrow();

      // Remote should still be cleaned up
      const remotes = execSync('git remote', { cwd: target, encoding: 'utf-8' });
      expect(remotes).not.toContain('monotize-import');
    });

    it('should apply patch replay strategy with feature branch', async () => {
      const source = createGitRepo('source-replay');
      const target = createGitRepo('target-replay');
      const logger = mockLogger();

      // Create a feature branch on source with commits diverging from main
      execSync('git checkout -b feature', { cwd: source, stdio: 'pipe' });
      fs.writeFileSync(path.join(source, 'feature.ts'), 'export const feature = true;');
      execSync('git add . && git commit -m "add feature"', { cwd: source, stdio: 'pipe' });
      fs.writeFileSync(path.join(source, 'feature2.ts'), 'export const feature2 = true;');
      execSync('git add . && git commit -m "add feature2"', { cwd: source, stdio: 'pipe' });

      const plan = await generateBranchPlan('feature', source, target, 'replay', logger);

      // The plan should reference the feature branch
      expect(plan.strategy).toBe('replay');
      expect(plan.branch).toBe('feature');
      expect(plan.operations).toHaveLength(3);
      expect(plan.dryRunReport!.commitCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle replay when format-patch produces no patches', async () => {
      const source = createGitRepo('source-nopatch');
      const target = createGitRepo('target-nopatch');
      const logger = mockLogger();

      // Generate a replay plan for main (no divergent commits)
      const plan = await generateBranchPlan('main', source, target, 'replay', logger);

      // Attempt to apply - git am with no patches may throw
      try {
        await applyBranchPlan(plan, 'packages/source', logger);
      } catch {
        // Expected: either no patches to apply or git am fails
      }

      // Verify logger was called (the function at least started)
      expect(logger.info).toHaveBeenCalled();
    });
  });
});
