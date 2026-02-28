import { describe, it, expect } from 'vitest';
import { redactUrl, redactTokens, redact } from '../../../src/utils/redact.js';

describe('redactUrl', () => {
  it('should redact user:token credentials from HTTPS URLs', () => {
    expect(redactUrl('https://user:ghp_abc123def456@github.com/owner/repo.git'))
      .toBe('https://***@github.com/owner/repo.git');
  });

  it('should redact token-only credentials from HTTPS URLs', () => {
    expect(redactUrl('https://ghp_abc123def456@github.com/owner/repo.git'))
      .toBe('https://***@github.com/owner/repo.git');
  });

  it('should redact x-access-token style credentials', () => {
    expect(redactUrl('https://x-access-token:ghp_abc123def456ghi789jkl012mno345pqr678stu@github.com/owner/repo'))
      .toBe('https://***@github.com/owner/repo');
  });

  it('should leave SSH URLs unchanged', () => {
    expect(redactUrl('git@github.com:owner/repo.git'))
      .toBe('git@github.com:owner/repo.git');
  });

  it('should leave local paths unchanged', () => {
    expect(redactUrl('/home/user/repos/my-project'))
      .toBe('/home/user/repos/my-project');
  });

  it('should leave plain HTTPS URLs unchanged', () => {
    expect(redactUrl('https://github.com/owner/repo.git'))
      .toBe('https://github.com/owner/repo.git');
  });

  it('should handle git:// protocol with credentials', () => {
    expect(redactUrl('git://user:pass@example.com/repo.git'))
      .toBe('git://***@example.com/repo.git');
  });

  it('should handle empty string', () => {
    expect(redactUrl('')).toBe('');
  });
});

describe('redactTokens', () => {
  it('should redact GitHub PATs (ghp_)', () => {
    expect(redactTokens('Token is ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678901'))
      .toBe('Token is ***');
  });

  it('should redact GitLab PATs (glpat-)', () => {
    expect(redactTokens('Token is glpat-abcdefghijklmnopqrst'))
      .toBe('Token is ***');
  });

  it('should redact npm tokens (npm_)', () => {
    expect(redactTokens('Token is npm_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678901'))
      .toBe('Token is ***');
  });

  it('should redact multiple tokens in one string', () => {
    const input = 'first: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678901, second: ghp_ZyXwVuTsRqPoNmLkJiHgFeDcBa012345678901';
    const result = redactTokens(input);
    expect(result).not.toContain('ghp_');
    expect(result).toBe('first: ***, second: ***');
  });

  it('should leave strings without tokens unchanged', () => {
    expect(redactTokens('No tokens here, just regular text'))
      .toBe('No tokens here, just regular text');
  });

  it('should not match short strings that look like token prefixes', () => {
    expect(redactTokens('ghp_short')).toBe('ghp_short');
  });
});

describe('redact', () => {
  it('should redact both URL credentials and tokens', () => {
    const input = 'Clone https://x-access-token:ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678901@github.com/o/r failed';
    const result = redact(input);
    expect(result).not.toContain('ghp_');
    expect(result).toContain('***@github.com');
  });

  it('should handle string with no sensitive data', () => {
    expect(redact('Just a plain message')).toBe('Just a plain message');
  });
});
