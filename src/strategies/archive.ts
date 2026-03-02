import type { ArchivePlan, Logger, RepoSource } from '../types/index.js';
import { validateRepoSources } from '../utils/validation.js';

/**
 * Generate a README deprecation patch for a single repo.
 * This works without any token - it's just text generation.
 */
export function generateReadmeDeprecationPatch(
  repoName: string,
  monorepoUrl: string,
): string {
  const notice = [
    `# ${repoName}`,
    '',
    `> **Note:** This repository has been migrated to a monorepo.`,
    `> All future development happens at [${monorepoUrl}](${monorepoUrl}).`,
    '',
    '## Migration Notice',
    '',
    `This repository is **archived** and no longer maintained independently.`,
    `The code now lives in the monorepo at:`,
    '',
    `  ${monorepoUrl}`,
    '',
    'Please file issues and submit pull requests there.',
    '',
  ].join('\n');

  // Generate unified diff
  const lines = [
    `--- a/README.md`,
    `+++ b/README.md`,
    `@@ -1,1 +1,${notice.split('\n').length} @@`,
    ...notice.split('\n').map((l) => `+${l}`),
  ];

  return lines.join('\n');
}

/**
 * Generate an ArchivePlan for deprecating old repositories
 */
export async function generateArchivePlan(
  repoInputs: string[],
  monorepoUrl: string,
  options: { tokenFromEnv?: boolean } = {},
): Promise<ArchivePlan> {
  const validation = await validateRepoSources(repoInputs);
  if (!validation.valid) {
    throw new Error(`Invalid repository sources: ${validation.errors.join(', ')}`);
  }

  const repos = validation.sources.map((source: RepoSource) => ({
    name: source.name,
    url: source.resolved,
    readmePatch: generateReadmeDeprecationPatch(source.name, monorepoUrl),
  }));

  const plan: ArchivePlan = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    repos,
    monorepoUrl,
  };

  // Only include API operations if token will be available
  if (options.tokenFromEnv) {
    plan.apiOperations = validation.sources.map((source: RepoSource) => ({
      repo: source.original,
      action: 'archive' as const,
    }));
  }

  return plan;
}

/**
 * Apply archive operations via the GitHub API.
 * Token is read from environment variable only, NEVER persisted.
 */
export async function applyArchiveViaGitHubApi(
  plan: ArchivePlan,
  logger: Logger,
): Promise<{ applied: string[]; failed: Array<{ repo: string; error: string }> }> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      'GitHub token required. Set GITHUB_TOKEN or GH_TOKEN environment variable.',
    );
  }

  const applied: string[] = [];
  const failed: Array<{ repo: string; error: string }> = [];

  for (const op of plan.apiOperations ?? []) {
    logger.info(`Archiving ${op.repo} via GitHub API...`);

    try {
      // Parse owner/repo from the repo string
      const match = op.repo.match(/(?:github\.com\/)?([^/]+)\/([^/.]+)/);
      if (!match) {
        failed.push({ repo: op.repo, error: 'Could not parse owner/repo' });
        continue;
      }
      const [, owner, repo] = match;

      if (op.action === 'archive') {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ archived: true }),
        });

        if (!response.ok) {
          const body = await response.text();
          failed.push({ repo: op.repo, error: `HTTP ${response.status}: ${body}` });
          continue;
        }
      }

      applied.push(op.repo);
      logger.success(`Archived ${op.repo}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ repo: op.repo, error: msg });
      logger.error(`Failed to archive ${op.repo}: ${msg}`);
    }
  }

  return { applied, failed };
}
