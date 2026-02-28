import path from 'node:path';
import type { AnalysisFinding, Logger } from '../types/index.js';
import { pathExists, readJson } from '../utils/fs.js';

/**
 * Analyze publishing configuration across repositories.
 * Detects publishConfig, private:false, registry settings, etc.
 */
export async function analyzePublishing(
  repoPaths: Array<{ path: string; name: string }>,
  logger: Logger,
): Promise<AnalysisFinding[]> {
  const findings: AnalysisFinding[] = [];
  const publishablePackages: Array<{ repo: string; name: string; registry?: string }> = [];

  for (const repo of repoPaths) {
    const pkgPath = path.join(repo.path, 'package.json');
    if (!(await pathExists(pkgPath))) continue;

    try {
      const pkg = (await readJson(pkgPath)) as Record<string, unknown>;
      const isPrivate = pkg.private === true;
      const publishConfig = pkg.publishConfig as Record<string, string> | undefined;
      const pkgName = (pkg.name as string) || repo.name;

      // Detect publishable packages
      if (!isPrivate) {
        publishablePackages.push({
          repo: repo.name,
          name: pkgName,
          registry: publishConfig?.registry,
        });

        if (!publishConfig) {
          findings.push({
            id: `publishing-no-config-${repo.name}`,
            title: `${repo.name} is publishable but has no publishConfig`,
            severity: 'info',
            confidence: 'high',
            evidence: [{ path: pkgPath, snippet: `private: ${pkg.private ?? 'undefined'}` }],
            suggestedAction: 'Add publishConfig with access and registry settings',
          });
        }
      }

      // Detect custom registries
      if (publishConfig?.registry && publishConfig.registry !== 'https://registry.npmjs.org/') {
        findings.push({
          id: `publishing-custom-registry-${repo.name}`,
          title: `${repo.name} uses a custom registry`,
          severity: 'warn',
          confidence: 'high',
          evidence: [{ path: pkgPath, snippet: `registry: ${publishConfig.registry}` }],
          suggestedAction: 'Ensure the custom registry is accessible from the monorepo CI',
        });
      }

      // Detect files/main/exports configuration
      if (!isPrivate) {
        const hasMain = !!pkg.main;
        const hasExports = !!pkg.exports;
        const hasFiles = !!pkg.files;

        if (!hasMain && !hasExports) {
          findings.push({
            id: `publishing-no-entry-${repo.name}`,
            title: `${repo.name} has no main or exports field`,
            severity: 'info',
            confidence: 'medium',
            evidence: [{ path: pkgPath }],
            suggestedAction: 'Add main or exports field to package.json for proper module resolution',
          });
        }

        if (!hasFiles) {
          findings.push({
            id: `publishing-no-files-${repo.name}`,
            title: `${repo.name} has no files field`,
            severity: 'info',
            confidence: 'medium',
            evidence: [{ path: pkgPath }],
            suggestedAction: 'Add files field to limit published package contents',
          });
        }
      }
    } catch {
      // Skip malformed package.json
    }
  }

  // Summary finding
  if (publishablePackages.length > 0) {
    const registries = [...new Set(publishablePackages.map((p) => p.registry).filter(Boolean))];
    if (registries.length > 1) {
      findings.push({
        id: 'publishing-multiple-registries',
        title: 'Multiple npm registries in use',
        severity: 'warn',
        confidence: 'high',
        evidence: publishablePackages
          .filter((p) => p.registry)
          .map((p) => ({ path: p.repo, snippet: `registry: ${p.registry}` })),
        suggestedAction: 'Standardize on a single registry or configure per-package publishConfig',
      });
    }
  }

  logger.debug(`Publishing analysis: ${findings.length} findings`);
  return findings;
}
