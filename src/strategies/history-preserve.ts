import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { HistoryPreserveOptions } from '../types/index.js';
import { ensureDir, copyDir } from '../utils/fs.js';

/**
 * Check if git filter-repo is available
 */
export async function checkGitFilterRepo(): Promise<boolean> {
  try {
    execFileSync('git', ['filter-repo', '--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory is a git repository
 */
async function isGitRepo(dir: string): Promise<boolean> {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: dir,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Preserve git history using git filter-repo
 * Rewrites paths and optionally prefixes commit messages
 */
async function preserveHistoryWithFilterRepo(
  repoPath: string,
  outputPath: string,
  options: HistoryPreserveOptions
): Promise<void> {
  const { targetDir, commitPrefix } = options;

  // Create a working copy to avoid modifying the original
  const workingDir = path.join(path.dirname(repoPath), `${path.basename(repoPath)}-history-work`);
  await copyDir(repoPath, workingDir);

  try {
    // Rewrite paths to be under targetDir
    const filterArgs = ['filter-repo', '--force', `--path-rename`, `:${targetDir}/`];

    // Add commit message prefix if specified
    if (commitPrefix) {
      filterArgs.push('--message-callback', `return b"${commitPrefix}" + message`);
    }

    execFileSync('git', filterArgs, {
      cwd: workingDir,
      stdio: 'pipe',
    });

    // Add the rewritten repo as a remote and fetch
    const remoteName = `import-${path.basename(repoPath)}`;

    // Remove existing remote if it exists
    try {
      execFileSync('git', ['remote', 'remove', remoteName], {
        cwd: outputPath,
        stdio: 'pipe',
      });
    } catch {
      // Remote doesn't exist, which is fine
    }

    execFileSync('git', ['remote', 'add', remoteName, workingDir], {
      cwd: outputPath,
      stdio: 'pipe',
    });

    execFileSync('git', ['fetch', remoteName], {
      cwd: outputPath,
      stdio: 'pipe',
    });

    // Merge the history
    try {
      execFileSync('git', ['merge', `${remoteName}/main`, '--allow-unrelated-histories', '--no-edit'], {
        cwd: outputPath,
        stdio: 'pipe',
      });
    } catch {
      // Try with master branch
      try {
        execFileSync('git', ['merge', `${remoteName}/master`, '--allow-unrelated-histories', '--no-edit'], {
          cwd: outputPath,
          stdio: 'pipe',
        });
      } catch {
        // Try to find the default branch
        const branches = execFileSync('git', ['branch', '-r'], {
          cwd: outputPath,
          encoding: 'utf-8',
        });

        const remoteBranch = branches
          .split('\n')
          .map((b) => b.trim())
          .find((b) => b.startsWith(`${remoteName}/`));

        if (remoteBranch) {
          execFileSync('git', ['merge', remoteBranch, '--allow-unrelated-histories', '--no-edit'], {
            cwd: outputPath,
            stdio: 'pipe',
          });
        } else {
          throw new Error(`No branch found for remote ${remoteName}`);
        }
      }
    }

    // Clean up the remote
    execFileSync('git', ['remote', 'remove', remoteName], {
      cwd: outputPath,
      stdio: 'pipe',
    });
  } finally {
    // Clean up working directory
    try {
      const fs = await import('fs-extra');
      await fs.remove(workingDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Preserve git history using git subtree
 * This is a fallback when git filter-repo is not available
 */
async function preserveHistoryWithSubtree(
  repoPath: string,
  outputPath: string,
  options: HistoryPreserveOptions
): Promise<void> {
  const { targetDir } = options;

  // Ensure the target directory exists
  await ensureDir(path.join(outputPath, targetDir));

  // Check if repo has commits
  try {
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      stdio: 'pipe',
    });
  } catch {
    // No commits, just copy files
    await copyDir(repoPath, path.join(outputPath, targetDir));
    return;
  }

  // Add the repo as a remote
  const remoteName = `import-${path.basename(repoPath)}`;

  // Remove existing remote if it exists
  try {
    execFileSync('git', ['remote', 'remove', remoteName], {
      cwd: outputPath,
      stdio: 'pipe',
    });
  } catch {
    // Remote doesn't exist, which is fine
  }

  execFileSync('git', ['remote', 'add', remoteName, repoPath], {
    cwd: outputPath,
    stdio: 'pipe',
  });

  execFileSync('git', ['fetch', remoteName], {
    cwd: outputPath,
    stdio: 'pipe',
  });

  // Find the default branch
  let defaultBranch = 'main';
  try {
    const branches = execFileSync('git', ['branch', '-r'], {
      cwd: outputPath,
      encoding: 'utf-8',
    });

    if (branches.includes(`${remoteName}/main`)) {
      defaultBranch = 'main';
    } else if (branches.includes(`${remoteName}/master`)) {
      defaultBranch = 'master';
    } else {
      // Find any branch from this remote
      const remoteBranch = branches
        .split('\n')
        .map((b) => b.trim())
        .find((b) => b.startsWith(`${remoteName}/`));

      if (remoteBranch) {
        defaultBranch = remoteBranch.replace(`${remoteName}/`, '');
      }
    }
  } catch {
    // Use default
  }

  // Use subtree add to merge with history
  try {
    execFileSync('git', ['subtree', 'add', `--prefix=${targetDir}`, remoteName, defaultBranch], {
      cwd: outputPath,
      stdio: 'pipe',
    });
  } catch (error) {
    // Subtree may fail if there are conflicts, fall back to merge
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('refusing to merge unrelated histories')) {
      execFileSync('git', ['merge', `${remoteName}/${defaultBranch}`, '--allow-unrelated-histories', '--no-edit', '-s', 'subtree'], {
        cwd: outputPath,
        stdio: 'pipe',
      });
    } else {
      throw error;
    }
  }

  // Clean up the remote
  execFileSync('git', ['remote', 'remove', remoteName], {
    cwd: outputPath,
    stdio: 'pipe',
  });
}

/**
 * Preserve git history when merging a repository
 * Uses git filter-repo if available, otherwise falls back to git subtree
 */
export async function preserveHistory(
  repoPath: string,
  outputPath: string,
  options: HistoryPreserveOptions
): Promise<void> {
  // Check if source is a git repo
  if (!(await isGitRepo(repoPath))) {
    // Not a git repo, just copy files
    await ensureDir(path.join(outputPath, options.targetDir));
    await copyDir(repoPath, path.join(outputPath, options.targetDir));
    return;
  }

  // Check if output is a git repo
  if (!(await isGitRepo(outputPath))) {
    // Initialize git in output
    execFileSync('git', ['init'], {
      cwd: outputPath,
      stdio: 'pipe',
    });

    // Create initial commit if needed
    try {
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: outputPath,
        stdio: 'pipe',
      });
    } catch {
      // No commits yet, create an initial commit
      execFileSync('git', ['commit', '--allow-empty', '-m', 'Initial commit'], {
        cwd: outputPath,
        stdio: 'pipe',
      });
    }
  }

  // Check if filter-repo is available
  const hasFilterRepo = await checkGitFilterRepo();

  if (hasFilterRepo && options.rewritePaths) {
    await preserveHistoryWithFilterRepo(repoPath, outputPath, options);
  } else {
    await preserveHistoryWithSubtree(repoPath, outputPath, options);
  }
}

/**
 * Get the commit count for a repository
 */
export async function getCommitCount(repoPath: string): Promise<number> {
  try {
    const result = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

/**
 * Get the list of contributors for a repository
 */
export async function getContributors(repoPath: string): Promise<string[]> {
  try {
    const result = execFileSync('git', ['log', '--format=%aN <%aE>'], {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    // Deduplicate in JS instead of piping through `sort -u`
    const contributors = new Set(
      result
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
    );
    return [...contributors].sort();
  } catch {
    return [];
  }
}
