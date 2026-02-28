import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkBranchMigratePrerequisites, branchMigrateDryRun } from '../../../src/strategies/migrate-branch.js';

describe('migrate-branch command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkBranchMigratePrerequisites', () => {
    it('should report issues for non-existent source', async () => {
      const result = await checkBranchMigratePrerequisites(
        '/nonexistent/source',
        '/nonexistent/target',
        'subtree',
      );
      expect(result.ok).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.includes('Source'))).toBe(true);
    });

    it('should accept valid paths', async () => {
      // Use test fixture paths that exist
      const result = await checkBranchMigratePrerequisites(
        process.cwd(), // Current dir is likely a git repo
        process.cwd(),
        'subtree',
      );
      // Should at least not fail on path existence
      // Might fail on shallow clone check depending on env
      expect(result.issues.every((i) => !i.includes('not found'))).toBe(true);
    });
  });

  describe('branchMigrateDryRun', () => {
    it('should return zero counts for non-git directory', async () => {
      const result = await branchMigrateDryRun('/tmp', 'main');
      expect(result.commitCount).toBe(0);
      expect(result.estimatedTime).toBe('unknown');
      expect(result.contributors).toEqual([]);
    });
  });
});
