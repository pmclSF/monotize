import { describe, it, expect, afterEach } from 'vitest';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import {
  generateOverrides,
  getOverridesKey,
  normalizeToWorkspaceProtocol,
  applyOverridesToPackageJson,
  verifyEnforcement,
} from '../../../src/strategies/dependency-enforcement.js';
import type {
  DependencyConflict,
  PlanDecision,
  PackageInfo,
  PackageManagerType,
} from '../../../src/types/index.js';

const createPackageInfo = (
  name: string,
  overrides: Partial<PackageInfo> = {},
): PackageInfo => ({
  name,
  version: '1.0.0',
  dependencies: {},
  devDependencies: {},
  peerDependencies: {},
  scripts: {},
  path: `/packages/${name}`,
  repoName: name,
  ...overrides,
});

describe('Dependency Enforcement', () => {
  afterEach(async () => {
    await cleanupFixtures();
  });

  describe('generateOverrides', () => {
    it('should produce correct overrides from conflicts and decisions', () => {
      const conflicts: DependencyConflict[] = [
        {
          name: 'lodash',
          versions: [
            { version: '^4.17.20', source: 'repo-a', type: 'dependencies' },
            { version: '^4.17.21', source: 'repo-b', type: 'dependencies' },
          ],
          severity: 'minor',
        },
        {
          name: 'react',
          versions: [
            { version: '^17.0.0', source: 'repo-a', type: 'dependencies' },
            { version: '^18.0.0', source: 'repo-b', type: 'dependencies' },
          ],
          severity: 'major',
        },
      ];

      const decisions: PlanDecision[] = [
        {
          id: 'dep-lodash',
          kind: 'version-conflict',
          chosen: '^4.17.21',
          alternatives: ['^4.17.20'],
        },
        {
          id: 'dep-react',
          kind: 'version-conflict',
          chosen: '^18.0.0',
          alternatives: ['^17.0.0'],
        },
      ];

      const result = generateOverrides(conflicts, decisions, 'pnpm');

      expect(result).toEqual({
        lodash: '^4.17.21',
        react: '^18.0.0',
      });
    });

    it('should fall back to the first version when no decision matches', () => {
      const conflicts: DependencyConflict[] = [
        {
          name: 'typescript',
          versions: [
            { version: '^5.0.0', source: 'repo-a', type: 'devDependencies' },
            { version: '^4.9.0', source: 'repo-b', type: 'devDependencies' },
          ],
          severity: 'major',
        },
      ];

      const decisions: PlanDecision[] = [
        {
          id: 'dep-unrelated',
          kind: 'version-conflict',
          chosen: '^1.0.0',
          alternatives: [],
        },
      ];

      const result = generateOverrides(conflicts, decisions, 'npm');

      expect(result).toEqual({
        typescript: '^5.0.0',
      });
    });
  });

  describe('getOverridesKey', () => {
    it('should return pnpm.overrides for pnpm', () => {
      expect(getOverridesKey('pnpm')).toBe('pnpm.overrides');
    });

    it('should return resolutions for yarn', () => {
      expect(getOverridesKey('yarn')).toBe('resolutions');
    });

    it('should return resolutions for yarn-berry', () => {
      expect(getOverridesKey('yarn-berry')).toBe('resolutions');
    });

    it('should return overrides for npm', () => {
      expect(getOverridesKey('npm')).toBe('overrides');
    });
  });

  describe('normalizeToWorkspaceProtocol', () => {
    it('should generate update entries with workspace protocol for internal deps', () => {
      const packages: PackageInfo[] = [
        createPackageInfo('pkg-a', {
          dependencies: { 'pkg-b': '^1.0.0' },
        }),
        createPackageInfo('pkg-b', {
          dependencies: { lodash: '^4.17.21' },
        }),
      ];

      const updates = normalizeToWorkspaceProtocol({}, packages, 'workspace:*');

      expect(updates).toEqual([
        {
          packageName: 'pkg-a',
          dependency: 'pkg-b',
          from: '^1.0.0',
          to: 'workspace:*',
        },
      ]);
    });

    it('should skip dependencies already using workspace protocol', () => {
      const packages: PackageInfo[] = [
        createPackageInfo('pkg-a', {
          dependencies: { 'pkg-b': 'workspace:*' },
        }),
        createPackageInfo('pkg-b'),
      ];

      const updates = normalizeToWorkspaceProtocol({}, packages, 'workspace:*');

      expect(updates).toEqual([]);
    });
  });

  describe('applyOverridesToPackageJson', () => {
    it('should nest overrides under pnpm.overrides for pnpm', () => {
      const rootPkgJson = { name: 'monorepo', version: '1.0.0' };
      const overrides = { lodash: '^4.17.21' };

      const result = applyOverridesToPackageJson(rootPkgJson, overrides, 'pnpm');

      expect(result.pnpm).toEqual({ overrides: { lodash: '^4.17.21' } });
    });

    it('should place overrides at top level for npm', () => {
      const rootPkgJson = { name: 'monorepo', version: '1.0.0' };
      const overrides = { react: '^18.0.0' };

      const result = applyOverridesToPackageJson(rootPkgJson, overrides, 'npm');

      expect(result.overrides).toEqual({ react: '^18.0.0' });
      expect(result).not.toHaveProperty('pnpm');
    });

    it('should place resolutions at top level for yarn', () => {
      const rootPkgJson = { name: 'monorepo', version: '1.0.0' };
      const overrides = { react: '^18.0.0' };

      const result = applyOverridesToPackageJson(rootPkgJson, overrides, 'yarn');

      expect(result.resolutions).toEqual({ react: '^18.0.0' });
    });
  });

  describe('verifyEnforcement', () => {
    it('should return a pass check when pnpm overrides are present', async () => {
      const fixturePath = await createTempFixture({
        name: 'enforcement-pass',
        packageJson: {
          name: 'monorepo',
          version: '1.0.0',
          pnpm: {
            overrides: {
              lodash: '^4.17.21',
            },
          },
        },
      });

      const checks = await verifyEnforcement(fixturePath, 'pnpm');

      expect(checks).toHaveLength(1);
      expect(checks[0].status).toBe('pass');
      expect(checks[0].id).toBe('enforcement-overrides-present');
    });

    it('should return a warn check when overrides are missing', async () => {
      const fixturePath = await createTempFixture({
        name: 'enforcement-warn',
        packageJson: {
          name: 'monorepo',
          version: '1.0.0',
        },
      });

      const checks = await verifyEnforcement(fixturePath, 'pnpm');

      expect(checks).toHaveLength(1);
      expect(checks[0].status).toBe('warn');
      expect(checks[0].id).toBe('enforcement-overrides-missing');
    });

    it('should return a fail check when no root package.json exists', async () => {
      const fixturePath = await createTempFixture({
        name: 'enforcement-fail',
        files: {
          'src/index.ts': 'export const x = 1;',
        },
      });

      const checks = await verifyEnforcement(fixturePath, 'pnpm');

      expect(checks).toHaveLength(1);
      expect(checks[0].status).toBe('fail');
      expect(checks[0].id).toBe('enforcement-no-root-pkg');
    });
  });
});
