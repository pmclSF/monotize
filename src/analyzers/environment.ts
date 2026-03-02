import path from 'node:path';
import type { AnalysisFinding, Logger } from '../types/index.js';
import { pathExists, readFile, readJson } from '../utils/fs.js';

/**
 * Analyze Node.js environment signals across repositories.
 * Detects .nvmrc, .node-version, engines.node and flags mismatches.
 */
export async function analyzeEnvironment(
  repoPaths: Array<{ path: string; name: string }>,
  logger: Logger,
): Promise<AnalysisFinding[]> {
  const findings: AnalysisFinding[] = [];
  const nodeVersions: Array<{ repo: string; source: string; version: string }> = [];

  for (const repo of repoPaths) {
    // Check .nvmrc
    const nvmrcPath = path.join(repo.path, '.nvmrc');
    if (await pathExists(nvmrcPath)) {
      const content = (await readFile(nvmrcPath)).trim();
      nodeVersions.push({ repo: repo.name, source: '.nvmrc', version: content });
    }

    // Check .node-version
    const nodeVersionPath = path.join(repo.path, '.node-version');
    if (await pathExists(nodeVersionPath)) {
      const content = (await readFile(nodeVersionPath)).trim();
      nodeVersions.push({ repo: repo.name, source: '.node-version', version: content });
    }

    // Check engines.node in package.json
    const pkgPath = path.join(repo.path, 'package.json');
    if (await pathExists(pkgPath)) {
      try {
        const pkg = (await readJson(pkgPath)) as Record<string, unknown>;
        const engines = pkg.engines as Record<string, string> | undefined;
        if (engines?.node) {
          nodeVersions.push({ repo: repo.name, source: 'engines.node', version: engines.node });
        }
      } catch {
        // Skip malformed package.json
      }
    }

    // Check for missing version indicators
    const hasNvmrc = await pathExists(nvmrcPath);
    const hasNodeVersion = await pathExists(nodeVersionPath);
    if (!hasNvmrc && !hasNodeVersion) {
      findings.push({
        id: `env-no-node-version-${repo.name}`,
        title: `No Node.js version file in ${repo.name}`,
        severity: 'info',
        confidence: 'high',
        evidence: [{ path: repo.path }],
        suggestedAction: 'Add .nvmrc or .node-version file for consistent Node.js version',
      });
    }
  }

  // Detect mismatches
  const uniqueVersions = [...new Set(nodeVersions.map((v) => v.version))];
  if (uniqueVersions.length > 1) {
    findings.push({
      id: 'env-node-mismatch',
      title: 'Inconsistent Node.js versions across repositories',
      severity: 'warn',
      confidence: 'high',
      evidence: nodeVersions.map((v) => ({
        path: v.repo,
        snippet: `${v.source}: ${v.version}`,
      })),
      suggestedAction: `Standardize on a single Node.js version. Detected: ${uniqueVersions.join(', ')}`,
    });
  }

  logger.debug(`Environment analysis: ${findings.length} findings`);
  return findings;
}
