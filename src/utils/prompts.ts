import { select, confirm, input } from '@inquirer/prompts';
import type { ConflictStrategy, DependencyConflict, FileCollision, FileCollisionStrategy } from '../types/index.js';

/**
 * Prompt user to select a conflict resolution strategy
 */
export async function promptConflictStrategy(): Promise<ConflictStrategy> {
  const answer = await select({
    message: 'How should dependency conflicts be resolved?',
    choices: [
      {
        name: 'Use highest versions (recommended)',
        value: 'highest' as const,
        description: 'Always use the highest semver version',
      },
      {
        name: 'Use lowest versions',
        value: 'lowest' as const,
        description: 'Always use the lowest semver version',
      },
      {
        name: 'Ask for each conflict',
        value: 'prompt' as const,
        description: 'Prompt for each individual conflict',
      },
    ],
  });

  return answer;
}

/**
 * Prompt user to resolve a specific dependency conflict
 */
export async function promptDependencyResolution(
  conflict: DependencyConflict
): Promise<string> {
  const choices = conflict.versions.map((v) => ({
    name: `${v.version} (from ${v.source})`,
    value: v.version,
  }));

  const answer = await select({
    message: `Select version for "${conflict.name}":`,
    choices,
  });

  return answer;
}

/**
 * Prompt user to select file collision handling strategy
 */
export async function promptFileCollisionStrategy(
  collision: FileCollision
): Promise<FileCollisionStrategy> {
  const choices: Array<{ name: string; value: FileCollisionStrategy; description: string }> = [];

  // Add merge option for mergeable files
  if (collision.suggestedStrategy === 'merge') {
    choices.push({
      name: 'Merge files',
      value: 'merge',
      description: 'Combine contents from all sources',
    });
  }

  choices.push(
    {
      name: 'Keep first',
      value: 'keep-first',
      description: `Use file from ${collision.sources[0]}`,
    },
    {
      name: 'Keep last',
      value: 'keep-last',
      description: `Use file from ${collision.sources[collision.sources.length - 1]}`,
    },
    {
      name: 'Rename files',
      value: 'rename',
      description: 'Keep all with unique names',
    },
    {
      name: 'Skip',
      value: 'skip',
      description: 'Do not include this file',
    }
  );

  const answer = await select({
    message: `How to handle "${collision.path}"? (found in: ${collision.sources.join(', ')})`,
    choices,
  });

  return answer;
}

/**
 * Prompt user to confirm an action
 */
export async function promptConfirm(message: string, defaultValue = true): Promise<boolean> {
  return confirm({
    message,
    default: defaultValue,
  });
}

/**
 * Prompt user for custom input
 */
export async function promptInput(
  message: string,
  defaultValue?: string
): Promise<string> {
  return input({
    message,
    default: defaultValue,
  });
}

/**
 * Prompt user to enter a custom package name
 */
export async function promptPackageName(
  repoName: string,
  suggestion: string
): Promise<string> {
  return input({
    message: `Enter package name for "${repoName}":`,
    default: suggestion,
  });
}
