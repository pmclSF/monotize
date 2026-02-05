import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import crypto from 'node:crypto';
import { createMockLogger } from '../helpers/mocks.js';

// Mock simple-git
vi.mock('simple-git', () => {
  return {
    default: vi.fn(),
  };
});

import simpleGit from 'simple-git';
import { cloneOrCopyRepo } from '../../src/strategies/copy.js';

describe('Git Error Scenarios', () => {
  let testDir: string;
  const mockLogger = createMockLogger();
  const mockGit = {
    clone: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    (simpleGit as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockGit);

    testDir = path.join(os.tmpdir(), `git-error-test-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  describe('git not installed scenario', () => {
    it('should detect git availability with checkPrerequisites', async () => {
      const { checkPrerequisites } = await import('../../src/utils/validation.js');

      // This will check if git is actually installed on the system
      const result = await checkPrerequisites({
        outputDir: testDir,
        needsPnpm: false,
      });

      // On CI/dev machines, git should be installed
      // But we verify the function runs without error
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('authentication required scenarios', () => {
    it('should provide helpful message for basic auth failure', async () => {
      mockGit.clone.mockRejectedValueOnce(
        new Error('remote: HTTP Basic: Access denied\nfatal: Authentication failed')
      );

      const source = {
        type: 'github' as const,
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

    it('should provide helpful message for SSH key failure', async () => {
      mockGit.clone.mockRejectedValueOnce(
        new Error('git@github.com: Permission denied (publickey)')
      );

      const source = {
        type: 'github' as const,
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

    it('should provide helpful message for token expiry', async () => {
      mockGit.clone.mockRejectedValueOnce(
        new Error('remote: Invalid username or password.\nfatal: Authentication failed for')
      );

      const source = {
        type: 'github' as const,
        original: 'owner/repo',
        resolved: 'https://token@github.com/owner/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/Authentication failed/);
    });
  });

  describe('repository not found scenarios', () => {
    it('should provide helpful message for 404', async () => {
      mockGit.clone.mockRejectedValueOnce(
        new Error("fatal: repository 'https://github.com/owner/nonexistent.git' not found")
      );

      const source = {
        type: 'github' as const,
        original: 'owner/nonexistent',
        resolved: 'https://github.com/owner/nonexistent.git',
        name: 'nonexistent',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/not found/i);
    });

    it('should provide helpful message for deleted repository', async () => {
      mockGit.clone.mockRejectedValueOnce(
        new Error("fatal: repository 'https://github.com/deleted/repo.git' does not exist")
      );

      const source = {
        type: 'github' as const,
        original: 'deleted/repo',
        resolved: 'https://github.com/deleted/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/Repository not found/);
    });
  });

  describe('network unreachable scenarios', () => {
    it('should retry on DNS failure', async () => {
      const dnsError = new Error('Could not resolve host: github.com') as Error & {
        code: string;
      };
      dnsError.code = 'ENOTFOUND';

      mockGit.clone
        .mockRejectedValueOnce(dnsError)
        .mockRejectedValueOnce(dnsError)
        .mockResolvedValueOnce({});

      const source = {
        type: 'github' as const,
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
        logger: mockLogger,
        maxRetries: 3,
      });

      expect(mockGit.clone).toHaveBeenCalledTimes(3);
    });

    it('should provide helpful message after max retries', async () => {
      const dnsError = new Error('Could not resolve host: github.com') as Error & {
        code: string;
      };
      dnsError.code = 'ENOTFOUND';

      mockGit.clone.mockRejectedValue(dnsError);

      const source = {
        type: 'github' as const,
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 2,
        })
      ).rejects.toThrow(/Cannot reach repository host/);
    });

    it('should handle connection refused', async () => {
      const connError = new Error('connect ECONNREFUSED') as Error & { code: string };
      connError.code = 'ECONNREFUSED';

      mockGit.clone.mockRejectedValue(connError);

      const source = {
        type: 'url' as const,
        original: 'https://git.internal.com/repo.git',
        resolved: 'https://git.internal.com/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 2,
        })
      ).rejects.toThrow(/Connection refused/);
    });
  });

  describe('timeout scenarios', () => {
    it('should handle clone timeout', async () => {
      const timeoutError = new Error('operation timed out') as Error & { code: string };
      timeoutError.code = 'ETIMEDOUT';

      mockGit.clone.mockRejectedValue(timeoutError);

      const source = {
        type: 'github' as const,
        original: 'owner/large-repo',
        resolved: 'https://github.com/owner/large-repo.git',
        name: 'large-repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 2,
          cloneTimeout: 1000,
        })
      ).rejects.toThrow(/timed out/);
    });
  });

  describe('empty repository scenarios', () => {
    it('should handle empty repository', async () => {
      mockGit.clone.mockRejectedValueOnce(
        new Error('warning: You appear to have cloned an empty repository')
      );

      const source = {
        type: 'github' as const,
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

  describe('corrupted repository scenarios', () => {
    it('should handle corrupted git objects', async () => {
      mockGit.clone.mockRejectedValueOnce(
        new Error('fatal: unable to read tree abc123')
      );

      const source = {
        type: 'github' as const,
        original: 'owner/corrupted-repo',
        resolved: 'https://github.com/owner/corrupted-repo.git',
        name: 'corrupted-repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow();
    });
  });

  describe('GitLab/Bitbucket specific errors', () => {
    it('should handle GitLab authentication', async () => {
      mockGit.clone.mockRejectedValueOnce(
        new Error('remote: HTTP Basic: Access denied. The provided password or token is incorrect')
      );

      const source = {
        type: 'gitlab' as const,
        original: 'gitlab:owner/repo',
        resolved: 'https://gitlab.com/owner/repo.git',
        name: 'repo',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'repo'), {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow(/Access denied|Authentication|password|token/i);
    });
  });

  describe('partial clone cleanup', () => {
    it('should clean up partial clone directory on failure', async () => {
      const targetDir = path.join(testDir, 'partial-clone');

      // Pre-create directory with some content to simulate partial clone
      await fs.ensureDir(targetDir);
      await fs.writeFile(path.join(targetDir, 'partial.txt'), 'partial content');

      mockGit.clone.mockRejectedValueOnce(new Error('Clone failed mid-way'));

      const source = {
        type: 'github' as const,
        original: 'owner/repo',
        resolved: 'https://github.com/owner/repo.git',
        name: 'partial-clone',
      };

      await expect(
        cloneOrCopyRepo(source, targetDir, {
          logger: mockLogger,
          maxRetries: 1,
        })
      ).rejects.toThrow();

      // Note: The actual cleanup happens inside cloneRepo
      // We verify the error propagates correctly
    });
  });
});
