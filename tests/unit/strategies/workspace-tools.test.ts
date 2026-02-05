import { describe, it, expect } from 'vitest';
import {
  generateTurboConfig,
  generateNxConfig,
  generateWorkspaceToolConfig,
  getWorkspaceToolDependencies,
  updateScriptsForWorkspaceTool,
} from '../../../src/strategies/workspace-tools.js';
import type { PackageInfo } from '../../../src/types/index.js';

const createMockPackage = (
  name: string,
  scripts: Record<string, string> = {}
): PackageInfo => ({
  name,
  version: '1.0.0',
  dependencies: {},
  devDependencies: {},
  peerDependencies: {},
  scripts,
  path: `/packages/${name}`,
  repoName: name,
});

describe('workspace-tools', () => {
  describe('generateTurboConfig', () => {
    it('should generate basic turbo config with available scripts', () => {
      const packages = [
        createMockPackage('pkg-a', { build: 'tsc', test: 'vitest' }),
        createMockPackage('pkg-b', { build: 'tsc', lint: 'eslint .' }),
      ];

      const config = generateTurboConfig(packages);

      expect(config.$schema).toBe('https://turbo.build/schema.json');
      expect(config.tasks).toBeDefined();
      expect(config.tasks.build).toBeDefined();
      expect(config.tasks.test).toBeDefined();
      expect(config.tasks.lint).toBeDefined();
    });

    it('should set correct dependencies for build tasks', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const config = generateTurboConfig(packages);

      expect(config.tasks.build?.dependsOn).toContain('^build');
    });

    it('should set outputs for build tasks', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const config = generateTurboConfig(packages);

      expect(config.tasks.build?.outputs).toBeDefined();
      expect(config.tasks.build?.outputs).toContain('dist/**');
    });

    it('should disable cache for dev and start tasks', () => {
      const packages = [
        createMockPackage('pkg-a', { dev: 'vite', start: 'node .' }),
      ];

      const config = generateTurboConfig(packages);

      expect(config.tasks.dev?.cache).toBe(false);
      expect(config.tasks.dev?.persistent).toBe(true);
      expect(config.tasks.start?.cache).toBe(false);
    });

    it('should only include scripts that exist in packages', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const config = generateTurboConfig(packages);

      expect(config.tasks.build).toBeDefined();
      expect(config.tasks.test).toBeUndefined();
      expect(config.tasks.lint).toBeUndefined();
    });

    it('should handle empty packages array', () => {
      const config = generateTurboConfig([]);

      expect(config.tasks).toEqual({});
    });
  });

  describe('generateNxConfig', () => {
    it('should generate basic nx config with available scripts', () => {
      const packages = [
        createMockPackage('pkg-a', { build: 'tsc', test: 'vitest' }),
        createMockPackage('pkg-b', { build: 'tsc', lint: 'eslint .' }),
      ];

      const config = generateNxConfig(packages);

      expect(config.$schema).toBe('https://nx.dev/reference/nx-json');
      expect(config.targetDefaults).toBeDefined();
      expect(config.targetDefaults.build).toBeDefined();
      expect(config.targetDefaults.test).toBeDefined();
    });

    it('should include named inputs', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const config = generateNxConfig(packages);

      expect(config.namedInputs).toBeDefined();
      expect(config.namedInputs?.production).toBeDefined();
      expect(config.namedInputs?.default).toBeDefined();
    });

    it('should set outputs with projectRoot prefix', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const config = generateNxConfig(packages);

      const outputs = config.targetDefaults.build?.outputs;
      expect(outputs).toBeDefined();
      expect(outputs?.some((o) => o.startsWith('{projectRoot}/'))).toBe(true);
    });

    it('should set cache to false for dev tasks', () => {
      const packages = [createMockPackage('pkg-a', { dev: 'vite' })];

      const config = generateNxConfig(packages);

      expect(config.targetDefaults.dev?.cache).toBe(false);
    });

    it('should set defaultBase to main', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const config = generateNxConfig(packages);

      expect(config.defaultBase).toBe('main');
    });
  });

  describe('generateWorkspaceToolConfig', () => {
    it('should generate turbo.json for turbo tool', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const result = generateWorkspaceToolConfig(packages, 'turbo');

      expect(result).not.toBeNull();
      expect(result?.filename).toBe('turbo.json');
      expect(result?.content).toContain('"$schema"');
      expect(result?.content).toContain('turbo.build');
    });

    it('should generate nx.json for nx tool', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const result = generateWorkspaceToolConfig(packages, 'nx');

      expect(result).not.toBeNull();
      expect(result?.filename).toBe('nx.json');
      expect(result?.content).toContain('"$schema"');
      expect(result?.content).toContain('nx.dev');
    });

    it('should return null for none tool', () => {
      const packages = [createMockPackage('pkg-a', { build: 'tsc' })];

      const result = generateWorkspaceToolConfig(packages, 'none');

      expect(result).toBeNull();
    });
  });

  describe('getWorkspaceToolDependencies', () => {
    it('should return turbo dependency for turbo tool', () => {
      const deps = getWorkspaceToolDependencies('turbo');

      expect(deps.turbo).toBeDefined();
      expect(deps.turbo).toMatch(/^\^/);
    });

    it('should return nx dependency for nx tool', () => {
      const deps = getWorkspaceToolDependencies('nx');

      expect(deps.nx).toBeDefined();
      expect(deps.nx).toMatch(/^\^/);
    });

    it('should return empty object for none tool', () => {
      const deps = getWorkspaceToolDependencies('none');

      expect(deps).toEqual({});
    });
  });

  describe('updateScriptsForWorkspaceTool', () => {
    it('should update scripts for turbo', () => {
      const scripts = { build: 'pnpm -r build', test: 'pnpm -r test' };

      const updated = updateScriptsForWorkspaceTool(scripts, 'turbo', [
        'build',
        'test',
      ]);

      expect(updated.build).toBe('turbo run build');
      expect(updated.test).toBe('turbo run test');
    });

    it('should update scripts for nx', () => {
      const scripts = { build: 'pnpm -r build', lint: 'pnpm -r lint' };

      const updated = updateScriptsForWorkspaceTool(scripts, 'nx', [
        'build',
        'lint',
      ]);

      expect(updated.build).toBe('nx run-many --target=build');
      expect(updated.lint).toBe('nx run-many --target=lint');
    });

    it('should not modify scripts for none tool', () => {
      const scripts = { build: 'pnpm -r build' };

      const updated = updateScriptsForWorkspaceTool(scripts, 'none', ['build']);

      expect(updated.build).toBe('pnpm -r build');
    });

    it('should only update available scripts', () => {
      const scripts = { build: 'pnpm -r build', custom: 'custom-cmd' };

      const updated = updateScriptsForWorkspaceTool(scripts, 'turbo', ['build']);

      expect(updated.build).toBe('turbo run build');
      expect(updated.custom).toBe('custom-cmd');
    });
  });
});
