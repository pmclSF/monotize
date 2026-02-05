import path from 'node:path';
import type { RepoSource, RepoSourceType, ValidationResult } from '../types/index.js';
import { isDirectory, pathExists } from './fs.js';

/**
 * GitHub shorthand pattern: owner/repo
 */
const GITHUB_SHORTHAND = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/**
 * GitLab shorthand pattern: gitlab:owner/repo
 */
const GITLAB_SHORTHAND = /^gitlab:([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/;

/**
 * Git URL patterns
 */
const GIT_URL_PATTERNS = [
  /^https?:\/\/github\.com\/[^/]+\/[^/]+/,
  /^https?:\/\/gitlab\.com\/[^/]+\/[^/]+/,
  /^git@github\.com:[^/]+\/[^/]+/,
  /^git@gitlab\.com:[^/]+\/[^/]+/,
  /^https?:\/\/.*\.git$/,
  /^git:\/\//,
];

/**
 * Extract repository name from various URL formats
 */
function extractRepoName(input: string): string {
  // Remove .git suffix if present
  let name = input.replace(/\.git$/, '');

  // Handle URLs
  if (name.includes('://') || name.includes('@')) {
    const parts = name.split('/');
    name = parts[parts.length - 1];
  }

  // Handle shorthand notation (owner/repo)
  if (name.includes('/')) {
    const parts = name.split('/');
    name = parts[parts.length - 1];
  }

  // Remove gitlab: prefix if present
  name = name.replace(/^gitlab:/, '');

  return name || 'unknown';
}

/**
 * Determine the type of repository source
 */
function determineSourceType(input: string): RepoSourceType {
  // Check for local paths first (starting with ./ or ../ or /)
  if (input.startsWith('./') || input.startsWith('../') || input.startsWith('/')) {
    return 'local';
  }

  // Check for GitLab shorthand
  if (GITLAB_SHORTHAND.test(input)) {
    return 'gitlab';
  }

  // Check for Git URLs
  for (const pattern of GIT_URL_PATTERNS) {
    if (pattern.test(input)) {
      if (input.includes('gitlab.com')) {
        return 'gitlab';
      }
      if (input.includes('github.com')) {
        return 'github';
      }
      return 'url';
    }
  }

  // Check for GitHub shorthand (must be after local path check)
  if (GITHUB_SHORTHAND.test(input)) {
    return 'github';
  }

  // Assume local path
  return 'local';
}

/**
 * Resolve the input to a full URL or absolute path
 */
function resolveSource(input: string, type: RepoSourceType): string {
  switch (type) {
    case 'github':
      if (GITHUB_SHORTHAND.test(input)) {
        return `https://github.com/${input}.git`;
      }
      return input;

    case 'gitlab': {
      const match = input.match(GITLAB_SHORTHAND);
      if (match) {
        return `https://gitlab.com/${match[1]}.git`;
      }
      return input;
    }

    case 'url':
      return input;

    case 'local':
      return path.resolve(input);
  }
}

/**
 * Parse a repository source input string
 */
export function parseRepoSource(input: string): RepoSource {
  const trimmed = input.trim();
  const type = determineSourceType(trimmed);
  const resolved = resolveSource(trimmed, type);
  const name = extractRepoName(trimmed);

  return {
    type,
    original: trimmed,
    resolved,
    name,
  };
}

/**
 * Validate a single repository source
 */
async function validateSingleSource(source: RepoSource): Promise<string | null> {
  if (source.type === 'local') {
    const exists = await pathExists(source.resolved);
    if (!exists) {
      return `Local path does not exist: ${source.resolved}`;
    }

    const isDir = await isDirectory(source.resolved);
    if (!isDir) {
      return `Local path is not a directory: ${source.resolved}`;
    }
  }

  // For remote sources, we can't validate until we try to clone
  // Just do basic sanity checks
  if (source.type === 'github' || source.type === 'gitlab' || source.type === 'url') {
    if (!source.resolved.includes('/')) {
      return `Invalid repository URL: ${source.original}`;
    }
  }

  return null;
}

/**
 * Validate multiple repository sources
 */
export async function validateRepoSources(inputs: string[]): Promise<ValidationResult> {
  if (inputs.length === 0) {
    return {
      valid: false,
      errors: ['At least one repository is required'],
      sources: [],
    };
  }

  const sources = inputs.map(parseRepoSource);
  const errors: string[] = [];

  // Check for duplicate names
  const names = new Map<string, number>();
  for (const source of sources) {
    const count = names.get(source.name) ?? 0;
    names.set(source.name, count + 1);
  }

  // Rename duplicates with suffix
  const nameCounters = new Map<string, number>();
  for (const source of sources) {
    if ((names.get(source.name) ?? 0) > 1) {
      const counter = nameCounters.get(source.name) ?? 0;
      nameCounters.set(source.name, counter + 1);
      source.name = `${source.name}-${counter + 1}`;
    }
  }

  // Validate each source
  for (const source of sources) {
    const error = await validateSingleSource(source);
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sources,
  };
}

/**
 * Check if a string is a valid package name
 */
export function isValidPackageName(name: string): boolean {
  // npm package name rules (simplified)
  const validName = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  return validName.test(name) && name.length <= 214;
}

/**
 * Sanitize a string for use as a package name
 */
export function sanitizePackageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-._~]/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .slice(0, 214);
}
