import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import { validatePlan, findStagingDirs } from '../../../src/commands/apply.js';
import { computePlanHash } from '../../../src/utils/operation-log.js';

describe('apply command - validatePlan', () => {
  const validPlan = {
    version: 1,
    sources: [{ name: 'repo-a', path: '/tmp/repo-a' }],
    packagesDir: 'packages',
    rootPackageJson: { name: 'test', private: true },
    files: [{ relativePath: 'README.md', content: '# Test' }],
    install: false,
  };

  it('should accept a valid plan', () => {
    expect(validatePlan(validPlan)).toBe(true);
  });

  it('should accept a plan with install enabled and installCommand', () => {
    expect(
      validatePlan({ ...validPlan, install: true, installCommand: 'pnpm install' })
    ).toBe(true);
  });

  it('should accept a plan with multiple sources', () => {
    expect(
      validatePlan({
        ...validPlan,
        sources: [
          { name: 'repo-a', path: '/tmp/a' },
          { name: 'repo-b', path: '/tmp/b' },
        ],
      })
    ).toBe(true);
  });

  it('should accept a plan with empty files array', () => {
    expect(validatePlan({ ...validPlan, files: [] })).toBe(true);
  });

  it('should reject null', () => {
    expect(validatePlan(null)).toBe(false);
  });

  it('should reject non-object', () => {
    expect(validatePlan('string')).toBe(false);
  });

  it('should reject wrong version', () => {
    expect(validatePlan({ ...validPlan, version: 2 })).toBe(false);
  });

  it('should reject missing version', () => {
    const { version, ...noVersion } = validPlan;
    expect(validatePlan(noVersion)).toBe(false);
  });

  it('should reject empty sources array', () => {
    expect(validatePlan({ ...validPlan, sources: [] })).toBe(false);
  });

  it('should reject source missing name', () => {
    expect(
      validatePlan({ ...validPlan, sources: [{ path: '/tmp/a' }] })
    ).toBe(false);
  });

  it('should reject source missing path', () => {
    expect(
      validatePlan({ ...validPlan, sources: [{ name: 'a' }] })
    ).toBe(false);
  });

  it('should reject missing packagesDir', () => {
    const { packagesDir, ...noPkgDir } = validPlan;
    expect(validatePlan(noPkgDir)).toBe(false);
  });

  it('should reject null rootPackageJson', () => {
    expect(validatePlan({ ...validPlan, rootPackageJson: null })).toBe(false);
  });

  it('should reject missing install field', () => {
    const { install, ...noInstall } = validPlan;
    expect(validatePlan(noInstall)).toBe(false);
  });

  it('should reject file entry missing relativePath', () => {
    expect(
      validatePlan({ ...validPlan, files: [{ content: 'hi' }] })
    ).toBe(false);
  });

  it('should reject file entry missing content', () => {
    expect(
      validatePlan({ ...validPlan, files: [{ relativePath: 'x.txt' }] })
    ).toBe(false);
  });
});

describe('apply command - findStagingDirs', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `staging-test-${crypto.randomBytes(8).toString('hex')}`
    );
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  it('should find matching staging directories', async () => {
    const outputDir = path.join(tempDir, 'monorepo');
    await fs.ensureDir(path.join(tempDir, 'monorepo.staging-abcd1234'));
    await fs.ensureDir(path.join(tempDir, 'monorepo.staging-ef567890'));

    const dirs = await findStagingDirs(outputDir);
    expect(dirs).toHaveLength(2);
    expect(dirs.map((d) => path.basename(d)).sort()).toEqual([
      'monorepo.staging-abcd1234',
      'monorepo.staging-ef567890',
    ]);
  });

  it('should not match non-staging directories', async () => {
    const outputDir = path.join(tempDir, 'monorepo');
    await fs.ensureDir(path.join(tempDir, 'monorepo'));
    await fs.ensureDir(path.join(tempDir, 'monorepo-other'));
    await fs.ensureDir(path.join(tempDir, 'monorepo.staging-toolong1234'));

    const dirs = await findStagingDirs(outputDir);
    expect(dirs).toHaveLength(0);
  });

  it('should return empty array when parent dir does not exist', async () => {
    const dirs = await findStagingDirs(path.join(tempDir, 'nonexistent', 'out'));
    expect(dirs).toEqual([]);
  });
});

describe('apply command - computePlanHash', () => {
  it('should produce deterministic hashes', () => {
    const plan = JSON.stringify({ version: 1, sources: [] });
    expect(computePlanHash(plan)).toBe(computePlanHash(plan));
  });

  it('should produce 64-char hex strings (SHA-256)', () => {
    expect(computePlanHash('test')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should differ for different inputs', () => {
    expect(computePlanHash('plan-a')).not.toBe(computePlanHash('plan-b'));
  });
});
