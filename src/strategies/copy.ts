import path from 'node:path';
import simpleGit from 'simple-git';
import type { RepoSource, Logger } from '../types/index.js';
import { copyDir, ensureDir, pathExists, removeDir } from '../utils/fs.js';

/**
 * Options for cloning/copying repositories
 */
export interface CopyOptions {
  /** Logger instance */
  logger: Logger;
  /** Whether to show verbose output */
  verbose?: boolean;
  /** Timeout for git clone in milliseconds (default: 60000) */
  cloneTimeout?: number;
  /** Number of retries for transient failures (default: 3) */
  maxRetries?: number;
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
 * Error codes that indicate transient failures (worth retrying)
 */
const TRANSIENT_ERROR_CODES = [
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
];

/**
 * Check if an error is a transient network error
 */
function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const errWithCode = error as Error & { code?: string };
    if (errWithCode.code && TRANSIENT_ERROR_CODES.includes(errWithCode.code)) {
      return true;
    }

    // Check for common network error messages
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('connection refused') ||
      message.includes('network') ||
      message.includes('temporarily unavailable')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Get a user-friendly error message for git clone failures
 */
function getCloneErrorMessage(error: unknown, url: string): string {
  const baseMessage = error instanceof Error ? error.message : String(error);

  // Authentication errors
  if (
    baseMessage.includes('Authentication failed') ||
    baseMessage.includes('could not read Username') ||
    baseMessage.includes('Permission denied') ||
    baseMessage.includes('401') ||
    baseMessage.includes('403')
  ) {
    return `Authentication failed for ${url}. If this is a private repository, ensure you have:\n` +
      '  - Set up SSH keys: https://docs.github.com/en/authentication/connecting-to-github-with-ssh\n' +
      '  - Or use a personal access token in the URL';
  }

  // Repository not found
  if (
    baseMessage.includes('Repository not found') ||
    baseMessage.includes('does not exist') ||
    baseMessage.includes('404')
  ) {
    return `Repository not found: ${url}. Check that:\n` +
      '  - The repository name is spelled correctly\n' +
      '  - You have access to view the repository\n' +
      '  - The repository has not been deleted or renamed';
  }

  // Network errors
  if (
    baseMessage.includes('Could not resolve host') ||
    baseMessage.includes('ENOTFOUND')
  ) {
    return `Cannot reach repository host for ${url}. Check your internet connection.`;
  }

  if (baseMessage.includes('Connection refused') || baseMessage.includes('ECONNREFUSED')) {
    return `Connection refused when cloning ${url}. The server may be down or blocking connections.`;
  }

  if (baseMessage.includes('timed out') || baseMessage.includes('ETIMEDOUT')) {
    return `Clone operation timed out for ${url}. Try:\n` +
      '  - Checking your internet connection\n' +
      '  - Increasing the timeout with --clone-timeout flag\n' +
      '  - Trying again later if the server is slow';
  }

  // Empty repository
  if (baseMessage.includes('empty repository') || baseMessage.includes('no commits')) {
    return `Repository ${url} appears to be empty (no commits). Cannot clone an empty repository.`;
  }

  // Default: include original message
  return `Failed to clone ${url}: ${baseMessage}`;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clone a Git repository to a target directory with timeout and retry support
 */
async function cloneRepo(
  url: string,
  targetDir: string,
  logger: Logger,
  options: { timeout?: number; maxRetries?: number } = {}
): Promise<void> {
  const { timeout = 60000, maxRetries = 3 } = options;

  const git = simpleGit({
    timeout: {
      block: timeout,
    },
  });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Cloning ${url} to ${targetDir} (attempt ${attempt}/${maxRetries})`);

      await git.clone(url, targetDir, ['--depth', '1']);

      logger.debug(`Successfully cloned ${url}`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Clean up partial clone on failure
      if (await pathExists(targetDir)) {
        try {
          await removeDir(targetDir);
        } catch (cleanupError) {
          logger.debug(`Failed to cleanup partial clone: ${cleanupError}`);
        }
      }

      // Only retry for transient errors
      if (isTransientError(error) && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        logger.warn(`Clone failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      // Non-transient error or max retries reached
      break;
    }
  }

  // Throw with user-friendly message
  throw new Error(getCloneErrorMessage(lastError, url));
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
  const { logger, cloneTimeout = 60000, maxRetries = 3 } = options;

  await ensureDir(targetDir);

  if (source.type === 'local') {
    // Check if source exists
    if (!(await pathExists(source.resolved))) {
      throw new Error(`Local repository not found: ${source.resolved}`);
    }

    await copyLocalRepo(source.resolved, targetDir, logger);
  } else {
    // Clone from remote
    await cloneRepo(source.resolved, targetDir, logger, {
      timeout: cloneTimeout,
      maxRetries,
    });
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
