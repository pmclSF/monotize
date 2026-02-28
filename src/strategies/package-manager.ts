import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PackageManagerType, PackageManagerConfig } from '../types/index.js';
import { pathExists } from '../utils/fs.js';

/**
 * Get the installed version of a package manager
 */
export function getPackageManagerVersion(pm: PackageManagerType): string {
  const command = pm === 'yarn-berry' ? 'yarn' : pm;
  try {
    const version = execFileSync(command, ['--version'], { encoding: 'utf-8' }).trim();
    return version;
  } catch {
    // Default fallback versions
    switch (pm) {
      case 'pnpm':
        return '9.0.0';
      case 'yarn':
        return '1.22.22';
      case 'yarn-berry':
        return '4.0.0';
      case 'npm':
        return '10.0.0';
    }
  }
}

/**
 * Check if a package manager is installed
 */
export function isPackageManagerInstalled(pm: PackageManagerType): boolean {
  const command = pm === 'yarn-berry' ? 'yarn' : pm;
  try {
    execFileSync(command, ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that a package manager is installed and available
 */
export function validatePackageManager(pm: PackageManagerType): { valid: boolean; error?: string } {
  const command = pm === 'yarn-berry' ? 'yarn' : pm;

  if (!isPackageManagerInstalled(pm)) {
    const installInstructions: Record<PackageManagerType, string> = {
      pnpm: 'Install with: npm install -g pnpm',
      yarn: 'Install with: npm install -g yarn',
      'yarn-berry': 'Install with: npm install -g yarn',
      npm: 'npm should be installed with Node.js',
    };
    return {
      valid: false,
      error: `${command} is not installed. ${installInstructions[pm]}`,
    };
  }

  return { valid: true };
}

/**
 * Detect if yarn berry is being used (vs classic yarn)
 */
export async function isYarnBerry(dirPath?: string): Promise<boolean> {
  // Check for .yarnrc.yml file (yarn berry indicator)
  if (dirPath) {
    const yarnrcPath = path.join(dirPath, '.yarnrc.yml');
    if (await pathExists(yarnrcPath)) {
      return true;
    }
  }

  // Check yarn version
  try {
    const version = execFileSync('yarn', ['--version'], { encoding: 'utf-8' }).trim();
    const majorVersion = parseInt(version.split('.')[0], 10);
    return majorVersion >= 2;
  } catch {
    return false;
  }
}

/**
 * Create a package manager configuration
 */
export function createPackageManagerConfig(pm: PackageManagerType): PackageManagerConfig {
  const version = getPackageManagerVersion(pm);

  switch (pm) {
    case 'pnpm':
      return {
        type: 'pnpm',
        version,
        installCommand: 'pnpm install --ignore-scripts',
        runAllCommand: (script: string) => `pnpm -r ${script}`,
        runFilteredCommand: (pkg: string, script: string) => `pnpm --filter ${pkg} ${script}`,
        lockFile: 'pnpm-lock.yaml',
        workspaceProtocol: 'workspace:*',
        gitignoreEntries: ['.pnpm-store/'],
      };

    case 'yarn':
      return {
        type: 'yarn',
        version,
        installCommand: 'yarn install --ignore-scripts',
        runAllCommand: (script: string) => `yarn workspaces run ${script}`,
        runFilteredCommand: (pkg: string, script: string) => `yarn workspace ${pkg} ${script}`,
        lockFile: 'yarn.lock',
        workspaceProtocol: '*',
        gitignoreEntries: [],
      };

    case 'yarn-berry':
      return {
        type: 'yarn-berry',
        version,
        installCommand: 'yarn install --ignore-scripts',
        runAllCommand: (script: string) => `yarn workspaces foreach run ${script}`,
        runFilteredCommand: (pkg: string, script: string) => `yarn workspace ${pkg} ${script}`,
        lockFile: 'yarn.lock',
        workspaceProtocol: 'workspace:*',
        gitignoreEntries: ['.yarn/', '!.yarn/patches', '!.yarn/plugins', '!.yarn/releases', '!.yarn/sdks', '!.yarn/versions'],
      };

    case 'npm':
      return {
        type: 'npm',
        version,
        installCommand: 'npm install --ignore-scripts',
        runAllCommand: (script: string) => `npm run ${script} -ws`,
        runFilteredCommand: (pkg: string, script: string) => `npm run ${script} -w ${pkg}`,
        lockFile: 'package-lock.json',
        workspaceProtocol: '*',
        gitignoreEntries: ['.npm/'],
      };
  }
}

/**
 * Detect package manager from lock file in a directory
 */
export async function detectPackageManager(dirPath: string): Promise<PackageManagerType | null> {
  // Check for pnpm
  if (await pathExists(path.join(dirPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  // Check for yarn
  if (await pathExists(path.join(dirPath, 'yarn.lock'))) {
    // Determine if it's yarn berry or classic
    if (await isYarnBerry(dirPath)) {
      return 'yarn-berry';
    }
    return 'yarn';
  }

  // Check for npm
  if (await pathExists(path.join(dirPath, 'package-lock.json'))) {
    return 'npm';
  }

  return null;
}

/**
 * Detect package manager from multiple repository sources
 * Returns the most common package manager found, or null if none detected
 */
export async function detectPackageManagerFromSources(
  repoPaths: Array<{ path: string; name: string }>
): Promise<PackageManagerType | null> {
  const pmCounts = new Map<PackageManagerType, number>();

  for (const repo of repoPaths) {
    const pm = await detectPackageManager(repo.path);
    if (pm) {
      pmCounts.set(pm, (pmCounts.get(pm) || 0) + 1);
    }
  }

  if (pmCounts.size === 0) {
    return null;
  }

  // Return the most common package manager
  let maxCount = 0;
  let mostCommon: PackageManagerType | null = null;

  for (const [pm, count] of pmCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = pm;
    }
  }

  return mostCommon;
}

/**
 * Generate workspace configuration files for a package manager
 */
export function generateWorkspaceFiles(
  pm: PackageManagerConfig,
  packagesDir: string
): Array<{ filename: string; content: string }> {
  const files: Array<{ filename: string; content: string }> = [];

  switch (pm.type) {
    case 'pnpm':
      // pnpm uses pnpm-workspace.yaml
      files.push({
        filename: 'pnpm-workspace.yaml',
        content: `packages:
  - '${packagesDir}/*'
`,
      });
      break;

    case 'yarn':
    case 'yarn-berry':
    case 'npm':
      // yarn and npm use workspaces field in package.json
      // This is handled in the package.json generation, not as a separate file
      break;
  }

  return files;
}

/**
 * Get the workspaces configuration for package.json
 * Returns the workspaces array for yarn/npm, or undefined for pnpm
 */
export function getWorkspacesConfig(
  pm: PackageManagerConfig,
  packagesDir: string
): string[] | undefined {
  switch (pm.type) {
    case 'yarn':
    case 'yarn-berry':
    case 'npm':
      return [`${packagesDir}/*`];
    case 'pnpm':
      // pnpm uses pnpm-workspace.yaml instead
      return undefined;
  }
}

/**
 * Get PM-specific gitignore entries
 */
export function getGitignoreEntries(pm: PackageManagerConfig): string[] {
  return pm.gitignoreEntries;
}

/**
 * Get the packageManager field value for package.json
 */
export function getPackageManagerField(pm: PackageManagerConfig): string {
  const pmName = pm.type === 'yarn-berry' ? 'yarn' : pm.type;
  return `${pmName}@${pm.version}`;
}

/**
 * Parse package manager type from CLI input
 */
export function parsePackageManagerType(input: string): PackageManagerType {
  const normalized = input.toLowerCase().trim();

  switch (normalized) {
    case 'pnpm':
      return 'pnpm';
    case 'yarn':
      return 'yarn';
    case 'yarn-berry':
    case 'yarn2':
    case 'yarn3':
    case 'yarn4':
      return 'yarn-berry';
    case 'npm':
      return 'npm';
    default:
      return 'pnpm'; // Default to pnpm
  }
}

/**
 * Get user-friendly name for display
 */
export function getPackageManagerDisplayName(pm: PackageManagerType): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm';
    case 'yarn':
      return 'yarn (classic)';
    case 'yarn-berry':
      return 'yarn (berry)';
    case 'npm':
      return 'npm';
  }
}
