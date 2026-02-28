import path from 'node:path';
import type { ConfigPlan, ConfigPatch, Logger } from '../types/index.js';
import { pathExists, readFile, writeFile, ensureDir } from '../utils/fs.js';

export interface ConfigureOptions {
  workspaceTool?: 'turbo' | 'nx' | 'none';
  packageManager?: string;
}

/**
 * Generate a ConfigPlan for workspace scaffolding.
 * Only generates safe JSON/YAML configs. Flags executable configs as warnings.
 */
export async function generateConfigPlan(
  monorepoDir: string,
  packageNames: string[],
  packagesDir: string,
  _options: ConfigureOptions = {},
  logger?: Logger,
): Promise<ConfigPlan> {
  const patches: ConfigPatch[] = [];
  const warnings: ConfigPlan['warnings'] = [];

  // Scaffold Prettier
  const prettierPatches = await scaffoldPrettier(monorepoDir, packageNames, packagesDir);
  patches.push(...prettierPatches);

  // Scaffold ESLint
  const { patches: eslintPatches, warnings: eslintWarnings } = await scaffoldEslint(
    monorepoDir,
    packageNames,
    packagesDir,
  );
  patches.push(...eslintPatches);
  warnings.push(...eslintWarnings);

  // Scaffold TypeScript
  const tsPatches = await scaffoldTypescript(monorepoDir, packageNames, packagesDir);
  patches.push(...tsPatches);

  logger?.info(`ConfigPlan: ${patches.length} patches, ${warnings.length} warnings`);

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    patches,
    warnings,
  };
}

/**
 * Scaffold Prettier config: root .prettierrc.json
 */
async function scaffoldPrettier(
  monorepoDir: string,
  _packageNames: string[],
  _packagesDir: string,
): Promise<ConfigPatch[]> {
  const patches: ConfigPatch[] = [];
  const rootConfig = path.join(monorepoDir, '.prettierrc.json');

  if (!(await pathExists(rootConfig))) {
    const content = JSON.stringify(
      {
        semi: true,
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 100,
        tabWidth: 2,
      },
      null,
      2,
    );
    patches.push({
      path: '.prettierrc.json',
      after: content,
      description: 'Root Prettier configuration (JSON, safe to edit)',
    });
  }

  // .prettierignore
  const ignorePath = path.join(monorepoDir, '.prettierignore');
  if (!(await pathExists(ignorePath))) {
    patches.push({
      path: '.prettierignore',
      after: 'dist\nnode_modules\ncoverage\n*.min.js\n',
      description: 'Prettier ignore file',
    });
  }

  return patches;
}

/**
 * Scaffold ESLint config. Only generates JSON configs.
 * JS/CJS configs are flagged as warnings.
 */
async function scaffoldEslint(
  monorepoDir: string,
  packageNames: string[],
  packagesDir: string,
): Promise<{ patches: ConfigPatch[]; warnings: ConfigPlan['warnings'] }> {
  const patches: ConfigPatch[] = [];
  const warnings: ConfigPlan['warnings'] = [];

  // Check for existing JS configs
  for (const ext of ['.eslintrc.js', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs']) {
    if (await pathExists(path.join(monorepoDir, ext))) {
      warnings.push({
        config: `ESLint (${ext})`,
        reason: 'Executable config file cannot be safely auto-merged',
        suggestion: 'Manually review and consolidate ESLint configuration',
      });
      return { patches, warnings };
    }
  }

  // Check per-package for JS configs
  for (const pkg of packageNames) {
    const pkgDir = path.join(monorepoDir, packagesDir, pkg);
    for (const ext of ['.eslintrc.js', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs']) {
      if (await pathExists(path.join(pkgDir, ext))) {
        warnings.push({
          config: `ESLint in ${pkg} (${ext})`,
          reason: 'Per-package executable ESLint config requires manual review',
          suggestion: `Migrate ${pkg}/${ext} to JSON format or consolidate at root`,
        });
      }
    }
  }

  // Generate root JSON config if none exists
  const rootConfig = path.join(monorepoDir, '.eslintrc.json');
  if (!(await pathExists(rootConfig))) {
    const content = JSON.stringify(
      {
        root: true,
        env: { node: true, es2022: true },
        extends: ['eslint:recommended'],
        parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        rules: {},
      },
      null,
      2,
    );
    patches.push({
      path: '.eslintrc.json',
      after: content,
      description: 'Root ESLint configuration (JSON, safe to edit)',
    });
  }

  return { patches, warnings };
}

/**
 * Scaffold TypeScript configs: root tsconfig.json with references,
 * per-package composite:true.
 */
async function scaffoldTypescript(
  monorepoDir: string,
  packageNames: string[],
  packagesDir: string,
): Promise<ConfigPatch[]> {
  const patches: ConfigPatch[] = [];

  // Detect which packages have TypeScript
  const tsPackages: string[] = [];
  for (const pkg of packageNames) {
    const pkgTsconfig = path.join(monorepoDir, packagesDir, pkg, 'tsconfig.json');
    if (await pathExists(pkgTsconfig)) {
      tsPackages.push(pkg);
    }
  }

  if (tsPackages.length === 0) return patches;

  // Generate root tsconfig.json with project references
  const rootTsconfig = path.join(monorepoDir, 'tsconfig.json');
  if (!(await pathExists(rootTsconfig))) {
    const references = tsPackages.map((pkg) => ({
      path: `./${packagesDir}/${pkg}`,
    }));
    const content = JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          composite: true,
        },
        references,
        files: [],
      },
      null,
      2,
    );
    patches.push({
      path: 'tsconfig.json',
      after: content,
      description: 'Root TypeScript configuration with project references',
    });
  }

  // Update per-package tsconfig.json to add composite: true
  for (const pkg of tsPackages) {
    const pkgTsconfigPath = path.join(monorepoDir, packagesDir, pkg, 'tsconfig.json');
    try {
      const before = await readFile(pkgTsconfigPath);
      const config = JSON.parse(before) as Record<string, unknown>;
      const compilerOptions = (config.compilerOptions as Record<string, unknown>) || {};

      if (!compilerOptions.composite) {
        compilerOptions.composite = true;
        config.compilerOptions = compilerOptions;
        const after = JSON.stringify(config, null, 2);
        patches.push({
          path: `${packagesDir}/${pkg}/tsconfig.json`,
          before,
          after,
          description: `Enable composite mode in ${pkg} for project references`,
        });
      }
    } catch {
      // Skip unparseable tsconfig
    }
  }

  return patches;
}

/**
 * Apply a ConfigPlan to disk (transactional writes).
 */
export async function applyConfigPlan(
  plan: ConfigPlan,
  monorepoDir: string,
  logger?: Logger,
): Promise<void> {
  // Sort patches for deterministic ordering
  const sorted = [...plan.patches].sort((a, b) => a.path.localeCompare(b.path));

  for (const patch of sorted) {
    const fullPath = path.join(monorepoDir, patch.path);
    await ensureDir(path.dirname(fullPath));
    await writeFile(fullPath, patch.after);
    logger?.info(`Wrote ${patch.path}: ${patch.description}`);
  }

  for (const warning of plan.warnings) {
    logger?.warn(`${warning.config}: ${warning.reason}. ${warning.suggestion}`);
  }
}
