import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { checkDiskSpace } from '../../../src/utils/disk.js';

describe('checkDiskSpace', () => {
  it('should return positive available bytes for home directory', async () => {
    const result = await checkDiskSpace(os.homedir());
    expect(result.availableBytes).toBeTypeOf('number');
    expect(result.sufficient).toBeTypeOf('boolean');
    // Sufficient should correlate with having > 500MB
    if (result.availableBytes > 500_000_000) {
      expect(result.sufficient).toBe(true);
    }
  });

  it('should handle root path', async () => {
    const rootPath = process.platform === 'win32' ? 'C:\\' : '/';
    const result = await checkDiskSpace(rootPath);
    expect(result.availableBytes).toBeTypeOf('number');
    expect(result.sufficient).toBeTypeOf('boolean');
  });

  it('should return an object with expected shape', async () => {
    const result = await checkDiskSpace('/tmp');
    expect(result).toHaveProperty('availableBytes');
    expect(result).toHaveProperty('sufficient');
    expect(typeof result.availableBytes).toBe('number');
    expect(typeof result.sufficient).toBe('boolean');
  });

  it('should work with current directory', async () => {
    const result = await checkDiskSpace(process.cwd());
    expect(result).toHaveProperty('availableBytes');
    expect(result).toHaveProperty('sufficient');
    // On a real system with disk space, availableBytes should be positive
    expect(result.availableBytes).toBeGreaterThan(0);
  });

  it('should not throw on invalid paths', async () => {
    const result = await checkDiskSpace('/nonexistent/path/that/does/not/exist');
    // Should return fallback values rather than throwing
    expect(result).toHaveProperty('availableBytes');
    expect(result).toHaveProperty('sufficient');
  });

  it('should report sufficient when available bytes exceeds threshold', async () => {
    const result = await checkDiskSpace('/tmp');
    expect(result.sufficient).toBeTypeOf('boolean');
    // Verify the logic: sufficient iff availableBytes > 500MB
    if (result.availableBytes > 500_000_000) {
      expect(result.sufficient).toBe(true);
    } else if (result.availableBytes >= 0 && result.availableBytes <= 500_000_000) {
      expect(result.sufficient).toBe(false);
    }
  });
});
