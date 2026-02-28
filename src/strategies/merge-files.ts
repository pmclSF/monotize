import path from 'node:path';
import type { FileCollision, FileCollisionStrategy, PackageManagerConfig } from '../types/index.js';
import { readFile, writeFile, pathExists } from '../utils/fs.js';

/**
 * Merge multiple .gitignore files into one
 */
export async function mergeGitignores(filePaths: string[]): Promise<string> {
  const allEntries = new Set<string>();

  for (const filePath of filePaths) {
    if (!(await pathExists(filePath))) continue;

    const content = await readFile(filePath);
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      allEntries.add(trimmed);
    }
  }

  // Build the merged content - sorted alphabetically
  const sorted = [...allEntries].sort();
  return sorted.join('\n') + '\n';
}

/**
 * Merge multiple ignore-style files (generic)
 */
export async function mergeIgnoreFiles(filePaths: string[]): Promise<string> {
  const allEntries = new Set<string>();

  for (const filePath of filePaths) {
    if (!(await pathExists(filePath))) continue;

    const content = await readFile(filePath);
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        allEntries.add(trimmed);
      }
    }
  }

  const sorted = [...allEntries].sort();
  return sorted.join('\n') + '\n';
}

/**
 * Generate a root README.md for the monorepo
 */
export function generateRootReadme(
  packageNames: string[],
  packagesDir: string,
  pmConfig?: PackageManagerConfig
): string {
  const packageList = packageNames
    .map((name) => `- [\`${name}\`](./${packagesDir}/${name})`)
    .join('\n');

  // Default to pnpm commands if no config provided
  const installCmd = pmConfig?.installCommand || 'pnpm install';
  const buildCmd = pmConfig?.runAllCommand('build') || 'pnpm -r build';
  const testCmd = pmConfig?.runAllCommand('test') || 'pnpm -r test';

  // Determine workspace config file for structure display
  const workspaceConfigFile = !pmConfig || pmConfig.type === 'pnpm' ? 'pnpm-workspace.yaml' : null;

  return `# Monorepo

This monorepo was created using [monorepo-cli](https://github.com/example/monorepo-cli).

## Packages

${packageList}

## Getting Started

\`\`\`bash
# Install dependencies
${installCmd}

# Build all packages
${buildCmd}

# Run tests
${testCmd}
\`\`\`

## Structure

\`\`\`
.
├── ${packagesDir}/
${packageNames.map((name) => `│   ├── ${name}/`).join('\n')}
├── package.json${workspaceConfigFile ? `\n└── ${workspaceConfigFile}` : ''}
\`\`\`
`;
}

/**
 * Pure variant of handleFileCollision that returns file content instead of writing to disk.
 * Used by the plan command to serialize collision resolution results into an ApplyPlan.
 */
export async function resolveFileCollisionToContent(
  collision: FileCollision,
  strategy: FileCollisionStrategy,
  repoPaths: Array<{ path: string; name: string }>
): Promise<Array<{ relativePath: string; content: string }>> {
  const getFilePath = (repoName: string) => {
    const repo = repoPaths.find((r) => r.name === repoName);
    return repo ? path.join(repo.path, collision.path) : '';
  };

  switch (strategy) {
    case 'merge': {
      const filePaths = collision.sources.map(getFilePath).filter(Boolean);
      const merged = collision.path.includes('gitignore')
        ? await mergeGitignores(filePaths)
        : await mergeIgnoreFiles(filePaths);
      return [{ relativePath: collision.path, content: merged }];
    }

    case 'keep-first': {
      const firstPath = getFilePath(collision.sources[0]);
      if (firstPath && (await pathExists(firstPath))) {
        const content = await readFile(firstPath);
        return [{ relativePath: collision.path, content }];
      }
      return [];
    }

    case 'keep-last': {
      const lastPath = getFilePath(collision.sources[collision.sources.length - 1]);
      if (lastPath && (await pathExists(lastPath))) {
        const content = await readFile(lastPath);
        return [{ relativePath: collision.path, content }];
      }
      return [];
    }

    case 'rename': {
      const results: Array<{ relativePath: string; content: string }> = [];
      for (const source of collision.sources) {
        const sourcePath = getFilePath(source);
        if (sourcePath && (await pathExists(sourcePath))) {
          const ext = path.extname(collision.path);
          const base = path.basename(collision.path, ext);
          const renamedName = `${base}.${source}${ext}`;
          const content = await readFile(sourcePath);
          results.push({ relativePath: renamedName, content });
        }
      }
      return results;
    }

    case 'skip':
      return [];
  }
}

/**
 * Handle a file collision based on the selected strategy
 */
export async function handleFileCollision(
  collision: FileCollision,
  strategy: FileCollisionStrategy,
  repoPaths: Array<{ path: string; name: string }>,
  outputDir: string
): Promise<void> {
  const getFilePath = (repoName: string) => {
    const repo = repoPaths.find((r) => r.name === repoName);
    return repo ? path.join(repo.path, collision.path) : '';
  };

  const outputPath = path.join(outputDir, collision.path);

  switch (strategy) {
    case 'merge': {
      const filePaths = collision.sources.map(getFilePath).filter(Boolean);
      const merged = collision.path.includes('gitignore')
        ? await mergeGitignores(filePaths)
        : await mergeIgnoreFiles(filePaths);
      await writeFile(outputPath, merged);
      break;
    }

    case 'keep-first': {
      const firstPath = getFilePath(collision.sources[0]);
      if (firstPath && (await pathExists(firstPath))) {
        const content = await readFile(firstPath);
        await writeFile(outputPath, content);
      }
      break;
    }

    case 'keep-last': {
      const lastPath = getFilePath(collision.sources[collision.sources.length - 1]);
      if (lastPath && (await pathExists(lastPath))) {
        const content = await readFile(lastPath);
        await writeFile(outputPath, content);
      }
      break;
    }

    case 'rename': {
      for (const source of collision.sources) {
        const sourcePath = getFilePath(source);
        if (sourcePath && (await pathExists(sourcePath))) {
          const ext = path.extname(collision.path);
          const base = path.basename(collision.path, ext);
          const renamedName = `${base}.${source}${ext}`;
          const renamedPath = path.join(outputDir, renamedName);
          const content = await readFile(sourcePath);
          await writeFile(renamedPath, content);
        }
      }
      break;
    }

    case 'skip':
      // Do nothing
      break;
  }
}
