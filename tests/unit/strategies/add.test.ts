import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { applyAddPlan, generateAddPlan } from '../../../src/strategies/add.js';
import type { AddPlan, Logger } from '../../../src/types/index.js';

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

describe('add strategy', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `add-test-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('generateAddPlan', () => {
    it('should throw for invalid repo source', async () => {
      const logger = mockLogger();
      await expect(
        generateAddPlan(
          '/completely/nonexistent/source/repo',
          { to: tempDir, packagesDir: 'packages' },
          logger,
        ),
      ).rejects.toThrow();
    });

    it('should throw for non-existent target monorepo', async () => {
      const logger = mockLogger();
      await expect(
        generateAddPlan(
          path.join(__dirname, '../../../tests/fixtures/repo-a'),
          { to: '/nonexistent/monorepo/path', packagesDir: 'packages' },
          logger,
        ),
      ).rejects.toThrow('Target monorepo does not exist');
    });

    it('should throw for monorepo without package.json', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo-no-pkg');
      await fs.ensureDir(monorepoDir);
      const logger = mockLogger();
      await expect(
        generateAddPlan(
          path.join(__dirname, '../../../tests/fixtures/repo-a'),
          { to: monorepoDir, packagesDir: 'packages' },
          logger,
        ),
      ).rejects.toThrow('No package.json found in monorepo');
    });

    it('should generate plan for valid monorepo with existing packages', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo');
      const packagesDir = path.join(monorepoDir, 'packages');
      const existingPkg = path.join(packagesDir, 'existing-pkg');
      await fs.ensureDir(existingPkg);
      await fs.writeJson(path.join(monorepoDir, 'package.json'), {
        name: 'monorepo',
        workspaces: ['packages/*'],
      });
      await fs.writeJson(path.join(existingPkg, 'package.json'), {
        name: 'existing-pkg',
        version: '1.0.0',
      });

      const logger = mockLogger();
      const plan = await generateAddPlan(
        path.join(__dirname, '../../../tests/fixtures/repo-a'),
        { to: monorepoDir, packagesDir: 'packages' },
        logger,
      );

      expect(plan.schemaVersion).toBe(1);
      expect(plan.targetMonorepo).toBe(monorepoDir);
      expect(plan.operations.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect cross-dependencies between new and existing packages', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo-cross');
      const packagesDir = path.join(monorepoDir, 'packages');
      // Create an existing package named "lodash" (repo-a depends on lodash)
      const existingPkg = path.join(packagesDir, 'lodash');
      await fs.ensureDir(existingPkg);
      await fs.writeJson(path.join(monorepoDir, 'package.json'), {
        name: 'monorepo',
        workspaces: ['packages/*'],
      });
      await fs.writeJson(path.join(existingPkg, 'package.json'), {
        name: 'lodash',
        version: '5.0.0',
      });

      const logger = mockLogger();
      const plan = await generateAddPlan(
        path.join(__dirname, '../../../tests/fixtures/repo-a'),
        { to: monorepoDir, packagesDir: 'packages' },
        logger,
      );

      // repo-a depends on lodash, and there's a package named lodash
      expect(plan.analysis.crossDependencies.length).toBeGreaterThanOrEqual(1);
      expect(plan.analysis.crossDependencies[0].toPackage).toBe('lodash');
    });
  });

  describe('applyAddPlan', () => {
    it('should execute copy operation', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo');
      const sourceDir = path.join(tempDir, 'source');
      await fs.ensureDir(monorepoDir);
      await fs.ensureDir(sourceDir);
      await fs.writeJson(path.join(monorepoDir, 'package.json'), {
        name: 'monorepo',
        workspaces: ['packages/*'],
      });
      await fs.writeFile(path.join(sourceDir, 'index.ts'), 'export const x = 1;');

      const plan: AddPlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        sourceRepo: { type: 'local', original: sourceDir, resolved: sourceDir, name: 'my-lib' },
        targetMonorepo: monorepoDir,
        packagesDir: 'packages',
        analysis: {
          packages: [],
          conflicts: [],
          collisions: [],
          crossDependencies: [],
          complexityScore: 0,
          recommendations: [],
        },
        decisions: [],
        operations: [
          {
            id: 'copy-package',
            type: 'copy',
            description: 'Copy my-lib to packages/my-lib',
            inputs: [sourceDir],
            outputs: ['packages/my-lib'],
          },
        ],
      };

      const logger = mockLogger();
      const result = await applyAddPlan(plan, logger);
      expect(result.success).toBe(true);
      expect(await fs.pathExists(path.join(monorepoDir, 'packages/my-lib/index.ts'))).toBe(true);
    });

    it('should execute write operation to update workspaces', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo');
      await fs.ensureDir(monorepoDir);
      await fs.writeJson(path.join(monorepoDir, 'package.json'), {
        name: 'monorepo',
        workspaces: ['packages/existing'],
      });

      const plan: AddPlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        sourceRepo: { type: 'local', original: '/tmp/src', resolved: '/tmp/src', name: 'new-pkg' },
        targetMonorepo: monorepoDir,
        packagesDir: 'packages',
        analysis: {
          packages: [],
          conflicts: [],
          collisions: [],
          crossDependencies: [],
          complexityScore: 0,
          recommendations: [],
        },
        decisions: [],
        operations: [
          {
            id: 'update-root-pkg',
            type: 'write',
            description: 'Update root package.json',
            inputs: ['package.json'],
            outputs: ['package.json'],
          },
        ],
      };

      const logger = mockLogger();
      await applyAddPlan(plan, logger);

      const rootPkg = await fs.readJson(path.join(monorepoDir, 'package.json'));
      expect(rootPkg.workspaces).toContain('packages/new-pkg');
      expect(rootPkg.workspaces).toContain('packages/existing');
    });

    it('should not duplicate workspace entries', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo');
      await fs.ensureDir(monorepoDir);
      await fs.writeJson(path.join(monorepoDir, 'package.json'), {
        name: 'monorepo',
        workspaces: ['packages/existing', 'packages/my-pkg'],
      });

      const plan: AddPlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        sourceRepo: { type: 'local', original: '/tmp/src', resolved: '/tmp/src', name: 'my-pkg' },
        targetMonorepo: monorepoDir,
        packagesDir: 'packages',
        analysis: {
          packages: [],
          conflicts: [],
          collisions: [],
          crossDependencies: [],
          complexityScore: 0,
          recommendations: [],
        },
        decisions: [],
        operations: [
          {
            id: 'update-root-pkg',
            type: 'write',
            description: 'Update root package.json',
            inputs: ['package.json'],
            outputs: ['package.json'],
          },
        ],
      };

      const logger = mockLogger();
      await applyAddPlan(plan, logger);

      const rootPkg = await fs.readJson(path.join(monorepoDir, 'package.json'));
      const matches = rootPkg.workspaces.filter((w: string) => w === 'packages/my-pkg');
      expect(matches).toHaveLength(1);
    });

    it('should handle exec operation by skipping', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo');
      await fs.ensureDir(monorepoDir);

      const plan: AddPlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        sourceRepo: { type: 'local', original: '/tmp/src', resolved: '/tmp/src', name: 'pkg' },
        targetMonorepo: monorepoDir,
        packagesDir: 'packages',
        analysis: {
          packages: [],
          conflicts: [],
          collisions: [],
          crossDependencies: [],
          complexityScore: 0,
          recommendations: [],
        },
        decisions: [],
        operations: [
          {
            id: 'install-deps',
            type: 'exec',
            description: 'Install dependencies',
            inputs: [],
            outputs: ['node_modules'],
          },
        ],
      };

      const logger = mockLogger();
      const result = await applyAddPlan(plan, logger);
      expect(result.success).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping install'));
    });

    it('should handle copy operation with no inputs gracefully', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo');
      await fs.ensureDir(monorepoDir);

      const plan: AddPlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        sourceRepo: { type: 'local', original: '/tmp/src', resolved: '/tmp/src', name: 'pkg' },
        targetMonorepo: monorepoDir,
        packagesDir: 'packages',
        analysis: {
          packages: [],
          conflicts: [],
          collisions: [],
          crossDependencies: [],
          complexityScore: 0,
          recommendations: [],
        },
        decisions: [],
        operations: [
          {
            id: 'copy-package',
            type: 'copy',
            description: 'Copy pkg to packages/pkg',
            inputs: [],
            outputs: ['packages/pkg'],
          },
        ],
      };

      const logger = mockLogger();
      const result = await applyAddPlan(plan, logger);
      expect(result.success).toBe(true);
    });

    it('should execute multiple operations in sequence', async () => {
      const monorepoDir = path.join(tempDir, 'monorepo');
      const sourceDir = path.join(tempDir, 'source');
      await fs.ensureDir(monorepoDir);
      await fs.ensureDir(sourceDir);
      await fs.writeJson(path.join(monorepoDir, 'package.json'), {
        name: 'monorepo',
        workspaces: ['packages/*'],
      });
      await fs.writeFile(path.join(sourceDir, 'lib.ts'), 'export default {};');

      const plan: AddPlan = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        sourceRepo: { type: 'local', original: sourceDir, resolved: sourceDir, name: 'lib' },
        targetMonorepo: monorepoDir,
        packagesDir: 'packages',
        analysis: {
          packages: [],
          conflicts: [],
          collisions: [],
          crossDependencies: [],
          complexityScore: 0,
          recommendations: [],
        },
        decisions: [],
        operations: [
          {
            id: 'copy-package',
            type: 'copy',
            description: 'Copy lib to packages/lib',
            inputs: [sourceDir],
            outputs: ['packages/lib'],
          },
          {
            id: 'update-root-pkg',
            type: 'write',
            description: 'Update root package.json',
            inputs: ['package.json'],
            outputs: ['package.json'],
          },
          {
            id: 'install-deps',
            type: 'exec',
            description: 'Install dependencies',
            inputs: [],
            outputs: ['node_modules'],
          },
        ],
      };

      const logger = mockLogger();
      const result = await applyAddPlan(plan, logger);

      expect(result.success).toBe(true);
      expect(result.packageDir).toBe(path.join(monorepoDir, 'packages/lib'));
      expect(await fs.pathExists(path.join(monorepoDir, 'packages/lib/lib.ts'))).toBe(true);
    });
  });
});
