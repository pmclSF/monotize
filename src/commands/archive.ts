import path from 'node:path';
import { createLogger } from '../utils/logger.js';
import { writeJson } from '../utils/fs.js';
import { generateArchivePlan, applyArchiveViaGitHubApi } from '../strategies/archive.js';

interface CLIArchiveOptions {
  monorepoUrl: string;
  out?: string;
  apply?: boolean;
  tokenFromEnv?: boolean;
  verbose?: boolean;
}

export async function archiveCommand(repos: string[], options: CLIArchiveOptions): Promise<void> {
  const logger = createLogger(options.verbose);

  try {
    logger.info(`Generating archive plan for ${repos.length} repositories...`);

    const plan = await generateArchivePlan(repos, options.monorepoUrl, {
      tokenFromEnv: options.tokenFromEnv,
    });

    // Write plan to file
    const planPath = options.out || 'archive.plan.json';
    const absPath = path.resolve(planPath);
    await writeJson(absPath, plan);
    logger.success(`Archive plan written to ${absPath}`);

    // Print summary
    logger.info(`\nArchive Plan Summary:`);
    logger.info(`  Repositories: ${plan.repos.length}`);
    logger.info(`  Monorepo URL: ${plan.monorepoUrl}`);
    for (const repo of plan.repos) {
      logger.info(`  - ${repo.name} (${repo.url})`);
    }

    // Show README patches
    logger.info(`\nREADME deprecation patches generated for ${plan.repos.length} repos.`);
    logger.info('These patches can be applied without a GitHub token.');

    if (plan.apiOperations?.length) {
      logger.info(`\nAPI operations (require GITHUB_TOKEN):`);
      for (const op of plan.apiOperations) {
        logger.info(`  - ${op.action}: ${op.repo}`);
      }
    }

    // Apply if requested
    if (options.apply) {
      if (!plan.apiOperations?.length) {
        logger.warn('No API operations to apply. Use --token-from-env to include archive operations.');
        return;
      }

      logger.info('\nApplying archive operations via GitHub API...');
      const result = await applyArchiveViaGitHubApi(plan, logger);

      if (result.applied.length > 0) {
        logger.success(`Archived ${result.applied.length} repositories`);
      }
      if (result.failed.length > 0) {
        logger.error(`Failed to archive ${result.failed.length} repositories:`);
        for (const f of result.failed) {
          logger.error(`  ${f.repo}: ${f.error}`);
        }
        process.exitCode = 1;
      }
    } else {
      logger.info(`\nTo apply: monorepo archive ${repos.join(' ')} --monorepo-url ${options.monorepoUrl} --apply --token-from-env`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Archive failed: ${msg}`);
    process.exitCode = 1;
  }
}
