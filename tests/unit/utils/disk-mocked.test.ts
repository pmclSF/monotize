import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing the module under test
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

// Import after mocking
const { checkDiskSpace } = await import('../../../src/utils/disk.js');

describe('checkDiskSpace - mocked branches', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default these tests to Unix branch; windows-specific cases override explicitly.
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('should parse Unix df output correctly', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], cb: (err: null, result: { stdout: string }) => void) => {
        cb(null, {
          stdout:
            'Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/sda1       50000000  20000000  30000000  40% /\n',
        });
      },
    );

    const result = await checkDiskSpace('/tmp');
    expect(result.availableBytes).toBe(30000000 * 1024);
    expect(result.sufficient).toBe(true);
  });

  it('should return insufficient when available < 500MB', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], cb: (err: null, result: { stdout: string }) => void) => {
        cb(null, {
          stdout:
            'Filesystem     1K-blocks  Used Available Use% Mounted on\n/dev/sda1       1000000  800000  200000  80% /\n',
        });
      },
    );

    const result = await checkDiskSpace('/tmp');
    // 200000 KB = 204800000 bytes < 500_000_000
    expect(result.availableBytes).toBe(200000 * 1024);
    expect(result.sufficient).toBe(false);
  });

  it('should handle df output with only header (no data line)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], cb: (err: null, result: { stdout: string }) => void) => {
        cb(null, {
          stdout: 'Filesystem     1K-blocks  Used Available Use% Mounted on\n',
        });
      },
    );

    const result = await checkDiskSpace('/tmp');
    expect(result.availableBytes).toBe(0);
    expect(result.sufficient).toBe(false);
  });

  it('should return fallback on execFile error', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], cb: (err: Error) => void) => {
        cb(new Error('Command failed'));
      },
    );

    const result = await checkDiskSpace('/bad/path');
    expect(result.availableBytes).toBe(-1);
    expect(result.sufficient).toBe(true);
  });

  it('should handle win32 platform with wmic output', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], cb: (err: null, result: { stdout: string }) => void) => {
        cb(null, { stdout: '\r\nFreeSpace=50000000000\r\n\r\n' });
      },
    );

    const result = await checkDiskSpace('C:\\Users');
    expect(result.availableBytes).toBe(50000000000);
    expect(result.sufficient).toBe(true);

  });

  it('should handle win32 platform with no match in wmic output', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], cb: (err: null, result: { stdout: string }) => void) => {
        cb(null, { stdout: 'unexpected output\r\n' });
      },
    );

    const result = await checkDiskSpace('C:\\Users');
    expect(result.availableBytes).toBe(0);
    expect(result.sufficient).toBe(false);

  });
});
