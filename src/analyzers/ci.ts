import path from 'node:path';
import type { AnalysisFinding, Logger } from '../types/index.js';
import { pathExists, listFiles } from '../utils/fs.js';

const CI_SYSTEMS: Array<{
  name: string;
  indicators: string[];
}> = [
  { name: 'GitHub Actions', indicators: ['.github/workflows'] },
  { name: 'CircleCI', indicators: ['.circleci/config.yml', '.circleci/config.yaml'] },
  { name: 'Travis CI', indicators: ['.travis.yml'] },
  { name: 'GitLab CI', indicators: ['.gitlab-ci.yml'] },
  { name: 'Jenkins', indicators: ['Jenkinsfile'] },
  { name: 'Azure Pipelines', indicators: ['azure-pipelines.yml'] },
];

/**
 * Analyze CI/CD systems across repositories.
 * Detects CI platforms and flags conflicts.
 */
export async function analyzeCI(
  repoPaths: Array<{ path: string; name: string }>,
  logger: Logger,
): Promise<AnalysisFinding[]> {
  const findings: AnalysisFinding[] = [];
  const ciDetections: Array<{ repo: string; system: string; files: string[] }> = [];

  for (const repo of repoPaths) {
    for (const ci of CI_SYSTEMS) {
      for (const indicator of ci.indicators) {
        const fullPath = path.join(repo.path, indicator);
        if (await pathExists(fullPath)) {
          // For directories like .github/workflows, list files
          let files = [indicator];
          try {
            const dirFiles = await listFiles(fullPath);
            files = dirFiles.map((f) => path.join(indicator, f));
          } catch {
            // Not a directory, use as-is
          }
          ciDetections.push({ repo: repo.name, system: ci.name, files });
        }
      }
    }
  }

  // Report detected CI systems
  const systemCounts = new Map<string, string[]>();
  for (const d of ciDetections) {
    if (!systemCounts.has(d.system)) systemCounts.set(d.system, []);
    systemCounts.get(d.system)!.push(d.repo);
  }

  if (systemCounts.size > 1) {
    findings.push({
      id: 'ci-multiple-systems',
      title: 'Multiple CI/CD systems detected',
      severity: 'warn',
      confidence: 'high',
      evidence: [...systemCounts.entries()].map(([system, repos]) => ({
        path: repos.join(', '),
        snippet: `${system}: ${repos.length} repos`,
      })),
      suggestedAction: 'Standardize on a single CI system for the monorepo. GitHub Actions is recommended for GitHub-hosted repos.',
    });
  }

  // Check for workflow name conflicts (GitHub Actions specific)
  const ghWorkflows = ciDetections.filter((d) => d.system === 'GitHub Actions');
  if (ghWorkflows.length > 1) {
    const workflowNames = new Map<string, string[]>();
    for (const wf of ghWorkflows) {
      for (const file of wf.files) {
        const name = path.basename(file);
        if (!workflowNames.has(name)) workflowNames.set(name, []);
        workflowNames.get(name)!.push(wf.repo);
      }
    }

    for (const [name, repos] of workflowNames) {
      if (repos.length > 1) {
        findings.push({
          id: `ci-workflow-conflict-${name}`,
          title: `GitHub Actions workflow '${name}' exists in multiple repos`,
          severity: 'warn',
          confidence: 'high',
          evidence: repos.map((r) => ({
            path: r,
            snippet: `.github/workflows/${name}`,
          })),
          suggestedAction: 'Workflows will need to be merged or renamed during migration',
        });
      }
    }
  }

  // Check for repos with no CI
  const reposWithCI = new Set(ciDetections.map((d) => d.repo));
  const reposWithoutCI = repoPaths.filter((r) => !reposWithCI.has(r.name));
  if (reposWithoutCI.length > 0 && reposWithCI.size > 0) {
    findings.push({
      id: 'ci-missing',
      title: 'Some repositories have no CI configuration',
      severity: 'info',
      confidence: 'high',
      evidence: reposWithoutCI.map((r) => ({ path: r.name })),
      suggestedAction: 'Consider adding CI for these packages in the monorepo workflow',
    });
  }

  logger.debug(`CI analysis: ${findings.length} findings`);
  return findings;
}
