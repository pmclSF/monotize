import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateReadmeDeprecationPatch,
  generateArchivePlan,
  applyArchiveViaGitHubApi,
} from '../../../src/strategies/archive.js';
import type { ArchivePlan, Logger } from '../../../src/types/index.js';

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

describe('archive strategy', () => {
  describe('generateReadmeDeprecationPatch', () => {
    it('should generate a unified diff format', () => {
      const patch = generateReadmeDeprecationPatch('my-lib', 'https://github.com/org/monorepo');
      expect(patch).toContain('--- a/README.md');
      expect(patch).toContain('+++ b/README.md');
      expect(patch).toContain('@@');
    });

    it('should include the repo name as heading', () => {
      const patch = generateReadmeDeprecationPatch('my-lib', 'https://github.com/org/monorepo');
      expect(patch).toContain('+# my-lib');
    });

    it('should include monorepo URL', () => {
      const patch = generateReadmeDeprecationPatch('pkg', 'https://github.com/org/mono');
      expect(patch).toContain('https://github.com/org/mono');
    });

    it('should include migration notice', () => {
      const patch = generateReadmeDeprecationPatch('pkg', 'https://example.com/mono');
      expect(patch).toContain('archived');
      expect(patch).toContain('no longer maintained');
    });

    it('should include instructions to file issues elsewhere', () => {
      const patch = generateReadmeDeprecationPatch('pkg', 'https://example.com/mono');
      expect(patch).toContain('file issues');
      expect(patch).toContain('pull requests');
    });
  });

  describe('generateArchivePlan', () => {
    it('should generate a plan for local fixture repos', async () => {
      const fixtureA = 'tests/fixtures/repo-a';
      const fixtureB = 'tests/fixtures/repo-b';
      const plan = await generateArchivePlan(
        [fixtureA, fixtureB],
        'https://github.com/org/monorepo',
      );

      expect(plan.schemaVersion).toBe(1);
      expect(plan.createdAt).toBeTruthy();
      expect(plan.monorepoUrl).toBe('https://github.com/org/monorepo');
      expect(plan.repos).toHaveLength(2);
      expect(plan.repos[0].readmePatch).toContain('--- a/README.md');
      expect(plan.repos[1].readmePatch).toContain('--- a/README.md');
    });

    it('should not include apiOperations by default', async () => {
      const plan = await generateArchivePlan(
        ['tests/fixtures/repo-a'],
        'https://github.com/org/monorepo',
      );
      expect(plan.apiOperations).toBeUndefined();
    });

    it('should include apiOperations when tokenFromEnv is true', async () => {
      const plan = await generateArchivePlan(
        ['tests/fixtures/repo-a'],
        'https://github.com/org/monorepo',
        { tokenFromEnv: true },
      );
      expect(plan.apiOperations).toBeDefined();
      expect(plan.apiOperations!.length).toBeGreaterThan(0);
      expect(plan.apiOperations![0].action).toBe('archive');
    });

    it('should throw on invalid repo sources', async () => {
      await expect(
        generateArchivePlan([], 'https://github.com/org/monorepo'),
      ).rejects.toThrow();
    });
  });

  describe('applyArchiveViaGitHubApi', () => {
    const originalEnv = process.env;
    let logger: Logger;

    beforeEach(() => {
      logger = mockLogger();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('should throw when no GitHub token is set', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;

      const plan: ArchivePlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        repos: [],
        monorepoUrl: 'https://github.com/org/mono',
        apiOperations: [{ repo: 'org/my-lib', action: 'archive' }],
      };

      await expect(applyArchiveViaGitHubApi(plan, logger)).rejects.toThrow('GitHub token required');
    });

    it('should handle plan with no apiOperations gracefully', async () => {
      process.env.GITHUB_TOKEN = 'fake-token';

      const plan: ArchivePlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        repos: [],
        monorepoUrl: 'https://github.com/org/mono',
      };

      const result = await applyArchiveViaGitHubApi(plan, logger);
      expect(result.applied).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('should fail for repos that cannot be parsed', async () => {
      process.env.GITHUB_TOKEN = 'fake-token';

      const plan: ArchivePlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        repos: [],
        monorepoUrl: 'https://github.com/org/mono',
        apiOperations: [{ repo: 'invalid-format', action: 'archive' }],
      };

      const result = await applyArchiveViaGitHubApi(plan, logger);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('Could not parse');
    });

    it('should handle fetch failures gracefully', async () => {
      process.env.GITHUB_TOKEN = 'fake-token';

      // Mock fetch to simulate network error
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const plan: ArchivePlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        repos: [],
        monorepoUrl: 'https://github.com/org/mono',
        apiOperations: [{ repo: 'github.com/org/my-lib', action: 'archive' }],
      };

      const result = await applyArchiveViaGitHubApi(plan, logger);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('Network error');

      globalThis.fetch = originalFetch;
    });

    it('should handle HTTP error responses', async () => {
      process.env.GITHUB_TOKEN = 'fake-token';

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      });

      const plan: ArchivePlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        repos: [],
        monorepoUrl: 'https://github.com/org/mono',
        apiOperations: [{ repo: 'github.com/org/my-lib', action: 'archive' }],
      };

      const result = await applyArchiveViaGitHubApi(plan, logger);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('HTTP 403');

      globalThis.fetch = originalFetch;
    });

    it('should succeed with successful API response', async () => {
      process.env.GITHUB_TOKEN = 'fake-token';

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const plan: ArchivePlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        repos: [],
        monorepoUrl: 'https://github.com/org/mono',
        apiOperations: [{ repo: 'github.com/org/my-lib', action: 'archive' }],
      };

      const result = await applyArchiveViaGitHubApi(plan, logger);
      expect(result.applied).toEqual(['github.com/org/my-lib']);
      expect(result.failed).toEqual([]);

      globalThis.fetch = originalFetch;
    });

    it('should use GH_TOKEN when GITHUB_TOKEN is not set', async () => {
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'gh-token';

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      const plan: ArchivePlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        repos: [],
        monorepoUrl: 'https://github.com/org/mono',
        apiOperations: [{ repo: 'github.com/org/my-lib', action: 'archive' }],
      };

      await applyArchiveViaGitHubApi(plan, logger);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.github.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer gh-token',
          }),
        }),
      );

      globalThis.fetch = originalFetch;
    });
  });
});
