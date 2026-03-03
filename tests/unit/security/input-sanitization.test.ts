import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isValidPackageName,
  sanitizePackageName,
  parseRepoSource,
} from '../../../src/utils/validation.js';

/**
 * Input sanitization security tests.
 *
 * These verify that user-provided inputs (package names, repo paths,
 * URLs) are properly validated and sanitized before use.
 */

describe('isValidPackageName – malicious input rejection', () => {
  it('should reject names with path traversal sequences', () => {
    expect(isValidPackageName('../evil')).toBe(false);
    expect(isValidPackageName('../../etc/passwd')).toBe(false);
    expect(isValidPackageName('packages/../../../tmp')).toBe(false);
  });

  it('should reject names with shell metacharacters', () => {
    expect(isValidPackageName('pkg; rm -rf /')).toBe(false);
    expect(isValidPackageName('pkg$(whoami)')).toBe(false);
    expect(isValidPackageName('pkg`id`')).toBe(false);
    expect(isValidPackageName('pkg | cat /etc/passwd')).toBe(false);
  });

  it('should reject names with HTML/XSS payloads', () => {
    expect(isValidPackageName('<script>alert(1)</script>')).toBe(false);
    expect(isValidPackageName('pkg"><img src=x onerror=alert(1)>')).toBe(false);
  });

  it('should reject names with null bytes', () => {
    expect(isValidPackageName('pkg\x00evil')).toBe(false);
  });

  it('should reject names exceeding 214 characters', () => {
    const longName = 'a'.repeat(215);
    expect(isValidPackageName(longName)).toBe(false);
  });

  it('should reject names with uppercase', () => {
    expect(isValidPackageName('MyPackage')).toBe(false);
    expect(isValidPackageName('ALLCAPS')).toBe(false);
  });

  it('should accept valid scoped package names', () => {
    expect(isValidPackageName('@scope/pkg')).toBe(true);
    expect(isValidPackageName('@my-org/my-pkg')).toBe(true);
  });

  it('should accept valid simple package names', () => {
    expect(isValidPackageName('my-package')).toBe(true);
    expect(isValidPackageName('pkg123')).toBe(true);
    expect(isValidPackageName('my.pkg')).toBe(true);
  });
});

describe('sanitizePackageName – produces safe output', () => {
  it('should lowercase all characters', () => {
    expect(sanitizePackageName('MyPackage')).toBe('mypackage');
    expect(sanitizePackageName('UPPER')).toBe('upper');
  });

  it('should replace invalid characters with dashes', () => {
    expect(sanitizePackageName('pkg name')).toBe('pkg-name');
    expect(sanitizePackageName('pkg@evil')).toBe('pkg-evil');
    expect(sanitizePackageName('pkg;rm')).toBe('pkg-rm');
  });

  it('should strip leading/trailing dots and dashes', () => {
    expect(sanitizePackageName('.evil')).toBe('evil');
    expect(sanitizePackageName('-evil')).toBe('evil');
    expect(sanitizePackageName('...hidden')).toBe('hidden');
  });

  it('should truncate to 214 characters', () => {
    const longInput = 'a'.repeat(300);
    expect(sanitizePackageName(longInput).length).toBeLessThanOrEqual(214);
  });

  it('should neutralize path traversal in names', () => {
    const result = sanitizePackageName('../../../etc/passwd');
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });

  it('should neutralize shell metacharacters in names', () => {
    const result = sanitizePackageName('pkg;rm -rf /');
    expect(result).not.toContain(';');
    expect(result).not.toContain(' ');
  });

  it('should handle empty string', () => {
    const result = sanitizePackageName('');
    expect(result).toBe('');
  });
});

describe('parseRepoSource – safe source parsing', () => {
  it('should classify local paths correctly', () => {
    const localInput = '/tmp/my-repo';
    const source = parseRepoSource(localInput);
    expect(source.type).toBe('local');
    expect(source.resolved).toBe(path.resolve(localInput));
  });

  it('should classify relative paths as local', () => {
    const source = parseRepoSource('./my-repo');
    expect(source.type).toBe('local');
  });

  it('should classify parent-relative paths as local', () => {
    const source = parseRepoSource('../my-repo');
    expect(source.type).toBe('local');
  });

  it('should classify GitHub shorthands correctly', () => {
    const source = parseRepoSource('owner/repo');
    expect(source.type).toBe('github');
    expect(source.resolved).toBe('https://github.com/owner/repo.git');
  });

  it('should classify GitLab shorthands correctly', () => {
    const source = parseRepoSource('gitlab:owner/repo');
    expect(source.type).toBe('gitlab');
    expect(source.resolved).toBe('https://gitlab.com/owner/repo.git');
  });

  it('should extract repo name from HTTPS URLs', () => {
    const source = parseRepoSource('https://github.com/org/my-repo.git');
    expect(source.name).toBe('my-repo');
  });

  it('should extract repo name from SSH URLs', () => {
    const source = parseRepoSource('git@github.com:org/my-repo.git');
    expect(source.name).toBe('my-repo');
  });

  it('should trim whitespace from input', () => {
    const source = parseRepoSource('  /tmp/my-repo  ');
    expect(source.original).toBe('/tmp/my-repo');
  });

  it('should handle input with special characters in path', () => {
    const source = parseRepoSource('/tmp/my repo with spaces');
    expect(source.type).toBe('local');
    expect(source.name).toBe('my repo with spaces');
  });

  it('should produce "unknown" for empty-ish input', () => {
    const source = parseRepoSource('');
    expect(source.name).toBe('unknown');
  });
});

describe('URL handling – no credential inclusion', () => {
  it('should not embed credentials in resolved GitHub URLs', () => {
    const source = parseRepoSource('owner/repo');
    expect(source.resolved).not.toContain('@');
    expect(source.resolved).not.toContain('token');
    expect(source.resolved).toBe('https://github.com/owner/repo.git');
  });

  it('should not embed credentials in resolved GitLab URLs', () => {
    const source = parseRepoSource('gitlab:owner/repo');
    expect(source.resolved).not.toMatch(/\/\/[^/]*@/);
    expect(source.resolved).toBe('https://gitlab.com/owner/repo.git');
  });
});
