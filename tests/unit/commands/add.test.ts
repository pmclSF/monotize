import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { generateAddPlan } from '../../../src/strategies/add.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import { createMockLogger } from '../../helpers/mocks.js';

describe('add command / generateAddPlan', () => {
  const logger = createMockLogger();

  afterEach(async () => {
    await cleanupFixtures();
    vi.restoreAllMocks();
  });

  it('should generate an AddPlan from a local repo', async () => {
    // Create a fake monorepo target
    const targetPath = await createTempFixture({
      name: 'monorepo-target',
      packageJson: {
        name: 'test-monorepo',
        private: true,
        workspaces: ['packages/*'],
      },
      directories: ['packages/existing-pkg'],
      files: {
        'packages/existing-pkg/package.json': JSON.stringify({
          name: 'existing-pkg',
          version: '1.0.0',
          dependencies: { lodash: '^4.17.21' },
        }),
      },
    });

    // Create a source repo to add
    const sourcePath = await createTempFixture({
      name: 'new-package',
      packageJson: {
        name: 'new-package',
        version: '1.0.0',
        dependencies: { lodash: '^4.17.20' },
      },
      files: {
        'src/index.ts': 'export const hello = "world";',
      },
    });

    const plan = await generateAddPlan(sourcePath, {
      to: targetPath,
      packagesDir: 'packages',
      conflictStrategy: 'highest',
      packageManager: 'pnpm',
    }, logger);

    expect(plan.schemaVersion).toBe(1);
    expect(plan.sourceRepo).toBeDefined();
    expect(plan.sourceRepo.name).toContain('new-package');
    expect(plan.targetMonorepo).toBe(targetPath);
    expect(plan.packagesDir).toBe('packages');
    expect(plan.operations.length).toBeGreaterThan(0);
    expect(plan.operations[0].type).toBe('copy');
    expect(plan.createdAt).toBeDefined();
  });

  it('should throw if target monorepo does not exist', async () => {
    const sourcePath = await createTempFixture({
      name: 'some-repo',
      packageJson: { name: 'some-repo', version: '1.0.0' },
    });

    await expect(
      generateAddPlan(sourcePath, {
        to: '/nonexistent/path',
        packagesDir: 'packages',
        conflictStrategy: 'highest',
        packageManager: 'pnpm',
      }, logger),
    ).rejects.toThrow('Target monorepo does not exist');
  });

  it('should throw if target has no package.json', async () => {
    const targetPath = await createTempFixture({
      name: 'no-pkg-target',
      directories: ['packages'],
    });

    const sourcePath = await createTempFixture({
      name: 'some-repo',
      packageJson: { name: 'some-repo', version: '1.0.0' },
    });

    await expect(
      generateAddPlan(sourcePath, {
        to: targetPath,
        packagesDir: 'packages',
        conflictStrategy: 'highest',
        packageManager: 'pnpm',
      }, logger),
    ).rejects.toThrow('No package.json found');
  });
});
