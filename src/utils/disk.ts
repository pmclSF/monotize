import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Check available disk space at a given path (cross-platform).
 */
export async function checkDiskSpace(
  dirPath: string,
): Promise<{ availableBytes: number; sufficient: boolean; requiredBytes?: number }> {
  try {
    if (process.platform === 'win32') {
      // Use wmic on Windows
      const drive = path.parse(path.resolve(dirPath)).root;
      const { stdout } = await execFileAsync('wmic', [
        'logicaldisk', 'where', `DeviceID='${drive.replace('\\', '')}'`,
        'get', 'FreeSpace', '/format:value',
      ]);
      const match = stdout.match(/FreeSpace=(\d+)/);
      const availableBytes = match ? parseInt(match[1], 10) : 0;
      return { availableBytes, sufficient: availableBytes > 500_000_000 };
    } else {
      // Use df on Unix/macOS
      const { stdout } = await execFileAsync('df', ['-k', dirPath]);
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const availableKB = parseInt(parts[3], 10);
        const availableBytes = availableKB * 1024;
        return { availableBytes, sufficient: availableBytes > 500_000_000 };
      }
      return { availableBytes: 0, sufficient: false };
    }
  } catch {
    // If we can't determine, assume sufficient
    return { availableBytes: -1, sufficient: true };
  }
}
