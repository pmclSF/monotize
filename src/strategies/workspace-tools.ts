import type {
  PackageInfo,
  WorkspaceTool,
  TurboConfig,
  TurboTask,
  NxConfig,
  NxTargetDefault,
  PackageManagerConfig,
} from '../types/index.js';

/**
 * Common script names that should be configured in workspace tools
 */
const COMMON_SCRIPTS = ['build', 'test', 'lint', 'typecheck', 'dev', 'start', 'clean'] as const;

/**
 * Script dependencies - what scripts depend on other scripts
 */
const SCRIPT_DEPENDENCIES: Record<string, string[]> = {
  build: ['^build'], // Build depends on dependencies being built first
  test: ['build'], // Test depends on build
  lint: [], // Lint has no dependencies
  typecheck: ['^build'], // Typecheck depends on dependencies
  dev: ['^build'], // Dev depends on dependencies
  start: ['build'], // Start depends on build
  clean: [], // Clean has no dependencies
};

/**
 * Script outputs for caching
 */
const SCRIPT_OUTPUTS: Record<string, string[]> = {
  build: ['dist/**', 'lib/**', 'build/**', '.next/**', '.nuxt/**'],
  test: ['coverage/**'],
  lint: [],
  typecheck: [],
  dev: [],
  start: [],
  clean: [],
};

/**
 * Environment variables that affect builds
 */
const BUILD_ENV_VARS = ['NODE_ENV', 'CI'];

/**
 * Get scripts that exist in at least one package
 */
function getAvailableScripts(packages: PackageInfo[]): string[] {
  const scripts = new Set<string>();
  for (const pkg of packages) {
    for (const script of Object.keys(pkg.scripts)) {
      scripts.add(script);
    }
  }
  return Array.from(scripts);
}

/**
 * Filter dependencies to only include scripts that actually exist
 */
function filterDependencies(deps: string[], availableScripts: string[]): string[] {
  return deps.filter((dep) => {
    // Handle ^dependency syntax (e.g., ^build means dependency's build)
    const scriptName = dep.startsWith('^') ? dep.slice(1) : dep;
    return availableScripts.includes(scriptName);
  });
}

/**
 * Generate Turborepo configuration
 */
export function generateTurboConfig(packages: PackageInfo[]): TurboConfig {
  const availableScripts = getAvailableScripts(packages);
  const tasks: Record<string, TurboTask> = {};

  for (const script of COMMON_SCRIPTS) {
    // Only add task if at least one package has this script
    if (!availableScripts.includes(script)) {
      continue;
    }

    const task: TurboTask = {};

    // Add dependencies - but only if those scripts actually exist
    const deps = SCRIPT_DEPENDENCIES[script];
    if (deps && deps.length > 0) {
      const filteredDeps = filterDependencies(deps, availableScripts);
      if (filteredDeps.length > 0) {
        task.dependsOn = filteredDeps;
      }
    }

    // Add outputs for caching
    const outputs = SCRIPT_OUTPUTS[script];
    if (outputs && outputs.length > 0) {
      task.outputs = outputs;
    }

    // Configure caching
    if (script === 'dev' || script === 'start') {
      task.cache = false;
      task.persistent = true;
    }

    // Add environment variables for build tasks
    if (script === 'build') {
      task.env = BUILD_ENV_VARS;
    }

    tasks[script] = task;
  }

  return {
    $schema: 'https://turbo.build/schema.json',
    tasks,
  };
}

/**
 * Generate Nx configuration
 */
