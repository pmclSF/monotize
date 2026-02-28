import { describe, it, expect } from 'vitest';
import {
  buildUnifiedDiff,
  generateNvmrcPatch,
  generateNodeVersionFilePatch,
  generateEnginesNodePatch,
  generateBuildScriptPatch,
  generatePMFieldPatch,
  generatePatchesForRepo,
} from '../../../src/strategies/prepare-patches.js';
import type { RepoPrepAnalysis } from '../../../src/types/index.js';

describe('buildUnifiedDiff', () => {
  it('should create a new-file diff from /dev/null', () => {
    const result = buildUnifiedDiff('.nvmrc', [], ['20']);
    expect(result).toContain('--- /dev/null');
    expect(result).toContain('+++ b/.nvmrc');
    expect(result).toContain('@@ -0,0 +1,1 @@');
    expect(result).toContain('+20');
  });

  it('should create a single-line replacement diff', () => {
    const result = buildUnifiedDiff('.nvmrc', ['18'], ['20']);
    expect(result).toContain('--- a/.nvmrc');
    expect(result).toContain('+++ b/.nvmrc');
    expect(result).toContain('-18');
    expect(result).toContain('+20');
  });

  it('should create a multi-line diff with context', () => {
    const oldLines = ['{', '  "name": "test",', '  "version": "1.0.0"', '}'];
    const newLines = ['{', '  "name": "test",', '  "version": "1.0.0",', '  "engines": { "node": ">=20" }', '}'];
    const result = buildUnifiedDiff('package.json', oldLines, newLines);
    expect(result).toContain('--- a/package.json');
    expect(result).toContain('+++ b/package.json');
    expect(result).toContain('-  "version": "1.0.0"');
    expect(result).toContain('+  "version": "1.0.0",');
    expect(result).toContain('+  "engines": { "node": ">=20" }');
  });

  it('should return empty string when no changes', () => {
    const result = buildUnifiedDiff('file.txt', ['hello'], ['hello']);
    expect(result).toBe('');
  });

  it('should handle new file with multiple lines', () => {
    const result = buildUnifiedDiff('.nvmrc', [], ['v20', 'lts/*']);
    expect(result).toContain('@@ -0,0 +1,2 @@');
    expect(result).toContain('+v20');
    expect(result).toContain('+lts/*');
  });
});

describe('generateNvmrcPatch', () => {
  it('should return null when .nvmrc already has correct version', () => {
    const result = generateNvmrcPatch('repo-a', '20', '20');
    expect(result).toBeNull();
  });

  it('should return null when .nvmrc has correct version with whitespace', () => {
    const result = generateNvmrcPatch('repo-a', '20\n', '20');
    expect(result).toBeNull();
  });

  it('should create a new-file patch when .nvmrc is missing', () => {
    const result = generateNvmrcPatch('repo-a', null, '20');
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('repo-a/nvmrc.patch');
    expect(result!.repoName).toBe('repo-a');
    expect(result!.targetFile).toBe('.nvmrc');
    expect(result!.patchType).toBe('node-version');
    expect(result!.content).toContain('--- /dev/null');
    expect(result!.content).toContain('+20');
  });

  it('should create a replacement patch for wrong version', () => {
    const result = generateNvmrcPatch('repo-a', '18', '20');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('-18');
    expect(result!.content).toContain('+20');
  });
});

describe('generateNodeVersionFilePatch', () => {
  it('should return null when .node-version already has correct version', () => {
    const result = generateNodeVersionFilePatch('repo-a', '20', '20');
    expect(result).toBeNull();
  });

  it('should create a new-file patch when .node-version is missing', () => {
    const result = generateNodeVersionFilePatch('repo-a', null, '20');
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('repo-a/node-version.patch');
    expect(result!.targetFile).toBe('.node-version');
    expect(result!.patchType).toBe('node-version');
    expect(result!.content).toContain('--- /dev/null');
    expect(result!.content).toContain('+20');
  });

  it('should create a replacement patch for wrong version', () => {
    const result = generateNodeVersionFilePatch('repo-a', '16', '20');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('-16');
    expect(result!.content).toContain('+20');
  });
});

describe('generateEnginesNodePatch', () => {
  it('should return null when engines.node already matches >=target', () => {
    const pkgJson = { name: 'test', engines: { node: '>=20' } };
    const result = generateEnginesNodePatch('repo-a', pkgJson, '20');
    expect(result).toBeNull();
  });

  it('should create a patch when engines.node is missing', () => {
    const pkgJson = { name: 'test', version: '1.0.0' };
    const result = generateEnginesNodePatch('repo-a', pkgJson, '20');
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('repo-a/engines-node.patch');
    expect(result!.targetFile).toBe('package.json');
    expect(result!.patchType).toBe('node-version');
    expect(result!.content).toContain('+');
    expect(result!.content).toContain('>=20');
  });

  it('should create a patch when engines.node has a different range', () => {
    const pkgJson = { name: 'test', engines: { node: '>=16' } };
    const result = generateEnginesNodePatch('repo-a', pkgJson, '20');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('>=20');
  });
});

