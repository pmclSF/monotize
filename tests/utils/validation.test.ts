import { describe, it, expect } from 'vitest';
import { parseRepoSource, validateRepoSources, isValidPackageName, sanitizePackageName } from '../../src/utils/validation.js';

describe('parseRepoSource', () => {
  it('should parse GitHub shorthand', () => {
    const result = parseRepoSource('owner/repo');
    expect(result.type).toBe('github');
    expect(result.resolved).toBe('https://github.com/owner/repo.git');
    expect(result.name).toBe('repo');
  });

  it('should parse GitLab shorthand', () => {
    const result = parseRepoSource('gitlab:owner/repo');
    expect(result.type).toBe('gitlab');
    expect(result.resolved).toBe('https://gitlab.com/owner/repo.git');
    expect(result.name).toBe('repo');
  });

  it('should parse GitHub HTTPS URL', () => {
    const result = parseRepoSource('https://github.com/owner/my-repo.git');
    expect(result.type).toBe('github');
    expect(result.resolved).toBe('https://github.com/owner/my-repo.git');
    expect(result.name).toBe('my-repo');
  });

  it('should parse GitLab HTTPS URL', () => {
    const result = parseRepoSource('https://gitlab.com/owner/my-repo.git');
    expect(result.type).toBe('gitlab');
    expect(result.resolved).toBe('https://gitlab.com/owner/my-repo.git');
    expect(result.name).toBe('my-repo');
  });

  it('should parse local paths', () => {
    const result = parseRepoSource('./my-local-repo');
    expect(result.type).toBe('local');
    expect(result.name).toBe('my-local-repo');
    expect(result.resolved).toContain('my-local-repo');
  });

  it('should parse absolute local paths', () => {
    const result = parseRepoSource('/Users/test/my-repo');
    expect(result.type).toBe('local');
    expect(result.name).toBe('my-repo');
    expect(result.resolved).toBe('/Users/test/my-repo');
  });

  it('should handle repos with .git suffix', () => {
    const result = parseRepoSource('owner/repo.git');
    expect(result.name).toBe('repo');
  });

  it('should trim whitespace', () => {
    const result = parseRepoSource('  owner/repo  ');
    expect(result.original).toBe('owner/repo');
  });
});

describe('validateRepoSources', () => {
  it('should return error for empty input', async () => {
    const result = await validateRepoSources([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one repository is required');
  });

  it('should validate multiple sources', async () => {
    const result = await validateRepoSources(['owner/repo1', 'owner/repo2']);
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].name).toBe('repo1');
    expect(result.sources[1].name).toBe('repo2');
  });

  it('should handle duplicate names by adding suffix', async () => {
    const result = await validateRepoSources(['owner1/repo', 'owner2/repo']);
    expect(result.sources[0].name).toBe('repo-1');
    expect(result.sources[1].name).toBe('repo-2');
  });

  it('should validate local paths exist', async () => {
    const result = await validateRepoSources(['./tests/fixtures/repo-a']);
    expect(result.valid).toBe(true);
    expect(result.sources).toHaveLength(1);
  });

  it('should report error for non-existent local paths', async () => {
    const result = await validateRepoSources(['./non-existent-path']);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('does not exist');
  });
});

describe('isValidPackageName', () => {
  it('should accept valid package names', () => {
    expect(isValidPackageName('my-package')).toBe(true);
    expect(isValidPackageName('my_package')).toBe(true);
    expect(isValidPackageName('@scope/package')).toBe(true);
    expect(isValidPackageName('package123')).toBe(true);
  });

  it('should reject invalid package names', () => {
    expect(isValidPackageName('My-Package')).toBe(false); // uppercase
    expect(isValidPackageName('.hidden')).toBe(false); // starts with dot
  });
});

describe('sanitizePackageName', () => {
  it('should lowercase the name', () => {
    expect(sanitizePackageName('MyPackage')).toBe('mypackage');
  });

  it('should replace invalid characters', () => {
    expect(sanitizePackageName('my package!')).toBe('my-package');
  });

  it('should remove leading dots and dashes', () => {
    expect(sanitizePackageName('...-test')).toBe('test');
  });
});
