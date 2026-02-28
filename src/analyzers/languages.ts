import type { LanguageDetection, Logger } from '../types/index.js';
import { pathExists, readFile } from '../utils/fs.js';
import path from 'node:path';

/**
 * Detect non-JS languages in repositories.
 * Checks for go.mod (Go), Cargo.toml (Rust), pyproject.toml / requirements.txt (Python).
 */
export async function detectLanguages(
  repoPaths: Array<{ path: string; name: string }>,
  logger?: Logger,
): Promise<LanguageDetection[]> {
  const detections: LanguageDetection[] = [];

  for (const repo of repoPaths) {
    const languages: LanguageDetection['languages'] = [];

    // Check Go
    const goMod = path.join(repo.path, 'go.mod');
    if (await pathExists(goMod)) {
      const content = await readFile(goMod);
      const moduleMatch = content.match(/^module\s+(.+)$/m);
      const metadata: Record<string, string> = {};
      if (moduleMatch?.[1]?.trim()) {
        metadata.module = moduleMatch[1].trim();
      }
      languages.push({
        name: 'go',
        markers: ['go.mod'],
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      });
    }

    // Check Rust
    const cargoToml = path.join(repo.path, 'Cargo.toml');
    if (await pathExists(cargoToml)) {
      const content = await readFile(cargoToml);
      const nameMatch = content.match(/^\[package\][\s\S]*?name\s*=\s*"([^"]+)"/m);
      const metadata: Record<string, string> = {};
      if (nameMatch?.[1]) {
        metadata.crate = nameMatch[1];
      }
      languages.push({
        name: 'rust',
        markers: ['Cargo.toml'],
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      });
    }

    // Check Python
    const pyproject = path.join(repo.path, 'pyproject.toml');
    const requirements = path.join(repo.path, 'requirements.txt');
    if (await pathExists(pyproject)) {
      languages.push({
        name: 'python',
        markers: ['pyproject.toml'],
      });
    } else if (await pathExists(requirements)) {
      languages.push({
        name: 'python',
        markers: ['requirements.txt'],
      });
    }

    if (languages.length > 0) {
      detections.push({
        repoName: repo.name,
        languages,
      });
    }
  }

  logger?.info(`Detected ${detections.reduce((sum, d) => sum + d.languages.length, 0)} non-JS language(s)`);
  return detections;
}
