import { describe, it, expect } from 'vitest';
import { generateArchivePlan, generateReadmeDeprecationPatch } from '../../../src/strategies/archive.js';

describe('archive command / generateArchivePlan', () => {
  it('should generate README deprecation patches without a token', () => {
    const patch = generateReadmeDeprecationPatch('my-lib', 'https://github.com/org/monorepo');
    expect(patch).toContain('--- a/README.md');
    expect(patch).toContain('+++ b/README.md');
    expect(patch).toContain('migrated to a monorepo');
    expect(patch).toContain('https://github.com/org/monorepo');
    expect(patch).toContain('my-lib');
  });

  it('should generate an ArchivePlan from repo inputs', async () => {
    const plan = await generateArchivePlan(
      ['owner/repo-a', 'owner/repo-b'],
      'https://github.com/org/monorepo',
    );

    expect(plan.schemaVersion).toBe(1);
    expect(plan.repos).toHaveLength(2);
    expect(plan.repos[0].name).toBe('repo-a');
    expect(plan.repos[1].name).toBe('repo-b');
    expect(plan.monorepoUrl).toBe('https://github.com/org/monorepo');
    expect(plan.repos[0].readmePatch).toContain('migrated to a monorepo');
    expect(plan.apiOperations).toBeUndefined();
  });

  it('should include API operations when tokenFromEnv is true', async () => {
    const plan = await generateArchivePlan(
      ['owner/repo-a'],
      'https://github.com/org/monorepo',
      { tokenFromEnv: true },
    );

    expect(plan.apiOperations).toHaveLength(1);
    expect(plan.apiOperations![0].action).toBe('archive');
  });

  it('should throw for invalid repo sources', async () => {
    await expect(
      generateArchivePlan([], 'https://github.com/org/monorepo'),
    ).rejects.toThrow();
  });
});
