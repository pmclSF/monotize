import path from 'node:path';
import type { RepoPrepAnalysis, PrepareAnalysis } from '../types/index.js';
import { pathExists, readJson, readFile } from '../utils/fs.js';
import { generatePatchesForRepo, type PatchGenerationOptions } from '../strategies/prepare-patches.js';
import { generateChecklistItems } from '../strategies/prepare-checklist.js';

/**
 * Analyze a single repo directory for preparation.
 * Reads .nvmrc, .node-version, and package.json fields.
 */
export async function analyzeRepoForPreparation(
  repoPath: string,
  repoName: string
): Promise<RepoPrepAnalysis> {
  // Read .nvmrc
  let nvmrc: string | null = null;
  const nvmrcPath = path.join(repoPath, '.nvmrc');
  if (await pathExists(nvmrcPath)) {
    nvmrc = (await readFile(nvmrcPath)).trim();
  }

  // Read .node-version
  let nodeVersion: string | null = null;
  const nodeVersionPath = path.join(repoPath, '.node-version');
  if (await pathExists(nodeVersionPath)) {
    nodeVersion = (await readFile(nodeVersionPath)).trim();
  }

  // Read package.json
  let packageJson: Record<string, unknown> = {};
  const pkgJsonPath = path.join(repoPath, 'package.json');
  if (await pathExists(pkgJsonPath)) {
    packageJson = await readJson<Record<string, unknown>>(pkgJsonPath);
  }

  // Extract engines.node
  const engines = packageJson.engines as Record<string, string> | undefined;
  const enginesNode = engines?.node ?? null;

  // Extract scripts.build
  const scripts = packageJson.scripts as Record<string, string> | undefined;
  const hasBuildScript = !!scripts?.build;
  const existingBuildScript = scripts?.build ?? null;

  // Extract packageManager field
  const existingPackageManagerField = (packageJson.packageManager as string) ?? null;

  return {
    repoName,
    repoPath,
    nvmrc,
    nodeVersion,
    enginesNode,
    hasBuildScript,
    existingBuildScript,
    existingPackageManagerField,
    packageJson,
  };
}

/**
 * Analyze multiple repos for preparation.
 * Generates patches and checklist items from the analysis.
 */
export async function analyzeReposForPreparation(
  repoPaths: Array<{ path: string; name: string }>,
  options: PatchGenerationOptions = {}
): Promise<PrepareAnalysis> {
  const repos: RepoPrepAnalysis[] = [];

  for (const repo of repoPaths) {
    const analysis = await analyzeRepoForPreparation(repo.path, repo.name);
    repos.push(analysis);
  }

  // Generate patches for each repo
  const patches = repos.flatMap((repo) => generatePatchesForRepo(repo, options));

  // Generate checklist items
  const checklist = generateChecklistItems(repos, patches);

  return {
    repos,
    checklist,
    patches,
    targetNodeVersion: options.targetNodeVersion ?? null,
    targetPackageManager: options.targetPackageManager ?? null,
  };
}
