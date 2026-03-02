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
  } catch (_err) {
    // git filter-repo not installed or not on PATH
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
  } catch (_err) {
    // Not a git repository
    return false;
  }
}

/**
 * Sanitize a string for safe use in a Python bytes literal.
 * Removes any characters that could break out of the string.
 */
function sanitizeForPython(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _\-\[\]().,:;!?#@&+=]/g, '');
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
    // Validate targetDir doesn't contain dangerous characters
    const safeTargetDir = targetDir.replace(/[^a-zA-Z0-9_\-./]/g, '');
    const filterArgs = ['filter-repo', '--force', '--path-rename', `:${safeTargetDir}/`];

    // Add commit message prefix if specified
    if (commitPrefix) {
      const safePrefix = sanitizeForPython(commitPrefix);
      filterArgs.push('--message-callback', `return b"${safePrefix}" + message`);
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
    } catch (_err) {
      // Remote doesn't exist yet, safe to ignore
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
    } catch (_err) {
      // main branch merge failed, try master
      try {
        execFileSync('git', ['merge', `${remoteName}/master`, '--allow-unrelated-histories', '--no-edit'], {
          cwd: outputPath,
          stdio: 'pipe',
        });
      } catch (_err) {
        // master branch merge also failed, try to find the default branch
        const branches = execFileSync('git', ['branch', '-r'], {
          cwd: outputPath,
          encoding: 'utf-8',
        });

        const remoteBranch = branches
          .split('\n')
          .map((b) => b.trim())
          .filter((b) => !b.includes('->'))
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
    } catch (_err) {
      // Cleanup of working directory failed; non-fatal
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

  // Check if repo has commits
  try {
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      stdio: 'pipe',
    });
  } catch (_err) {
    // No commits in repo, just copy files
    await ensureDir(path.join(outputPath, targetDir));
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
  } catch (_err) {
    // Remote doesn't exist yet, safe to ignore
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
      // Find any branch from this remote (skip HEAD -> symbolic refs)
      const remoteBranch = branches
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => !b.includes('->'))
        .find((b) => b.startsWith(`${remoteName}/`));

      if (remoteBranch) {
        defaultBranch = remoteBranch.replace(`${remoteName}/`, '');
      }
    }
  } catch (_err) {
    // Could not list remote branches, use default
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
    } catch (_err) {
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
 * Check all prerequisites for history preservation.
 * Returns ok:true if all checks pass, or a list of issues.
 */
export async function checkHistoryPrerequisites(
  repoPath: string,
): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check git is available
  try {
    execFileSync('which', ['git'], { stdio: 'pipe' });
  } catch (_err) {
    issues.push('git is not installed or not on PATH');
  }

  // Check source is a git repo
  if (!(await isGitRepo(repoPath))) {
    issues.push(`${repoPath} is not a git repository`);
    return { ok: false, issues };
  }

  // Check for shallow clone
  try {
    const result = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    if (result.trim() === 'true') {
      issues.push('Repository is a shallow clone. Run `git fetch --unshallow` first.');
    }
  } catch (_err) {
    // Older git versions don't support --is-shallow-repository, skip
  }

  // Check git-filter-repo availability
  const hasFilterRepo = await checkGitFilterRepo();
  if (!hasFilterRepo) {
    issues.push('git-filter-repo is not installed (will fall back to git subtree)');
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Generate a dry-run report for history preservation.
 * Shows commit count, contributors, and estimated time without making changes.
 */
export async function historyDryRun(
  repoPath: string,
  _targetDir: string,
): Promise<{
  commitCount: number;
  contributors: string[];
  estimatedSeconds: number;
  hasFilterRepo: boolean;
  strategy: 'filter-repo' | 'subtree';
}> {
  const commitCount = await getCommitCount(repoPath);
  const contributors = await getContributors(repoPath);
  const hasFilterRepo = await checkGitFilterRepo();

  // Rough estimate: ~0.5s per commit for filter-repo, ~0.2s for subtree
  const secondsPerCommit = hasFilterRepo ? 0.5 : 0.2;
  const estimatedSeconds = Math.max(1, Math.ceil(commitCount * secondsPerCommit));

  return {
    commitCount,
    contributors,
    estimatedSeconds,
    hasFilterRepo,
    strategy: hasFilterRepo ? 'filter-repo' : 'subtree',
  };
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
  } catch (_err) {
    // No commits or git error; return 0
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
  } catch (_err) {
    // No commits or git error; return empty
    return [];
  }
}
