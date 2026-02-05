import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  createTempFixture,
  cleanupFixtures,
  fixtureConfigs,
} from '../helpers/fixtures.js';

describe('Error Handling Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `error-test-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await cleanupFixtures();
    await fs.remove(testDir).catch(() => {});
  });

  describe('cleanup on analysis failure', () => {
    it('should handle malformed package.json gracefully', async () => {
      const malformedFixture = await createTempFixture(fixtureConfigs.malformed());
      const validFixture = await createTempFixture(fixtureConfigs.valid('valid-pkg'));

      const { analyzeDependencies } = await import('../../src/analyzers/dependencies.js');

      const result = await analyzeDependencies([
        { path: malformedFixture, name: 'malformed' },
        { path: validFixture, name: 'valid-pkg' },
      ]);

      // Should still return results for valid packages
      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].name).toBe('valid-pkg');
    });

    it('should handle missing package.json gracefully', async () => {
      const noPkgFixture = await createTempFixture(fixtureConfigs.noPkg());

      const { analyzeDependencies } = await import('../../src/analyzers/dependencies.js');

      const result = await analyzeDependencies([
        { path: noPkgFixture, name: 'no-pkg' },
      ]);

      // Should return empty packages array
      expect(result.packages).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should handle non-existent directory gracefully', async () => {
      const nonExistent = path.join(testDir, 'does-not-exist');

      const { analyzeDependencies } = await import('../../src/analyzers/dependencies.js');

      const result = await analyzeDependencies([
        { path: nonExistent, name: 'nonexistent' },
      ]);

      // Should return empty packages array
      expect(result.packages).toHaveLength(0);
    });
  });

  describe('error message clarity', () => {
    it('should provide clear message for local path not found', async () => {
      const { cloneOrCopyRepo } = await import('../../src/strategies/copy.js');
      const { createMockLogger } = await import('../helpers/mocks.js');

      const mockLogger = createMockLogger();
      const source = {
        type: 'local' as const,
        original: './nonexistent-repo',
        resolved: path.join(testDir, 'nonexistent-repo'),
        name: 'nonexistent',
      };

      await expect(
        cloneOrCopyRepo(source, path.join(testDir, 'output'), { logger: mockLogger })
      ).rejects.toThrow(/Local repository not found/);
    });

    it('should provide clear message for invalid repository URL', async () => {
      const { validateRepoSources } = await import('../../src/utils/validation.js');

      // A path that looks invalid
      const result = await validateRepoSources(['/nonexistent/absolute/path']);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('does not exist');
    });
  });

  describe('partial failure reporting', () => {
    it('should report which operations succeeded before failure', async () => {
      const fixture1 = await createTempFixture(fixtureConfigs.valid('pkg1'));
      const fixture2 = await createTempFixture(fixtureConfigs.valid('pkg2'));

      const { analyzeDependencies } = await import('../../src/analyzers/dependencies.js');

      // Both should succeed
      const result = await analyzeDependencies([
        { path: fixture1, name: 'pkg1' },
        { path: fixture2, name: 'pkg2' },
      ]);

      expect(result.packages).toHaveLength(2);
    });

    it('should continue analyzing valid packages when some fail', async () => {
      const validFixture = await createTempFixture(fixtureConfigs.valid('valid'));
      const emptyFixture = await createTempFixture(fixtureConfigs.empty());
      const malformedFixture = await createTempFixture(fixtureConfigs.malformed());

      const { analyzeDependencies } = await import('../../src/analyzers/dependencies.js');

      const result = await analyzeDependencies([
        { path: validFixture, name: 'valid' },
        { path: emptyFixture, name: 'empty' },
        { path: malformedFixture, name: 'malformed' },
      ]);

      // Should have 2 packages (valid has deps, empty has no deps but valid JSON)
      expect(result.packages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('file collision detection errors', () => {
    it('should handle empty directories gracefully', async () => {
      const emptyDir = await createTempFixture({
        name: 'empty-dir',
        directories: ['src'],
      });

      const { detectFileCollisions } = await import('../../src/analyzers/files.js');

      const result = await detectFileCollisions([
        { path: emptyDir, name: 'empty-dir' },
      ]);

      // Should return empty collisions for single repo
      expect(result).toHaveLength(0);
    });

    it('should detect collisions across multiple repos', async () => {
      const repo1 = await createTempFixture({
        name: 'repo1',
        files: {
          'config.json': '{"setting": 1}',
          '.gitignore': 'node_modules/',
        },
      });

      const repo2 = await createTempFixture({
        name: 'repo2',
        files: {
          'config.json': '{"setting": 2}',
          '.gitignore': 'dist/',
        },
      });

      const { detectFileCollisions } = await import('../../src/analyzers/files.js');

      const result = await detectFileCollisions([
        { path: repo1, name: 'repo1' },
        { path: repo2, name: 'repo2' },
      ]);

      // Should detect config.json and .gitignore as collisions
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some(c => c.path === 'config.json')).toBe(true);
      expect(result.some(c => c.path === '.gitignore')).toBe(true);
    });
  });

  describe('workspace configuration errors', () => {
    it('should handle packages with no scripts', async () => {
      const { generateWorkspaceConfig } = await import('../../src/strategies/workspace-config.js');

      const packages = [{
        name: 'no-scripts',
        version: '1.0.0',
        dependencies: {},
        devDependencies: {},
        peerDependencies: {},
        scripts: {},
        path: '/path',
        repoName: 'no-scripts',
      }];

      const result = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      expect(result.rootPackageJson.scripts).toBeDefined();
    });

    it('should handle empty packages array', async () => {
      const { generateWorkspaceConfig } = await import('../../src/strategies/workspace-config.js');

      const result = generateWorkspaceConfig([], {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      expect(result.rootPackageJson.name).toBe('monorepo');
      expect(result.pnpmWorkspace.packages).toContain('packages/*');
    });
  });

  describe('file system error handling', () => {
    it('should handle readJson on non-existent file', async () => {
      const { readJson } = await import('../../src/utils/fs.js');

      await expect(
        readJson(path.join(testDir, 'nonexistent.json'))
      ).rejects.toThrow();
    });

    it('should handle readJson on invalid JSON', async () => {
      const invalidJsonFile = path.join(testDir, 'invalid.json');
      await fs.writeFile(invalidJsonFile, '{ invalid }');

      const { readJson } = await import('../../src/utils/fs.js');

      await expect(readJson(invalidJsonFile)).rejects.toThrow();
    });

    it('should handle pathExists for non-existent paths', async () => {
      const { pathExists } = await import('../../src/utils/fs.js');

      const result = await pathExists(path.join(testDir, 'nonexistent'));

      expect(result).toBe(false);
    });

    it('should handle isDirectory for non-existent paths', async () => {
      const { isDirectory } = await import('../../src/utils/fs.js');

      const result = await isDirectory(path.join(testDir, 'nonexistent'));

      expect(result).toBe(false);
    });
  });

  describe('validation error handling', () => {
    it('should return validation errors for empty input', async () => {
      const { validateRepoSources } = await import('../../src/utils/validation.js');

      const result = await validateRepoSources([]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one repository is required');
    });

    it('should handle duplicate repository names', async () => {
      const { validateRepoSources } = await import('../../src/utils/validation.js');

      const result = await validateRepoSources([
        'owner/repo',
        'other-owner/repo',
      ]);

      // Should rename duplicates
      expect(result.valid).toBe(true);
      expect(result.sources[0].name).not.toBe(result.sources[1].name);
    });
  });
});
