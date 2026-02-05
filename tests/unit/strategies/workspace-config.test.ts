import { describe, it, expect } from 'vitest';
import {
  generateWorkspaceConfig,
  updatePackageForWorkspace,
  generatePnpmWorkspaceYaml,
} from '../../../src/strategies/workspace-config.js';
import type { PackageInfo } from '../../../src/types/index.js';

describe('Workspace Configuration', () => {
  describe('generateWorkspaceConfig', () => {
    const createPackageInfo = (
      name: string,
      overrides: Partial<PackageInfo> = {}
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

    it('should generate basic workspace config', () => {
      const packages = [createPackageInfo('pkg-a'), createPackageInfo('pkg-b')];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      expect(config.rootPackageJson.name).toBe('monorepo');
      expect(config.rootPackageJson.private).toBe(true);
      expect(config.pnpmWorkspace.packages).toContain('packages/*');
    });

    it('should use custom root name', () => {
      const packages = [createPackageInfo('pkg')];

      const config = generateWorkspaceConfig(packages, {
        rootName: 'my-monorepo',
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      expect(config.rootPackageJson.name).toBe('my-monorepo');
    });

    it('should aggregate common scripts', () => {
      const packages = [
        createPackageInfo('pkg-a', {
          scripts: { build: 'tsc', test: 'vitest', custom: 'echo custom' },
        }),
        createPackageInfo('pkg-b', {
          scripts: { build: 'rollup', lint: 'eslint' },
        }),
      ];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      const scripts = config.rootPackageJson.scripts as Record<string, string>;
      // Common scripts get aggregated
      expect(scripts.build).toBe('pnpm -r build');
      expect(scripts.test).toBe('pnpm -r test');
      expect(scripts.lint).toBe('pnpm -r lint');
    });

    it('should create per-package script prefixes', () => {
      const packages = [
        createPackageInfo('pkg-a', {
          scripts: { build: 'tsc', special: 'do-special' },
        }),
      ];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      const scripts = config.rootPackageJson.scripts as Record<string, string>;
      expect(scripts['pkg-a:build']).toBe('pnpm --filter pkg-a build');
      expect(scripts['pkg-a:special']).toBe('pnpm --filter pkg-a special');
    });

    it('should handle script conflicts gracefully', () => {
      const packages = [
        createPackageInfo('pkg-a', {
          scripts: { build: 'tsc', start: 'node dist/index.js' },
        }),
        createPackageInfo('pkg-b', {
          scripts: { build: 'rollup', start: 'node server.js' },
        }),
      ];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      const scripts = config.rootPackageJson.scripts as Record<string, string>;
      // Both have build script, so aggregated
      expect(scripts.build).toBe('pnpm -r build');
      // Both have start, so aggregated
      expect(scripts.start).toBe('pnpm -r start');
      // Individual scripts still available
      expect(scripts['pkg-a:build']).toBe('pnpm --filter pkg-a build');
      expect(scripts['pkg-b:build']).toBe('pnpm --filter pkg-b build');
    });

    it('should handle empty packages array', () => {
      const config = generateWorkspaceConfig([], {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      expect(config.rootPackageJson.name).toBe('monorepo');
      expect(config.rootPackageJson.scripts).toEqual({});
    });

    it('should include resolved dependencies', () => {
      const packages = [createPackageInfo('pkg')];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: { lodash: '^4.17.21', axios: '^1.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      });

      expect(config.rootPackageJson.dependencies).toEqual({
        lodash: '^4.17.21',
        axios: '^1.0.0',
      });
      expect(config.rootPackageJson.devDependencies).toEqual({
        typescript: '^5.0.0',
      });
    });

    it('should omit empty dependencies objects', () => {
      const packages = [createPackageInfo('pkg')];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      expect(config.rootPackageJson.dependencies).toBeUndefined();
      expect(config.rootPackageJson.devDependencies).toBeUndefined();
    });

    it('should handle scoped package names', () => {
      const packages = [
        createPackageInfo('@scope/pkg-a', {
          scripts: { build: 'tsc' },
        }),
        createPackageInfo('@other/pkg-b', {
          scripts: { test: 'vitest' },
        }),
      ];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      const scripts = config.rootPackageJson.scripts as Record<string, string>;
      expect(scripts['@scope/pkg-a:build']).toBe('pnpm --filter @scope/pkg-a build');
      expect(scripts['@other/pkg-b:test']).toBe('pnpm --filter @other/pkg-b test');
    });

    it('should use custom packages directory', () => {
      const packages = [createPackageInfo('pkg')];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'libs',
        dependencies: {},
        devDependencies: {},
      });

      expect(config.pnpmWorkspace.packages).toContain('libs/*');
    });

    it('should set correct engine requirements', () => {
      const packages = [createPackageInfo('pkg')];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      expect(config.rootPackageJson.engines).toEqual({ node: '>=18' });
    });

    it('should set type to module', () => {
      const packages = [createPackageInfo('pkg')];

      const config = generateWorkspaceConfig(packages, {
        packagesDir: 'packages',
        dependencies: {},
        devDependencies: {},
      });

      expect(config.rootPackageJson.type).toBe('module');
    });
  });

  describe('updatePackageForWorkspace', () => {
    const createPackageInfo = (
      name: string,
      overrides: Partial<PackageInfo> = {}
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

    it('should keep package name and version', () => {
      const pkg = createPackageInfo('my-pkg', { version: '2.0.0' });
      const result = updatePackageForWorkspace(pkg, [pkg]);

      expect(result.name).toBe('my-pkg');
      expect(result.version).toBe('2.0.0');
    });

    it('should convert internal dependencies to workspace protocol', () => {
      const pkgA = createPackageInfo('pkg-a', {
        dependencies: { 'pkg-b': '^1.0.0', lodash: '^4.0.0' },
      });
      const pkgB = createPackageInfo('pkg-b');

      const result = updatePackageForWorkspace(pkgA, [pkgA, pkgB]);

      expect(result.dependencies).toEqual({
        'pkg-b': 'workspace:*',
        lodash: '^4.0.0',
      });
    });

    it('should handle scoped internal packages', () => {
      const pkgA = createPackageInfo('@scope/pkg-a', {
        dependencies: { '@scope/pkg-b': '^1.0.0' },
      });
      const pkgB = createPackageInfo('@scope/pkg-b');

      const result = updatePackageForWorkspace(pkgA, [pkgA, pkgB]);

      expect(result.dependencies).toEqual({
        '@scope/pkg-b': 'workspace:*',
      });
    });

    it('should preserve scripts', () => {
      const pkg = createPackageInfo('pkg', {
        scripts: { build: 'tsc', test: 'vitest' },
      });

      const result = updatePackageForWorkspace(pkg, [pkg]);

      expect(result.scripts).toEqual({ build: 'tsc', test: 'vitest' });
    });

    it('should omit empty scripts', () => {
      const pkg = createPackageInfo('pkg', { scripts: {} });

      const result = updatePackageForWorkspace(pkg, [pkg]);

      expect(result.scripts).toBeUndefined();
    });

    it('should handle devDependencies with internal packages', () => {
      const pkgA = createPackageInfo('pkg-a', {
        devDependencies: { 'pkg-b': '^1.0.0', typescript: '^5.0.0' },
      });
      const pkgB = createPackageInfo('pkg-b');

      const result = updatePackageForWorkspace(pkgA, [pkgA, pkgB]);

      expect(result.devDependencies).toEqual({
        'pkg-b': 'workspace:*',
        typescript: '^5.0.0',
      });
    });

    it('should preserve peerDependencies as-is', () => {
      const pkg = createPackageInfo('pkg', {
        peerDependencies: { react: '^18.0.0' },
      });

      const result = updatePackageForWorkspace(pkg, [pkg]);

      expect(result.peerDependencies).toEqual({ react: '^18.0.0' });
    });

    it('should handle package with no dependencies', () => {
      const pkg = createPackageInfo('standalone');

      const result = updatePackageForWorkspace(pkg, [pkg]);

      expect(result.name).toBe('standalone');
      expect(result.dependencies).toBeUndefined();
      expect(result.devDependencies).toBeUndefined();
    });
  });

  describe('generatePnpmWorkspaceYaml', () => {
    it('should generate correct YAML content', () => {
      const content = generatePnpmWorkspaceYaml('packages');

      expect(content).toBe("packages:\n  - 'packages/*'\n");
    });

    it('should handle custom directory name', () => {
      const content = generatePnpmWorkspaceYaml('libs');

      expect(content).toBe("packages:\n  - 'libs/*'\n");
    });

    it('should handle directory with dash', () => {
      const content = generatePnpmWorkspaceYaml('my-packages');

      expect(content).toBe("packages:\n  - 'my-packages/*'\n");
    });
  });
});
