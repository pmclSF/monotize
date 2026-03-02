import path from 'node:path';
import type { AnalysisFinding, Logger } from '../types/index.js';
import { pathExists, readJson } from '../utils/fs.js';

const TOOL_CONFIGS: Array<{
  name: string;
  category: string;
  files: string[];
}> = [
  { name: 'TypeScript', category: 'typescript', files: ['tsconfig.json', 'tsconfig.build.json'] },
  {
    name: 'ESLint',
    category: 'lint',
    files: ['.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc.js', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs'],
  },
  {
    name: 'Prettier',
    category: 'format',
    files: ['.prettierrc', '.prettierrc.json', '.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.js', '.prettierrc.cjs', 'prettier.config.js'],
  },
  {
    name: 'Jest',
    category: 'test',
    files: ['jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs'],
  },
  {
    name: 'Vitest',
    category: 'test',
    files: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'],
  },
];

/**
 * Analyze development tooling across repositories.
 * Detects TypeScript, lint, format, and test configurations.
 */
export async function analyzeTooling(
  repoPaths: Array<{ path: string; name: string }>,
  logger: Logger,
): Promise<AnalysisFinding[]> {
  const findings: AnalysisFinding[] = [];
  const toolPresence: Record<string, Array<{ repo: string; file: string }>> = {};

  for (const repo of repoPaths) {
    for (const tool of TOOL_CONFIGS) {
      for (const file of tool.files) {
        const filePath = path.join(repo.path, file);
        if (await pathExists(filePath)) {
          const key = tool.name;
          if (!toolPresence[key]) toolPresence[key] = [];
          toolPresence[key].push({ repo: repo.name, file });
        }
      }
    }

    // Check for test framework in package.json
    const pkgPath = path.join(repo.path, 'package.json');
    if (await pathExists(pkgPath)) {
      try {
        const pkg = (await readJson(pkgPath)) as Record<string, unknown>;
        const scripts = (pkg.scripts as Record<string, string>) || {};
        if (scripts.test && !scripts.test.includes('echo')) {
          // Has a real test script
        } else if (!scripts.test) {
          findings.push({
            id: `tooling-no-test-${repo.name}`,
            title: `No test script in ${repo.name}`,
            severity: 'info',
            confidence: 'high',
            evidence: [{ path: pkgPath, snippet: 'scripts.test is missing' }],
            suggestedAction: 'Add a test script to package.json',
          });
        }
      } catch {
        // Skip
      }
    }
  }

  // Flag inconsistencies
  for (const [tool, repos] of Object.entries(toolPresence)) {
    // Check if some repos use it and some don't
    const repoNames = new Set(repos.map((r) => r.repo));
    const allRepoNames = repoPaths.map((r) => r.name);
    const missing = allRepoNames.filter((r) => !repoNames.has(r));

    if (missing.length > 0 && repoNames.size > 0) {
      findings.push({
        id: `tooling-inconsistent-${tool.toLowerCase()}`,
        title: `${tool} not used consistently across repos`,
        severity: 'info',
        confidence: 'medium',
        evidence: [
          ...repos.map((r) => ({ path: r.repo, snippet: `has ${r.file}` })),
          ...missing.map((r) => ({ path: r, snippet: `missing ${tool} config` })),
        ],
        suggestedAction: `Consider standardizing ${tool} configuration across all packages`,
      });
    }

    // Check for JS configs that can't be safely merged
    const jsConfigs = repos.filter(
      (r) => r.file.endsWith('.js') || r.file.endsWith('.cjs') || r.file.endsWith('.mjs'),
    );
    if (jsConfigs.length > 0) {
      findings.push({
        id: `tooling-executable-config-${tool.toLowerCase()}`,
        title: `${tool} uses executable config files`,
        severity: 'warn',
        confidence: 'high',
        evidence: jsConfigs.map((r) => ({ path: path.join(r.repo, r.file) })),
        suggestedAction: `Executable ${tool} configs cannot be safely auto-merged. Manual review required.`,
      });
    }
  }

  logger.debug(`Tooling analysis: ${findings.length} findings`);
  return findings;
}
