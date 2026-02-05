import path from 'node:path';
import type { FileCollision, FileCollisionStrategy } from '../types/index.js';
import { listFiles, readFile } from '../utils/fs.js';

/**
 * Files that can be merged
 */
const MERGEABLE_FILES = new Set(['.gitignore', '.npmignore', '.eslintignore', '.prettierignore']);

/**
 * Files that should be kept from first repo by default
 */
const KEEP_FIRST_FILES = new Set([
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  '.editorconfig',
  '.nvmrc',
  '.node-version',
]);

/**
 * Files that should be skipped (will be regenerated)
 */
const SKIP_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'pnpm-workspace.yaml',
  '.yarnrc.yml',
  '.yarnrc',
  '.npmrc',
]);

/**
 * Determine the suggested strategy for a file collision
 */
function getSuggestedStrategy(filename: string): FileCollisionStrategy {
  if (SKIP_FILES.has(filename)) {
    return 'skip';
  }
  if (MERGEABLE_FILES.has(filename)) {
    return 'merge';
  }
  if (KEEP_FIRST_FILES.has(filename)) {
    return 'keep-first';
  }
  // For README and other docs, keep first or rename
  if (filename.toLowerCase().startsWith('readme')) {
    return 'keep-first';
  }
  return 'rename';
}

/**
 * Detect file collisions at the root level of repositories
 */
export async function detectFileCollisions(
  repoPaths: Array<{ path: string; name: string }>
): Promise<FileCollision[]> {
  // Map of filename to list of repos that have it
  const fileMap = new Map<string, string[]>();

  for (const repo of repoPaths) {
    try {
      const files = await listFiles(repo.path);

      for (const file of files) {
        const sources = fileMap.get(file) || [];
        sources.push(repo.name);
        fileMap.set(file, sources);
      }
    } catch {
      // Skip repos that can't be read
    }
  }

  // Find collisions (files that exist in multiple repos)
  const collisions: FileCollision[] = [];

  for (const [filename, sources] of fileMap) {
    if (sources.length > 1) {
      collisions.push({
        path: filename,
        sources,
        suggestedStrategy: getSuggestedStrategy(filename),
      });
    }
  }

  // Sort collisions by strategy priority
  const strategyOrder: Record<FileCollisionStrategy, number> = {
    merge: 0,
    'keep-first': 1,
    'keep-last': 2,
    rename: 3,
    skip: 4,
  };

  collisions.sort((a, b) => strategyOrder[a.suggestedStrategy] - strategyOrder[b.suggestedStrategy]);

  return collisions;
}

/**
 * Check if two files have identical content
 */
export async function filesAreIdentical(file1: string, file2: string): Promise<boolean> {
  try {
    const [content1, content2] = await Promise.all([readFile(file1), readFile(file2)]);
    return content1 === content2;
  } catch {
    return false;
  }
}

/**
 * Get the full paths to a file in all repos where it exists
 */
export function getFilePaths(
  filename: string,
  repoPaths: Array<{ path: string; name: string }>,
  sources: string[]
): string[] {
  return sources.map((source) => {
    const repo = repoPaths.find((r) => r.name === source);
    return repo ? path.join(repo.path, filename) : '';
  }).filter(Boolean);
}
