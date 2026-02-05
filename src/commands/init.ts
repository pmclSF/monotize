import path from 'node:path';
import { execSync } from 'node:child_process';
import type { InitOptions, WorkspaceTool } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { ensureDir, writeFile, writeJson, pathExists } from '../utils/fs.js';
import {
  generateWorkspaceToolConfig,
  getWorkspaceToolDependencies,
} from '../strategies/workspace-tools.js';
import { generatePnpmWorkspaceYaml } from '../strategies/workspace-config.js';

/**
 * CLI options passed from commander
 */
interface CLIInitOptions {
  packagesDir?: string;
  workspaceTool?: string;
  git?: boolean;
  verbose?: boolean;
}

/**
 * Generate root package.json for a new monorepo
 */
function generateRootPackageJson(
  name: string,
  workspaceTool: WorkspaceTool
): Record<string, unknown> {
  const scripts: Record<string, string> = {};

  // Add workspace tool-specific scripts
  switch (workspaceTool) {
    case 'turbo':
      scripts.build = 'turbo run build';
      scripts.test = 'turbo run test';
      scripts.lint = 'turbo run lint';
      scripts.dev = 'turbo run dev';
      break;
    case 'nx':
      scripts.build = 'nx run-many --target=build';
      scripts.test = 'nx run-many --target=test';
      scripts.lint = 'nx run-many --target=lint';
      scripts.dev = 'nx run-many --target=dev';
      break;
    case 'none':
    default:
      scripts.build = 'pnpm -r build';
      scripts.test = 'pnpm -r test';
      scripts.lint = 'pnpm -r lint';
      scripts.dev = 'pnpm -r dev';
      break;
  }

  const packageJson: Record<string, unknown> = {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts,
    engines: {
      node: '>=18',
    },
  };

  // Add workspace tool as dev dependency
  const toolDeps = getWorkspaceToolDependencies(workspaceTool);
  if (Object.keys(toolDeps).length > 0) {
    packageJson.devDependencies = toolDeps;
  }

  return packageJson;
}

/**
 * Generate a basic .gitignore for the monorepo
 */
function generateGitignore(): string {
  return `# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
lib/
.next/
.nuxt/
.output/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Test coverage
coverage/

# Environment
.env
.env.local
.env.*.local

# Turbo
.turbo/

# Nx
.nx/
`;
}

/**
 * Generate a basic README for the monorepo
 */
function generateReadme(name: string, packagesDir: string, workspaceTool: WorkspaceTool): string {
  let toolSection = '';

  switch (workspaceTool) {
    case 'turbo':
      toolSection = `
## Using Turborepo

This monorepo uses [Turborepo](https://turbo.build/) for task orchestration.

\`\`\`bash
# Run builds with caching
pnpm build

# Run tests across all packages
pnpm test

# Run development mode
pnpm dev
\`\`\`
`;
      break;
    case 'nx':
      toolSection = `
## Using Nx

This monorepo uses [Nx](https://nx.dev/) for task orchestration.

\`\`\`bash
# Run builds with caching
pnpm build

# Run tests across all packages
pnpm test

# View dependency graph
npx nx graph
\`\`\`
`;
      break;
    default:
      toolSection = `
## Workspace Commands

\`\`\`bash
# Build all packages
pnpm build

# Test all packages
pnpm test

# Run a command in a specific package
pnpm --filter <package-name> <command>
\`\`\`
`;
  }

  return `# ${name}

A pnpm monorepo workspace.

## Getting Started

\`\`\`bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
\`\`\`

## Structure

\`\`\`
${name}/
├── ${packagesDir}/         # Workspace packages
├── package.json
└── pnpm-workspace.yaml
\`\`\`
${toolSection}
## Adding a Package

Create a new package in the \`${packagesDir}/\` directory:

\`\`\`bash
mkdir ${packagesDir}/my-package
cd ${packagesDir}/my-package
pnpm init
\`\`\`
`;
}

/**
 * Main init command handler
 */
export async function initCommand(
  directory: string | undefined,
  options: CLIInitOptions
): Promise<void> {
  const targetDir = directory ? path.resolve(directory) : process.cwd();
  const name = path.basename(targetDir);
  const packagesDir = options.packagesDir || 'packages';
  const workspaceTool = (options.workspaceTool as WorkspaceTool) || 'none';
  const initGit = options.git !== false; // Default to true

  const logger = createLogger(options.verbose);

  try {
    // Check if directory already has a package.json
    const packageJsonPath = path.join(targetDir, 'package.json');
    if (await pathExists(packageJsonPath)) {
      logger.error(`Directory already contains a package.json: ${targetDir}`);
      logger.info('Use "monorepo merge" to combine existing repositories.');
      process.exit(1);
    }

    logger.info(`Initializing monorepo in ${targetDir}...`);

    // Create directory structure
    await ensureDir(targetDir);
    await ensureDir(path.join(targetDir, packagesDir));
    logger.debug(`Created ${packagesDir}/ directory`);

    // Create package.json
    const packageJson = generateRootPackageJson(name, workspaceTool);
    await writeJson(packageJsonPath, packageJson, { spaces: 2 });
    logger.debug('Created package.json');

    // Create pnpm-workspace.yaml
    const pnpmWorkspaceContent = generatePnpmWorkspaceYaml(packagesDir);
    await writeFile(path.join(targetDir, 'pnpm-workspace.yaml'), pnpmWorkspaceContent);
    logger.debug('Created pnpm-workspace.yaml');

    // Create workspace tool config
    if (workspaceTool !== 'none') {
      const toolConfig = generateWorkspaceToolConfig([], workspaceTool);
      if (toolConfig) {
        await writeFile(path.join(targetDir, toolConfig.filename), toolConfig.content);
        logger.debug(`Created ${toolConfig.filename}`);
      }
    }

    // Create .gitignore
    const gitignoreContent = generateGitignore();
    await writeFile(path.join(targetDir, '.gitignore'), gitignoreContent);
    logger.debug('Created .gitignore');

    // Create README.md
    const readmeContent = generateReadme(name, packagesDir, workspaceTool);
    await writeFile(path.join(targetDir, 'README.md'), readmeContent);
    logger.debug('Created README.md');

    // Initialize git repository
    if (initGit) {
      try {
        const gitDir = path.join(targetDir, '.git');
        if (!(await pathExists(gitDir))) {
          execSync('git init', {
            cwd: targetDir,
            stdio: options.verbose ? 'inherit' : 'pipe',
          });
          logger.debug('Initialized git repository');
        } else {
          logger.debug('Git repository already exists');
        }
      } catch {
        logger.warn('Failed to initialize git repository');
      }
    }

    // Print success message
    logger.success(`Monorepo initialized successfully!`);
    logger.log('');
    logger.log(`  Location: ${targetDir}`);
    logger.log(`  Packages directory: ${packagesDir}/`);
    if (workspaceTool !== 'none') {
      logger.log(`  Workspace tool: ${workspaceTool}`);
    }
    logger.log('');
    logger.log('Next steps:');
    if (directory) {
      logger.log(`  cd ${directory}`);
    }
    logger.log('  pnpm install');
    logger.log(`  # Create packages in ${packagesDir}/`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Init failed: ${message}`);
    process.exit(1);
  }
}
