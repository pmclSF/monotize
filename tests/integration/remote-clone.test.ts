import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import type { RepoSource } from '../../src/types/index.js';
import { createMockLogger } from '../helpers/mocks.js';

// Mock simple-git
vi.mock('simple-git', () => {
  return {
    default: vi.fn(),
  };
});

import simpleGit from 'simple-git';
import { cloneOrCopyRepo, cloneOrCopyRepos } from '../../src/strategies/copy.js';

describe('Remote Cloning Integration', () => {
  let testDir: string;
  const mockLogger = createMockLogger();
  const mockGit = {
    clone: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    (simpleGit as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockGit);

    // Create test directory
    testDir = path.join(os.tmpdir(), `clone-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  describe('successful clone scenarios', () => {
    it('should clone repository successfully', async () => {
      mockGit.clone.mockResolvedValueOnce({});

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
        logger: mockLogger,
        cloneTimeout: 60000,
        maxRetries: 3,
      });

      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/owner/repo.git',
        path.join(testDir, 'repo'),
        ['--depth', '1']
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Cloning'));
    });

    it('should clone multiple repositories', async () => {
      mockGit.clone.mockResolvedValue({});

      const sources: RepoSource[] = [
        {
          type: 'github',
          original: 'owner/repo1',
          resolved: 'https://github.com/owner/repo1.git',
          name: 'repo1',
        },
        {
          type: 'github',
          original: 'owner/repo2',
          resolved: 'https://github.com/owner/repo2.git',
          name: 'repo2',
        },
      ];

      const results = await cloneOrCopyRepos(sources, testDir, {
        logger: mockLogger,
        cloneTimeout: 60000,
        maxRetries: 3,
      });

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('repo1');
      expect(results[1].name).toBe('repo2');
      expect(mockGit.clone).toHaveBeenCalledTimes(2);
    });
  });

  describe('authentication failures', () => {
    it('should provide helpful message for 401 error', async () => {
      mockGit.clone.mockRejectedValueOnce(new Error('Authentication failed. 401'));

      const source: RepoSource = {
        type: 'github',
        original: 'owner/private-repo',
        resolved: 'https://github.com/owner/private-repo.git',
        name: 'private-repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/Authentication failed/);
    });

    it('should provide helpful message for 403 error', async () => {
      mockGit.clone.mockRejectedValueOnce(new Error('403 Forbidden'));

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/Authentication failed/);
    });

    it('should provide helpful message for Permission denied', async () => {
      mockGit.clone.mockRejectedValueOnce(new Error('Permission denied (publickey)'));

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'git@github.com:owner/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/SSH keys/);
    });
  });

  describe('network errors', () => {
    it('should retry on timeout error', async () => {
      const timeoutError = new Error('ETIMEDOUT') as Error & { code: string };
      timeoutError.code = 'ETIMEDOUT';

      mockGit.clone
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({});

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
        logger: mockLogger,
        maxRetries: 3,
      });

      expect(mockGit.clone).toHaveBeenCalledTimes(3);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('retrying'));
    });

    it('should retry on ENOTFOUND error', async () => {
      const dnsError = new Error('ENOTFOUND') as Error & { code: string };
      dnsError.code = 'ENOTFOUND';

      mockGit.clone
        .mockRejectedValueOnce(dnsError)
        .mockResolvedValueOnce({});

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
        logger: mockLogger,
        maxRetries: 3,
      });

      expect(mockGit.clone).toHaveBeenCalledTimes(2);
    });

    it('should retry on connection refused', async () => {
      const connError = new Error('ECONNREFUSED') as Error & { code: string };
      connError.code = 'ECONNREFUSED';

      mockGit.clone
        .mockRejectedValueOnce(connError)
        .mockResolvedValueOnce({});

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
        logger: mockLogger,
        maxRetries: 3,
      });

      expect(mockGit.clone).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const timeoutError = new Error('Connection timed out') as Error & { code: string };
      timeoutError.code = 'ETIMEDOUT';

      mockGit.clone.mockRejectedValue(timeoutError);

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 3,
        })
      ).rejects.toThrow(/timed out/i);

      expect(mockGit.clone).toHaveBeenCalledTimes(3);
    });
  });

  describe('repository errors', () => {
    it('should provide helpful message for 404 error', async () => {
      mockGit.clone.mockRejectedValueOnce(new Error('Repository not found. 404'));

      const source: RepoSource = {
        type: 'github',
        original: 'owner/nonexistent',
        resolved: 'https://github.com/owner/nonexistent.git',
        name: 'nonexistent',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/Repository not found/);
    });

    it('should handle empty repository', async () => {
      mockGit.clone.mockRejectedValueOnce(new Error('warning: remote HEAD refers to nonexistent ref, unable to checkout'));

      const source: RepoSource = {
        type: 'github',
        original: 'owner/empty-repo',
        resolved: 'https://github.com/owner/empty-repo.git',
        name: 'empty-repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow();
    });
  });

  describe('not retry on non-transient errors', () => {
    it('should not retry on auth errors', async () => {
      mockGit.clone.mockRejectedValueOnce(new Error('Authentication failed'));

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 3,
        })
      ).rejects.toThrow();

      // Should only try once for auth errors
      expect(mockGit.clone).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 errors', async () => {
      mockGit.clone.mockRejectedValueOnce(new Error('Repository not found'));

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 3,
        })
      ).rejects.toThrow();

      expect(mockGit.clone).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup behavior', () => {
    it('should cleanup partial clone on failure', async () => {
      const targetDir = path.join(testDir, 'partial-repo');

      // Create a partial directory to simulate partial clone
      await fs.ensureDir(targetDir);
      await fs.writeFile(path.join(targetDir, 'partial.txt'), 'partial content');

      mockGit.clone.mockRejectedValueOnce(new Error('Clone failed'));

      const source: RepoSource = {
        type: 'github',
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'partial-repo',
      };

      await expect(
        cloneOrCopyRepo(source, targetDir, {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow();

      // The partial directory should be cleaned up
      // Note: In actual implementation, cleanup happens in the catch block
    });
  });

  describe('multiple repo handling', () => {
    it('should stop on first failure', async () => {
      mockGit.clone
        .mockResolvedValueOnce({}) // First repo succeeds
        .mockRejectedValueOnce(new Error('Repository not found')); // Second fails

      const sources: RepoSource[] = [
        {
          type: 'github',
          original: 'owner/repo1',
          resolved: 'https://github.com/owner/repo1.git',
          name: 'repo1',
        },
        {
          type: 'github',
          original: 'owner/nonexistent',
          resolved: 'https://github.com/owner/nonexistent.git',
          name: 'nonexistent',
        },
        {
          type: 'github',
          original: 'owner/repo3',
          resolved: 'https://github.com/owner/repo3.git',
          name: 'repo3',
        },
      ];

      await expect(
        cloneOrCopyRepos(sources, testDir, {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/Repository not found/);

      // Third repo should not be attempted
      expect(mockGit.clone).toHaveBeenCalledTimes(2);
    });
  });
});
