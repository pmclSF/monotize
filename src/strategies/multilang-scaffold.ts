import type { PlanFile, LanguageDetection, AnalysisFinding } from '../types/index.js';

/**
 * Extract languages of a specific type from detections.
 */
function filterByLanguage(
  detections: LanguageDetection[],
  lang: 'go' | 'rust' | 'python',
): Array<{ repoName: string; markers: string[]; metadata?: Record<string, string> }> {
  const results: Array<{ repoName: string; markers: string[]; metadata?: Record<string, string> }> = [];
  for (const detection of detections) {
    for (const language of detection.languages) {
      if (language.name === lang) {
        results.push({
          repoName: detection.repoName,
          markers: language.markers,
          metadata: language.metadata,
        });
      }
    }
  }
  return results;
}

/**
 * Generate go.work for Go modules.
 */
export function scaffoldGoWorkspace(
  detections: LanguageDetection[],
  packagesDir: string,
): PlanFile {
  const goModules = filterByLanguage(detections, 'go');
  const useDirectives = goModules
    .map((m) => `\t./${packagesDir}/${m.repoName}`)
    .join('\n');

  return {
    relativePath: 'go.work',
    content: `go 1.21\n\nuse (\n${useDirectives}\n)\n`,
  };
}

/**
 * Generate workspace Cargo.toml for Rust crates.
 */
export function scaffoldRustWorkspace(
  detections: LanguageDetection[],
  packagesDir: string,
): PlanFile {
  const crates = filterByLanguage(detections, 'rust');
  const members = crates
    .map((c) => `    "${packagesDir}/${c.repoName}"`)
    .join(',\n');

  return {
    relativePath: 'Cargo.toml',
    content: `[workspace]\nmembers = [\n${members}\n]\n`,
  };
}

/**
 * Generate recommendations for Python projects (no standard workspace protocol).
 */
export function generatePythonRecommendations(
  detections: LanguageDetection[],
): AnalysisFinding[] {
  const pyProjects = filterByLanguage(detections, 'python');
  return pyProjects.map((p) => ({
    id: `python-workspace-${p.repoName}`,
    title: `Python project detected in ${p.repoName}`,
    severity: 'info' as const,
    confidence: 'high' as const,
    evidence: [{ path: p.markers[0] }],
    suggestedAction: p.markers[0] === 'pyproject.toml'
      ? 'Consider using uv workspaces or poetry for Python monorepo management'
      : 'Consider migrating from requirements.txt to pyproject.toml for better monorepo support',
  }));
}
