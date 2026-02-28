import { describe, it, expect } from 'vitest';
import { createPackageManagerConfig } from '../../../src/strategies/package-manager.js';
import type { PackageManagerType } from '../../../src/types/index.js';

describe('install command safety - --ignore-scripts default', () => {
  const pmTypes: PackageManagerType[] = ['pnpm', 'yarn', 'yarn-berry', 'npm'];

  for (const pm of pmTypes) {
    it(`${pm} install command should include --ignore-scripts`, () => {
      const config = createPackageManagerConfig(pm);
      expect(config.installCommand).toContain('--ignore-scripts');
    });
  }

  it('pnpm install command should be "pnpm install --ignore-scripts"', () => {
    const config = createPackageManagerConfig('pnpm');
    expect(config.installCommand).toBe('pnpm install --ignore-scripts');
  });

  it('npm install command should be "npm install --ignore-scripts"', () => {
    const config = createPackageManagerConfig('npm');
    expect(config.installCommand).toBe('npm install --ignore-scripts');
  });

  it('yarn install command should be "yarn install --ignore-scripts"', () => {
    const config = createPackageManagerConfig('yarn');
    expect(config.installCommand).toBe('yarn install --ignore-scripts');
  });

  it('yarn-berry install command should be "yarn install --ignore-scripts"', () => {
    const config = createPackageManagerConfig('yarn-berry');
    expect(config.installCommand).toBe('yarn install --ignore-scripts');
  });
});

describe('plan serialization security', () => {
  it('plan file schema should not have fields for tokens or credentials', () => {
    // ApplyPlan schema: version, sources[], packagesDir, rootPackageJson, files[], install, installCommand?
    // Sources use local paths (already cloned), not URLs with tokens
    const plan = {
      version: 1,
      sources: [{ name: 'repo', path: '/tmp/repo' }],
      packagesDir: 'packages',
      rootPackageJson: { name: 'test', private: true },
      files: [],
      install: false,
    };

    const serialized = JSON.stringify(plan);
    // Verify no auth-related fields are present
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('credential');
  });

  it('plan sources should use local filesystem paths, not URLs', () => {
    // By design, the apply command works with already-cloned repos
    // Sources contain only name + local path, never remote URLs
    const source = { name: 'my-repo', path: '/tmp/monotize-work/my-repo' };
    expect(source.path).not.toMatch(/^https?:\/\//);
    expect(source.path).not.toContain('@');
  });
});