describe('generateBuildScriptPatch', () => {
  it('should return null when repo already has a build script', () => {
    const pkgJson = { name: 'test', scripts: { build: 'tsc' } };
    const result = generateBuildScriptPatch('repo-a', pkgJson, true);
    expect(result).toBeNull();
  });

  it('should create a patch when build script is missing', () => {
    const pkgJson = { name: 'test', scripts: { test: 'vitest' } };
    const result = generateBuildScriptPatch('repo-a', pkgJson, false);
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('repo-a/build-script.patch');
    expect(result!.targetFile).toBe('package.json');
    expect(result!.patchType).toBe('build-script');
    expect(result!.content).toContain('TODO: add build script');
  });

  it('should create a patch when no scripts exist', () => {
    const pkgJson = { name: 'test' };
    const result = generateBuildScriptPatch('repo-a', pkgJson, false);
    expect(result).not.toBeNull();
    expect(result!.content).toContain('build');
    expect(result!.content).toContain('TODO');
  });
});

describe('generatePMFieldPatch', () => {
  it('should return null when packageManager already matches', () => {
    const pkgJson = { name: 'test', packageManager: 'pnpm@9.0.0' };
    const result = generatePMFieldPatch('repo-a', pkgJson, 'pnpm@9.0.0');
    expect(result).toBeNull();
  });

  it('should create a patch when packageManager is different', () => {
    const pkgJson = { name: 'test', packageManager: 'npm@8.0.0' };
    const result = generatePMFieldPatch('repo-a', pkgJson, 'pnpm@9.0.0');
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('repo-a/package-manager.patch');
    expect(result!.targetFile).toBe('package.json');
    expect(result!.patchType).toBe('package-manager-field');
    expect(result!.content).toContain('pnpm@9.0.0');
  });

  it('should create a patch when packageManager is missing', () => {
    const pkgJson = { name: 'test', version: '1.0.0' };
    const result = generatePMFieldPatch('repo-a', pkgJson, 'pnpm@9.0.0');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('pnpm@9.0.0');
  });
});

describe('generatePatchesForRepo', () => {
  const createAnalysis = (overrides: Partial<RepoPrepAnalysis> = {}): RepoPrepAnalysis => ({
    repoName: 'repo-a',
    repoPath: '/tmp/repo-a',
    nvmrc: null,
    nodeVersion: null,
    enginesNode: null,
    hasBuildScript: false,
    existingBuildScript: null,
    existingPackageManagerField: null,
    packageJson: { name: 'repo-a', version: '1.0.0' },
    ...overrides,
  });

  it('should generate node version patches when target is set', () => {
    const analysis = createAnalysis();
    const patches = generatePatchesForRepo(analysis, { targetNodeVersion: '20' });
    const patchTypes = patches.map((p) => p.targetFile);
    expect(patchTypes).toContain('.nvmrc');
    expect(patchTypes).toContain('.node-version');
    expect(patchTypes).toContain('package.json');
  });

  it('should skip node version patches when no target is set', () => {
    const analysis = createAnalysis();
    const patches = generatePatchesForRepo(analysis, {});
    const nodePatches = patches.filter((p) => p.patchType === 'node-version');
    expect(nodePatches).toHaveLength(0);
  });

  it('should generate build script patch when missing', () => {
    const analysis = createAnalysis({ hasBuildScript: false });
    const patches = generatePatchesForRepo(analysis, {});
    expect(patches.some((p) => p.patchType === 'build-script')).toBe(true);
  });

  it('should not generate build script patch when present', () => {
    const analysis = createAnalysis({ hasBuildScript: true });
    const patches = generatePatchesForRepo(analysis, {});
    expect(patches.some((p) => p.patchType === 'build-script')).toBe(false);
  });

  it('should generate PM field patch when target is set', () => {
    const analysis = createAnalysis();
    const patches = generatePatchesForRepo(analysis, { targetPackageManager: 'pnpm@9.0.0' });
    expect(patches.some((p) => p.patchType === 'package-manager-field')).toBe(true);
  });

  it('should not generate PM field patch when already matching', () => {
    const analysis = createAnalysis({
      existingPackageManagerField: 'pnpm@9.0.0',
      packageJson: { name: 'repo-a', version: '1.0.0', packageManager: 'pnpm@9.0.0' },
    });
    const patches = generatePatchesForRepo(analysis, { targetPackageManager: 'pnpm@9.0.0' });
    expect(patches.some((p) => p.patchType === 'package-manager-field')).toBe(false);
  });
});