export function generateNxConfig(packages: PackageInfo[]): NxConfig {
  const availableScripts = getAvailableScripts(packages);
  const targetDefaults: Record<string, NxTargetDefault> = {};

  for (const script of COMMON_SCRIPTS) {
    // Only add target if at least one package has this script
    if (!availableScripts.includes(script)) {
      continue;
    }

    const target: NxTargetDefault = {};

    // Add dependencies - but only if those scripts actually exist
    const deps = SCRIPT_DEPENDENCIES[script];
    if (deps && deps.length > 0) {
      const filteredDeps = filterDependencies(deps, availableScripts);
      if (filteredDeps.length > 0) {
        // Convert Turbo syntax to Nx syntax
        target.dependsOn = filteredDeps.map((dep) => {
          if (dep.startsWith('^')) {
            return `^${dep.slice(1)}`; // Nx uses same syntax for dependencies
          }
          return dep;
        });
      }
    }

    // Add outputs for caching
    const outputs = SCRIPT_OUTPUTS[script];
    if (outputs && outputs.length > 0) {
      // Nx uses {projectRoot} prefix
      target.outputs = outputs.map((output) => `{projectRoot}/${output}`);
    }

    // Configure caching
    if (script === 'dev' || script === 'start') {
      target.cache = false;
    } else {
      target.cache = true;
    }

    // Add inputs for cache invalidation
    if (script === 'build' || script === 'test' || script === 'typecheck') {
      target.inputs = ['production', '^production'];
    } else if (script === 'lint') {
      target.inputs = ['default'];
    }

    targetDefaults[script] = target;
  }

  return {
    $schema: 'https://nx.dev/reference/nx-json',
    namedInputs: {
      default: ['{projectRoot}/**/*', 'sharedGlobals'],
      production: [
        'default',
        '!{projectRoot}/**/*.test.ts',
        '!{projectRoot}/**/*.spec.ts',
        '!{projectRoot}/test/**/*',
        '!{projectRoot}/tests/**/*',
      ],
      sharedGlobals: ['{workspaceRoot}/tsconfig.base.json', '{workspaceRoot}/package.json'],
    },
    targetDefaults,
    defaultBase: 'main',
  };
}

/**
 * Generate workspace tool configuration based on the tool type
 */
export function generateWorkspaceToolConfig(
  packages: PackageInfo[],
  tool: WorkspaceTool
): { filename: string; content: string } | null {
  switch (tool) {
    case 'turbo': {
      const config = generateTurboConfig(packages);
      return {
        filename: 'turbo.json',
        content: JSON.stringify(config, null, 2) + '\n',
      };
    }
    case 'nx': {
      const config = generateNxConfig(packages);
      return {
        filename: 'nx.json',
        content: JSON.stringify(config, null, 2) + '\n',
      };
    }
    case 'none':
    default:
      return null;
  }
}

/**
 * Get the package manager run command for a workspace tool
 */
export function getWorkspaceToolRunCommand(tool: WorkspaceTool, pmConfig?: PackageManagerConfig): string {
  switch (tool) {
    case 'turbo':
      return 'turbo run';
    case 'nx':
      return 'nx run-many --target=';
    case 'none':
    default:
      // Use the package manager's run command if provided
      if (pmConfig) {
        return pmConfig.runAllCommand('').replace(/\s+$/, ''); // Get the base command
      }
      return 'pnpm -r';
  }
}

/**
 * Get dependencies required for a workspace tool
 */
export function getWorkspaceToolDependencies(tool: WorkspaceTool): Record<string, string> {
  switch (tool) {
    case 'turbo':
      return { turbo: '^2.0.0' };
    case 'nx':
      return { nx: '^19.0.0' };
    case 'none':
    default:
      return {};
  }
}

/**
 * Update package.json scripts for workspace tool
 */
export function updateScriptsForWorkspaceTool(
  scripts: Record<string, string>,
  tool: WorkspaceTool,
  availableScripts: string[]
): Record<string, string> {
  const updatedScripts = { ...scripts };

  for (const script of COMMON_SCRIPTS) {
    if (!availableScripts.includes(script)) {
      continue;
    }

    switch (tool) {
      case 'turbo':
        updatedScripts[script] = `turbo run ${script}`;
        break;
      case 'nx':
        updatedScripts[script] = `nx run-many --target=${script}`;
        break;
      case 'none':
      default:
        // Keep the default pnpm -r scripts
        break;
    }
  }

  return updatedScripts;
}
