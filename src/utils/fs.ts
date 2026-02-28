import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

/**
 * Copy a directory recursively
 */
export async function copyDir(
  src: string,
  dest: string,
  options?: { filter?: (src: string) => boolean }
): Promise<void> {
  await fs.copy(src, dest, {
    overwrite: true,
    filter: options?.filter,
  });
}

/**
 * Create a temporary directory with a unique name
 */
export async function createTempDir(prefix = 'monorepo-'): Promise<string> {
  const tempBase = os.tmpdir();
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const tempDir = path.join(tempBase, `${prefix}${uniqueId}`);
  await fs.ensureDir(tempDir);
  return tempDir;
}

/**
 * Remove a directory and all its contents
 */
export async function removeDir(dirPath: string): Promise<void> {
  await fs.remove(dirPath);
}

/**
 * Check if a path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
  return fs.pathExists(filePath);
}

/**
 * Check if a path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read a JSON file and parse its contents
 */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
  return fs.readJson(filePath);
}

/**
 * Write data to a JSON file
 */
export async function writeJson(
  filePath: string,
  data: unknown,
  options?: { spaces?: number }
): Promise<void> {
  await fs.writeJson(filePath, data, { spaces: options?.spaces ?? 2 });
}

/**
 * Read a file as a string
 */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Write a string to a file
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * List files in a directory (non-recursive)
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

/**
 * List directories in a directory (non-recursive)
 */
export async function listDirs(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Move a file or directory
 */
export async function move(src: string, dest: string): Promise<void> {
  await fs.move(src, dest, { overwrite: true });
}

/**
 * Normalize a file path to use forward slashes consistently.
 * This ensures cross-platform compatibility by replacing both
 * the platform separator and backslashes with forward slashes.
 */
export function normalizePath(p: string): string {
  return p.replace(/[\\/]+/g, '/');
}
