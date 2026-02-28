import path from 'node:path';
import fs from 'fs-extra';
import type { AnalysisFinding, Logger } from '../types/index.js';
import { pathExists, readFile, listFiles } from '../utils/fs.js';

const LARGE_FILE_THRESHOLD = 1_000_000; // 1 MB

/**
 * Analyze repository risks: submodules, LFS, large files, case collisions.
 */
export async function analyzeRepoRisks(
  repoPaths: Array<{ path: string; name: string }>,
  logger: Logger,
): Promise<AnalysisFinding[]> {
  const findings: AnalysisFinding[] = [];

  for (const repo of repoPaths) {
    // Check for git submodules
    const gitmodulesPath = path.join(repo.path, '.gitmodules');
    if (await pathExists(gitmodulesPath)) {
      const content = await readFile(gitmodulesPath);
      const submoduleCount = (content.match(/\[submodule/g) || []).length;
      findings.push({
        id: `risk-submodules-${repo.name}`,
        title: `${repo.name} contains git submodules`,
        severity: 'error',
        confidence: 'high',
        evidence: [{ path: gitmodulesPath, snippet: `${submoduleCount} submodule(s)` }],
        suggestedAction: 'Submodules must be resolved before migration. Inline or replace with npm dependencies.',
      });
    }

    // Check for LFS
    const gitattrsPath = path.join(repo.path, '.gitattributes');
    if (await pathExists(gitattrsPath)) {
      const content = await readFile(gitattrsPath);
      if (content.includes('filter=lfs')) {
        const lfsPatterns = content
          .split('\n')
          .filter((l) => l.includes('filter=lfs'))
          .map((l) => l.split(' ')[0]);
        findings.push({
          id: `risk-lfs-${repo.name}`,
          title: `${repo.name} uses Git LFS`,
          severity: 'warn',
          confidence: 'high',
          evidence: lfsPatterns.map((p) => ({
            path: gitattrsPath,
            snippet: `LFS tracked: ${p}`,
          })),
          suggestedAction: 'Ensure Git LFS is configured in the monorepo. LFS-tracked files must be migrated carefully.',
        });
      }
    }

    // Scan for large files (only root-level to avoid perf issues)
    try {
      const files = await listFiles(repo.path);
      for (const file of files) {
        const filePath = path.join(repo.path, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.size > LARGE_FILE_THRESHOLD) {
            findings.push({
              id: `risk-large-file-${repo.name}-${file}`,
              title: `Large file in ${repo.name}: ${file}`,
              severity: 'warn',
              confidence: 'high',
              evidence: [{ path: filePath, snippet: `${(stat.size / 1_000_000).toFixed(1)} MB` }],
              suggestedAction: 'Consider using Git LFS or removing large files before migration',
            });
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Skip if listing fails
    }
  }

  // Case collision detection across all repos
  const allFiles = new Map<string, Array<{ repo: string; file: string }>>();
  for (const repo of repoPaths) {
    try {
      const files = await listFiles(repo.path);
      for (const file of files) {
        const lower = file.toLowerCase();
        if (!allFiles.has(lower)) allFiles.set(lower, []);
        allFiles.get(lower)!.push({ repo: repo.name, file });
      }
    } catch {
      // Skip
    }
  }

  for (const [, entries] of allFiles) {
    const uniqueNames = [...new Set(entries.map((e) => e.file))];
    if (uniqueNames.length > 1) {
      findings.push({
        id: `risk-case-collision-${uniqueNames[0]}`,
        title: `Case collision: ${uniqueNames.join(' vs ')}`,
        severity: 'error',
        confidence: 'high',
        evidence: entries.map((e) => ({ path: e.repo, snippet: e.file })),
        suggestedAction: 'Rename one of the files to avoid case-insensitive filesystem conflicts',
      });
    }
  }

  logger.debug(`Repo risks analysis: ${findings.length} findings`);
  return findings;
}
