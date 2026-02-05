import path from 'node:path';
import { execSync } from 'node:child_process';
import type { WorkspaceTool, PackageManagerConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { ensureDir, writeFile, writeJson, pathExists } from '../utils/fs.js';
import {
  generateWorkspaceToolConfig,
  getWorkspaceToolDependencies,
} from '../strategies/workspace-tools.js';
import {
  createPackageManagerConfig,
  generateWorkspaceFiles,
  getWorkspacesConfig,
  getPackageManagerField,
  parsePackageManagerType,
  validatePackageManager,
  getPackageManagerDisplayName,
  getGitignoreEntries,
} from '../strategies/package-manager.js';

/**
 * CLI options passed from commander
 */
interface CLIInitOptions {
  packagesDir?: string;
  workspaceTool?: string;
  packageManager?: string;
  git?: boolean;
  verbose?: boolean;
}

/**
 * Generate root package.json for a new monorepo
 */
function generateRootPackageJson(
  name: string,
  packagesDir: string,
  workspaceTool: WorkspaceTool,
  pmConfig: PackageManagerConfig
): Record<string, unknown> {
  const scripts: Record<string, string> = {};

  // Get the base run command based on workspace tool and package manager
  const getRunCommand = (script: string): string => {
    switch (workspaceTool) {
      case 'turbo':
        return `turbo run ${script}`;
      case 'nx':
        return `nx run-many --target=${script}`;
      case 'none':
      default:
        return pmConfig.runAllCommand(script);
    }
  };

  scripts.build = getRunCommand('build');
  scripts.test = getRunCommand('test');
  scripts.lint = getRunCommand('lint');
  scripts.dev = getRunCommand('dev');

  const packageJson: Record<string, unknown> = {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    packageManager: getPackageManagerField(pmConfig),
    scripts,
    engines: {
      node: '>=18',
    },
  };

  // Add workspaces field for yarn/npm
  const workspacesConfig = getWorkspacesConfig(pmConfig, packagesDir);
  if (workspacesConfig) {
    packageJson.workspaces = workspacesConfig;
  }

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
function generateGitignore(pmConfig: PackageManagerConfig): string {
  const pmEntries = getGitignoreEntries(pmConfig);
  const pmSection = pmEntries.length > 0 ? `\n# Package manager\n${pmEntries.join('\n')}\n` : '';

  return `# Dependencies
node_modules/

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
yarn-error.log*

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
${pmSection}`;
}

/**
 * Generate a basic README for the monorepo
 */
function generateReadme(
  name: string,
  packagesDir: string,
  workspaceTool: WorkspaceTool,
  pmConfig: PackageManagerConfig
): string {
  const pmName = pmConfig.type === 'yarn-berry' ? 'yarn' : pmConfig.type;
  const filterExample = pmConfig.runFilteredCommand('<package-name>', '<command>');

  let toolSection = '';

  switch (workspaceTool) {
    case 'turbo':
      toolSection = `
## Using Turborepo

This monorepo uses [Turborepo](https://turbo.build/) for task orchestration.

\`\`\`bash
# Run builds with caching
${pmName} run build

# Run tests across all packages
${pmName} run test

# Run development mode
${pmName} run dev
\`\`\`
`;
      break;
    case 'nx':
      toolSection = `
## Using Nx

This monorepo uses [Nx](https://nx.dev/) for task orchestration.

\`\`\`bash
# Run builds with caching
${pmName} run build

# Run tests across all packages
${pmName} run test

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
${pmConfig.runAllCommand('build')}

# Test all packages
${pmConfig.runAllCommand('test')}

# Run a command in a specific package
${filterExample}
\`\`\`
`;
  }

  // Determine workspace config file for structure display
  const workspaceConfigFile = pmConfig.type === 'pnpm' ? 'pnpm-workspace.yaml' : null;

  return `# ${name}

A ${getPackageManagerDisplayName(pmConfig.type)} monorepo workspace.

## Getting Started

\`\`\`bash
# Install dependencies
${pmConfig.installCommand}

# Build all packages
${pmConfig.runAllCommand('build')}
\`\`\`

## Structure

\`\`\`
${name}/
├── ${packagesDir}/         # Workspace packages
├── package.json${workspaceConfigFile ? `\n└── ${workspaceConfigFile}` : ''}
\`\`\`
${toolSection}
## Adding a Package

Create a new package in the \`${packagesDir}/\` directory:

\`\`\`bash
mkdir ${packagesDir}/my-package
cd ${packagesDir}/my-package
${pmName} init
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

  // Determine package manager
  const pmType = parsePackageManagerType(options.packageManager || 'pnpm');

  // Validate package manager is installed
  const pmValidation = validatePackageManager(pmType);
  if (!pmValidation.valid) {
    logger.error(pmValidation.error!);
    process.exit(1);
  }

  const pmConfig = createPackageManagerConfig(pmType);
  logger.debug(`Using package manager: ${getPackageManagerDisplayName(pmType)} v${pmConfig.version}`);

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
    const packageJson = generateRootPackageJson(name, packagesDir, workspaceTool, pmConfig);
    await writeJson(packageJsonPath, packageJson, { spaces: 2 });
    logger.debug('Created package.json');

    // Create workspace files (pnpm-workspace.yaml for pnpm)
    const workspaceFiles = generateWorkspaceFiles(pmConfig, packagesDir);
    for (const file of workspaceFiles) {
      await writeFile(path.join(targetDir, file.filename), file.content);
      logger.debug(`Created ${file.filename}`);
    }

    // Create workspace tool config
    if (workspaceTool !== 'none') {
      const toolConfig = generateWorkspaceToolConfig([], workspaceTool);
      if (toolConfig) {
        await writeFile(path.join(targetDir, toolConfig.filename), toolConfig.content);
        logger.debug(`Created ${toolConfig.filename}`);
      }
    }

    // Create .gitignore
    const gitignoreContent = generateGitignore(pmConfig);
    await writeFile(path.join(targetDir, '.gitignore'), gitignoreContent);
    logger.debug('Created .gitignore');

    // Create README.md
    const readmeContent = generateReadme(name, packagesDir, workspaceTool, pmConfig);
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
    logger.log(`  Package manager: ${getPackageManagerDisplayName(pmConfig.type)}`);
    if (workspaceTool !== 'none') {
      logger.log(`  Workspace tool: ${workspaceTool}`);
    }
    logger.log('');
    logger.log('Next steps:');
    if (directory) {
      logger.log(`  cd ${directory}`);
    }
    logger.log(`  ${pmConfig.installCommand}`);
    logger.log(`  # Create packages in ${packagesDir}/`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Init failed: ${message}`);
    process.exit(1);
  }
}
