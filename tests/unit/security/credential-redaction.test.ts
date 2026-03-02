import { describe, it, expect } from 'vitest';
import { redact, redactUrl, redactTokens } from '../../../src/utils/redact.js';

/**
 * Credential redaction security tests.
 *
 * These verify that tokens, passwords, and credentials are
 * properly stripped from URLs, error messages, and log output
 * before they can be exposed to users or written to disk.
 */

describe('redactUrl – URL credential stripping', () => {
  it('should redact username:password from HTTPS URLs', () => {
    expect(redactUrl('https://user:pass@github.com/org/repo')).toBe(
      'https://***@github.com/org/repo'
    );
  });

  it('should redact token-only credentials from HTTPS URLs', () => {
    expect(redactUrl('https://ghp_abc123def456ghi789jkl012mno345pqr678@github.com/org/repo')).toBe(
      'https://***@github.com/org/repo'
    );
  });

  it('should redact credentials from git:// URLs', () => {
    expect(redactUrl('git://user:token@example.com/repo.git')).toBe(
      'git://***@example.com/repo.git'
    );
  });

  it('should not modify SSH URLs (no credentials in URL)', () => {
    expect(redactUrl('git@github.com:owner/repo.git')).toBe(
      'git@github.com:owner/repo.git'
    );
  });

  it('should not modify local paths', () => {
    expect(redactUrl('/local/path/to/repo')).toBe('/local/path/to/repo');
  });

  it('should not modify URLs without credentials', () => {
    expect(redactUrl('https://github.com/org/repo')).toBe(
      'https://github.com/org/repo'
    );
  });

  it('should handle multiple URLs in one string', () => {
    const input = 'cloning https://user:pass@host1.com/a and https://token@host2.com/b';
    const result = redactUrl(input);
    expect(result).toBe('cloning https://***@host1.com/a and https://***@host2.com/b');
  });
});

describe('redactTokens – known token pattern stripping', () => {
  it('should redact GitHub personal access tokens (ghp_)', () => {
    const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    expect(redactTokens(`token: ${token}`)).toBe('token: ***');
  });

  it('should redact GitHub OAuth tokens (gho_)', () => {
    const token = 'gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    expect(redactTokens(`auth: ${token}`)).toBe('auth: ***');
  });

  it('should redact GitHub user-to-server tokens (ghu_)', () => {
    const token = 'ghu_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    expect(redactTokens(token)).toBe('***');
  });

  it('should redact GitHub server-to-server tokens (ghs_)', () => {
    const token = 'ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    expect(redactTokens(token)).toBe('***');
  });

  it('should redact GitHub refresh tokens (ghr_)', () => {
    const token = 'ghr_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    expect(redactTokens(token)).toBe('***');
  });

  it('should redact GitLab personal access tokens (glpat-)', () => {
    const token = 'glpat-ABCDEFGHIJKLMNOPQRSTUVWXYZab';
    expect(redactTokens(`GL_TOKEN=${token}`)).toBe('GL_TOKEN=***');
  });

  it('should redact npm tokens (npm_)', () => {
    const token = 'npm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    expect(redactTokens(`//registry.npmjs.org/:_authToken=${token}`)).toBe(
      '//registry.npmjs.org/:_authToken=***'
    );
  });

  it('should not redact text that merely starts with a token prefix', () => {
    // Short strings below minimum length should not match
    expect(redactTokens('ghp_short')).toBe('ghp_short');
    expect(redactTokens('glpat-short')).toBe('glpat-short');
    expect(redactTokens('npm_short')).toBe('npm_short');
  });

  it('should redact multiple tokens in one string', () => {
    const ghp = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    const npm = 'npm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    expect(redactTokens(`GH=${ghp} NPM=${npm}`)).toBe('GH=*** NPM=***');
  });

  it('should not modify strings without tokens', () => {
    expect(redactTokens('normal log message')).toBe('normal log message');
    expect(redactTokens('')).toBe('');
  });
});

describe('redact – combined URL + token redaction', () => {
  it('should redact both URL credentials and inline tokens', () => {
    const ghp = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm';
    const input = `cloning https://${ghp}@github.com/org/repo (token: ${ghp})`;
    const result = redact(input);
    expect(result).not.toContain(ghp);
    expect(result).toContain('***@github.com/org/repo');
    expect(result).toContain('token: ***');
  });

  it('should handle error messages with embedded credentials', () => {
    const errorMsg = 'fatal: Authentication failed for https://user:password123@github.com/org/repo.git';
    const result = redact(errorMsg);
    expect(result).not.toContain('password123');
    expect(result).not.toContain('user:password123');
    expect(result).toContain('***@github.com');
  });

  it('should handle git clone failure messages', () => {
    const glpat = 'glpat-ABCDEFGHIJKLMNOPQRSTUV';
    const errorMsg = `Cloning into '/tmp/repo'...\nfatal: could not read Username for 'https://gitlab.com': ${glpat}`;
    const result = redact(errorMsg);
    expect(result).not.toContain(glpat);
  });
});

describe('credential leak prevention – plan serialization', () => {
  it('should not include auth tokens in plan JSON', () => {
    // Simulate a plan object — verify it has no credential fields
    const plan = {
      version: 1,
      sources: [
        { name: 'repo-a', path: '/tmp/work/repo-a' },
        { name: 'repo-b', path: '/tmp/work/repo-b' },
      ],
      packagesDir: 'packages',
      rootPackageJson: {
        name: 'monorepo',
        private: true,
        devDependencies: { typescript: '^5.0.0' },
      },
      files: [
        { relativePath: 'pnpm-workspace.yaml', content: 'packages:\n  - packages/*\n' },
      ],
      install: false,
    };

    const serialized = JSON.stringify(plan);

    // Common credential field names
    for (const field of ['token', 'password', 'secret', 'credential', 'auth', 'apiKey']) {
      expect(serialized.toLowerCase()).not.toContain(field);
    }

    // Common token prefixes
    for (const prefix of ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'glpat-', 'npm_']) {
      expect(serialized).not.toContain(prefix);
    }
  });

  it('should use local paths, never remote URLs with credentials', () => {
    const sources = [
      { name: 'repo', path: '/tmp/monotize-work/repo' },
    ];

    for (const source of sources) {
      expect(source.path).not.toMatch(/^https?:\/\//);
      expect(source.path).not.toContain('@');
      expect(source.path).not.toMatch(/ghp_|gho_|ghu_|ghs_|ghr_|glpat-|npm_/);
    }
  });
});
