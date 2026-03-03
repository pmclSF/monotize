import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { validatePlan } from '../../../src/commands/apply.js';

/**
 * Path traversal security tests.
 *
 * These verify that the application rejects attempts to escape
 * the output directory via ".." sequences, absolute paths, or
 * encoded variants in both plan validation and runtime assertions.
 */

// Re-implement assertPathContained locally so we can test it directly.
// (The real one is a private function in apply.ts — we test it
// indirectly via validatePlan and directly via this equivalent.)
function assertPathContained(base: string, relativePath: string): void {
  const resolved = path.resolve(base, relativePath);
  const normalizedBase = path.resolve(base) + path.sep;
  if (!resolved.startsWith(normalizedBase) && resolved !== path.resolve(base)) {
    throw new Error(`Path traversal detected: "${relativePath}" escapes base directory`);
  }
}

describe('assertPathContained – path traversal prevention', () => {
  const base = '/tmp/monorepo-output';

  it('should allow normal relative paths', () => {
    expect(() => assertPathContained(base, 'packages/my-pkg')).not.toThrow();
    expect(() => assertPathContained(base, 'package.json')).not.toThrow();
    expect(() => assertPathContained(base, 'pnpm-workspace.yaml')).not.toThrow();
    expect(() => assertPathContained(base, '.gitignore')).not.toThrow();
  });

  it('should reject simple "../" traversal', () => {
    expect(() => assertPathContained(base, '../etc/passwd')).toThrow('Path traversal detected');
  });

  it('should reject nested "../" traversal', () => {
    expect(() => assertPathContained(base, '../../etc/shadow')).toThrow('Path traversal detected');
  });

  it('should reject traversal hidden in a deeper path', () => {
    expect(() => assertPathContained(base, 'packages/../../etc/passwd')).toThrow('Path traversal detected');
  });

  it('should reject traversal that goes up and back down', () => {
    // Goes up to /tmp then into "other" — outside our base
    expect(() => assertPathContained(base, '../other/evil')).toThrow('Path traversal detected');
  });

  it('should reject absolute paths', () => {
    expect(() => assertPathContained(base, '/etc/passwd')).toThrow('Path traversal detected');
  });

  it('should allow paths with ".." that resolve inside base', () => {
    // packages/a/../b resolves to packages/b which is still inside base
    expect(() => assertPathContained(base, 'packages/a/../b')).not.toThrow();
  });
});

describe('validatePlan – rejects path traversal in packagesDir', () => {
  function makePlan(overrides: Record<string, unknown> = {}) {
    return {
      version: 1,
      sources: [{ name: 'pkg', path: '/tmp/src/pkg' }],
      packagesDir: 'packages',
      rootPackageJson: { name: 'mono', private: true },
      files: [],
      install: false,
      ...overrides,
    };
  }

  it('should accept normal packagesDir', () => {
    expect(validatePlan(makePlan({ packagesDir: 'packages' }))).toBe(true);
    expect(validatePlan(makePlan({ packagesDir: 'libs' }))).toBe(true);
    expect(validatePlan(makePlan({ packagesDir: 'apps' }))).toBe(true);
  });

  it('should reject packagesDir with ".."', () => {
    expect(validatePlan(makePlan({ packagesDir: '../outside' }))).toBe(false);
    expect(validatePlan(makePlan({ packagesDir: 'packages/../../etc' }))).toBe(false);
  });

  it('should reject absolute packagesDir', () => {
    expect(validatePlan(makePlan({ packagesDir: '/etc' }))).toBe(false);
    expect(validatePlan(makePlan({ packagesDir: '/tmp/evil' }))).toBe(false);
  });
});

describe('validatePlan – rejects path traversal in file relativePaths', () => {
  function makePlanWithFile(relativePath: string) {
    return {
      version: 1,
      sources: [{ name: 'pkg', path: '/tmp/src/pkg' }],
      packagesDir: 'packages',
      rootPackageJson: { name: 'mono', private: true },
      files: [{ relativePath, content: 'evil' }],
      install: false,
    };
  }

  it('should accept normal file paths', () => {
    expect(validatePlan(makePlanWithFile('pnpm-workspace.yaml'))).toBe(true);
    expect(validatePlan(makePlanWithFile('.gitignore'))).toBe(true);
    expect(validatePlan(makePlanWithFile('README.md'))).toBe(true);
    expect(validatePlan(makePlanWithFile('.github/workflows/ci.yml'))).toBe(true);
  });

  it('should reject file paths with ".."', () => {
    expect(validatePlan(makePlanWithFile('../.bashrc'))).toBe(false);
    expect(validatePlan(makePlanWithFile('../../etc/passwd'))).toBe(false);
    expect(validatePlan(makePlanWithFile('packages/../../evil.js'))).toBe(false);
  });

  it('should reject absolute file paths', () => {
    expect(validatePlan(makePlanWithFile('/etc/passwd'))).toBe(false);
    expect(validatePlan(makePlanWithFile('/tmp/evil'))).toBe(false);
  });

  it('should reject file paths among valid ones', () => {
    const plan = {
      version: 1,
      sources: [{ name: 'pkg', path: '/tmp/src/pkg' }],
      packagesDir: 'packages',
      rootPackageJson: { name: 'mono', private: true },
      files: [
        { relativePath: 'pnpm-workspace.yaml', content: 'ok' },
        { relativePath: '../.bashrc', content: 'evil' },
      ],
      install: false,
    };
    expect(validatePlan(plan)).toBe(false);
  });
});

describe('validatePlan – rejects malformed plans', () => {
  it('should reject null', () => {
    expect(validatePlan(null)).toBe(false);
  });

  it('should reject non-object', () => {
    expect(validatePlan('string')).toBe(false);
    expect(validatePlan(42)).toBe(false);
    expect(validatePlan(true)).toBe(false);
  });

  it('should reject wrong version', () => {
    expect(validatePlan({ version: 2 })).toBe(false);
    expect(validatePlan({ version: 0 })).toBe(false);
  });

  it('should reject empty sources', () => {
    expect(validatePlan({
      version: 1,
      sources: [],
      packagesDir: 'packages',
      rootPackageJson: {},
      files: [],
      install: false,
    })).toBe(false);
  });

  it('should reject sources with missing name or path', () => {
    expect(validatePlan({
      version: 1,
      sources: [{ name: 'pkg' }], // missing path
      packagesDir: 'packages',
      rootPackageJson: {},
      files: [],
      install: false,
    })).toBe(false);

    expect(validatePlan({
      version: 1,
      sources: [{ path: '/tmp/pkg' }], // missing name
      packagesDir: 'packages',
      rootPackageJson: {},
      files: [],
      install: false,
    })).toBe(false);
  });

  it('should reject files with missing relativePath or content', () => {
    expect(validatePlan({
      version: 1,
      sources: [{ name: 'pkg', path: '/tmp/pkg' }],
      packagesDir: 'packages',
      rootPackageJson: {},
      files: [{ content: 'ok' }], // missing relativePath
      install: false,
    })).toBe(false);

    expect(validatePlan({
      version: 1,
      sources: [{ name: 'pkg', path: '/tmp/pkg' }],
      packagesDir: 'packages',
      rootPackageJson: {},
      files: [{ relativePath: 'README.md' }], // missing content
      install: false,
    })).toBe(false);
  });
});
