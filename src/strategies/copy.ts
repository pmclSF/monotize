import path from 'node:path';
import simpleGit from 'simple-git';
import type { RepoSource, Logger } from '../types/index.js';
import { copyDir, ensureDir, pathExists } from '../utils/fs.js';

/**
 * Options for cloning/copying repositories
 */
export interface CopyOptions {
  /** Logger instance */
  logger: Logger;
  /** Whether to show verbose output */
  verbose?: boolean;
}

/**
 * Files/directories to exclude when copying
 */
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.pnpm-store',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
];

/**
 * Clone a Git repository to a target directory
 */
async function cloneRepo(
  url: string,
  targetDir: string,
  logger: Logger
): Promise<void> {
  const git = simpleGit();

  logger.debug(`Cloning ${url} to ${targetDir}`);

  await git.clone(url, targetDir, ['--depth', '1']);

  logger.debug(`Successfully cloned ${url}`);
}

/**
 * Copy a local directory to a target location
 */
async function copyLocalRepo(
  sourcePath: string,
  targetDir: string,
  logger: Logger
): Promise<void> {
  logger.debug(`Copying ${sourcePath} to ${targetDir}`);

  await copyDir(sourcePath, targetDir, {
    filter: (src) => {
      const basename = path.basename(src);
      return !EXCLUDE_PATTERNS.includes(basename);
    },
  });

  logger.debug(`Successfully copied ${sourcePath}`);
}

/**
 * Clone or copy a repository to the target directory
 */
export async function cloneOrCopyRepo(
  source: RepoSource,
  targetDir: string,
  options: CopyOptions
): Promise<void> {
  const { logger } = options;

  await ensureDir(targetDir);

  if (source.type === 'local') {
    // Check if source exists
    if (!(await pathExists(source.resolved))) {
      throw new Error(`Local repository not found: ${source.resolved}`);
    }

    await copyLocalRepo(source.resolved, targetDir, logger);
  } else {
    // Clone from remote
    await cloneRepo(source.resolved, targetDir, logger);
  }
}

/**
 * Clone or copy multiple repositories to a temporary directory
 */
export async function cloneOrCopyRepos(
  sources: RepoSource[],
  tempDir: string,
  options: CopyOptions
): Promise<Array<{ path: string; name: string }>> {
  const { logger } = options;
  const results: Array<{ path: string; name: string }> = [];

  for (const source of sources) {
    const targetDir = path.join(tempDir, source.name);

    logger.info(`Processing ${source.original}...`);

    try {
      await cloneOrCopyRepo(source, targetDir, options);
      results.push({ path: targetDir, name: source.name });
      logger.success(`Processed ${source.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to process ${source.original}: ${message}`);
      throw error;
    }
  }

  return results;
}
