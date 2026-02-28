import { describe, it, expect } from 'vitest';
import { checkDiskSpace } from '../../../src/utils/disk.js';

describe('checkDiskSpace', () => {
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

  it('should report sufficient space for paths with available disk', async () => {
    const result = await checkDiskSpace('/tmp');
    // /tmp on any modern system should have more than 500MB
    if (result.availableBytes > 0) {
      expect(result.sufficient).toBe(true);
    }
  });
});
