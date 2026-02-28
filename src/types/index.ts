/**
 * Package manager type
 */
export type PackageManagerType = 'pnpm' | 'yarn' | 'yarn-berry' | 'npm';

/**
 * Package manager configuration
 */
export interface PackageManagerConfig {
  /** Package manager type */
  type: PackageManagerType;
  /** Package manager version */
  version: string;
  /** Command to install dependencies */
  installCommand: string;
  /** Generate command to run a script across all packages */
  runAllCommand: (script: string) => string;
  /** Generate command to run a script in a specific package */
  runFilteredCommand: (pkg: string, script: string) => string;
  /** Lock file name */
  lockFile: string;
  /** Workspace protocol for internal dependencies */
  workspaceProtocol: string;
  /** Entries to add to .gitignore */
  gitignoreEntries: string[];
}

/**
 * Type of repository source
 */
export type RepoSourceType = 'github' | 'gitlab' | 'url' | 'local';

/**
 * Parsed repository input
 */
export interface RepoSource {
  /** Type of source (github, gitlab, url, local) */
  type: RepoSourceType;
  /** Original input string */
  original: string;
  /** Resolved URL or path */
  resolved: string;
  /** Derived package name */
  name: string;
}

/**
 * Package.json data with metadata
 */
export interface PackageInfo {
  /** Package name from package.json */
  name: string;
  /** Package version */
  version: string;
  /** All dependencies (combined) */
  dependencies: Record<string, string>;
  /** Dev dependencies */
  devDependencies: Record<string, string>;
  /** Peer dependencies */
  peerDependencies: Record<string, string>;
  /** Scripts from package.json */
  scripts: Record<string, string>;
  /** Path to the package directory */
  path: string;
  /** Name of the source repository */
  repoName: string;
}

/**
 * Severity of a dependency conflict
 */
export type ConflictSeverity = 'minor' | 'major' | 'incompatible';

/**
 * A dependency conflict between packages
 */
export interface DependencyConflict {
  /** Name of the conflicting dependency */
  name: string;
  /** Version requirements from each package */
  versions: Array<{
    version: string;
    source: string;
    type: 'dependencies' | 'devDependencies' | 'peerDependencies';
  }>;
  /** Severity of the conflict */
  severity: ConflictSeverity;
}

/**
 * Strategy for handling file collisions
 */
export type FileCollisionStrategy = 'merge' | 'keep-first' | 'keep-last' | 'rename' | 'skip';

/**
 * A file collision between repositories
 */
export interface FileCollision {
  /** Relative path of the colliding file */
  path: string;
  /** Sources where the file exists */
  sources: string[];
  /** Suggested handling strategy */
  suggestedStrategy: FileCollisionStrategy;
}

/**
 * Strategy for resolving dependency conflicts
 */
export type ConflictStrategy = 'highest' | 'lowest' | 'prompt';

/**
 * Options for the merge command
 */
export interface MergeOptions {
  /** Output directory for the monorepo */
  output: string;
  /** Subdirectory for packages */
  packagesDir: string;
  /** Show plan without executing */
  dryRun?: boolean;
  /** Skip prompts, use defaults */
  yes?: boolean;
  /** Strategy for resolving dependency conflicts */
  conflictStrategy: ConflictStrategy;
  /** Enable verbose output */
  verbose?: boolean;
  /** Skip running package install */
  install: boolean;
  /** Don't hoist dependencies to root - keeps each package isolated */
  noHoist?: boolean;
  /** Pin dependency versions by removing ^ and ~ ranges */
  pinVersions?: boolean;
}

/**
 * Result of the merge operation
 */
export interface MergeResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Path to the created monorepo */
  outputPath: string;
  /** Number of packages merged */
  packageCount: number;
  /** Conflicts that were resolved */
  resolvedConflicts: DependencyConflict[];
  /** Files that were merged or handled */
  handledFiles: FileCollision[];
  /** Any warnings generated */
  warnings: string[];
}

/**
 * Result of dependency analysis
 */
export interface DependencyAnalysis {
  /** All packages found */
  packages: PackageInfo[];
  /** Detected conflicts */
  conflicts: DependencyConflict[];
  /** All unique dependencies with their resolved versions */
  resolvedDependencies: Record<string, string>;
  /** All unique dev dependencies with their resolved versions */
  resolvedDevDependencies: Record<string, string>;
}

/**
 * Validation result for repo sources
 */
export interface ValidationResult {
  /** Whether all sources are valid */
  valid: boolean;
  /** Error messages for invalid sources */
  errors: string[];
  /** Validated and parsed sources */
  sources: RepoSource[];
}

/**
 * Workspace configuration for the monorepo
 */
export interface WorkspaceConfig {
  /** Root package.json content */
  rootPackageJson: Record<string, unknown>;
  /** pnpm-workspace.yaml content */
  pnpmWorkspace: {
    packages: string[];
  };
}

/**
 * Logger interface for consistent output
 */
export interface Logger {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
  log: (message: string) => void;
}

// ============================================================================
// Phase 2: Advanced Monorepo Features
// ============================================================================

/**
 * Workspace orchestration tool
 */
export type WorkspaceTool = 'turbo' | 'nx' | 'none';

/**
 * Options for git history preservation
 */
export interface HistoryPreserveOptions {
  /** Target subdirectory for the repository */
  targetDir: string;
  /** Whether to rewrite paths in commit history */
  rewritePaths: boolean;
  /** Optional prefix for commit messages */
  commitPrefix?: string;
}

/**
 * Strategy for merging CI/CD workflows
 */
export type WorkflowMergeStrategy = 'combine' | 'keep-first' | 'keep-last' | 'skip';

/**
 * Options for workflow merging
 */
export interface WorkflowMergeOptions {
  /** Strategy for merging workflows */
  strategy: WorkflowMergeStrategy;
  /** Output directory for merged workflows */
  outputDir: string;
}

/**
 * A cross-dependency between packages in the monorepo
 */
export interface CrossDependency {
  /** The package that has the dependency */
  fromPackage: string;
  /** The package being depended on */
  toPackage: string;
  /** Current version specifier */
  currentVersion: string;
  /** Type of dependency */
  dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies';
}

/**
 * Options for the analyze command
 */
export interface AnalyzeOptions {
  /** Repository sources to analyze */
  repos: string[];
  /** Enable verbose output */
  verbose?: boolean;
  /** Output as JSON */
  json?: boolean;
}

/**
 * Result of the analyze command
 */
export interface AnalyzeResult {
  /** Packages found in the repositories */
  packages: PackageInfo[];
  /** Dependency conflicts detected */
  conflicts: DependencyConflict[];
  /** File collisions detected */
  collisions: FileCollision[];
  /** Cross-dependencies between packages */
  crossDependencies: CrossDependency[];
  /** Complexity score (0-100) */
  complexityScore: number;
  /** Recommendations for the merge */
  recommendations: string[];
}

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Name for the monorepo */
  name?: string;
  /** Subdirectory for packages */
  packagesDir?: string;
  /** Workspace tool to configure */
  workspaceTool?: WorkspaceTool;
  /** Initialize git repository */
  gitInit?: boolean;
}

/**
 * Extended merge options with Phase 2 features
 */
export interface MergeOptionsExtended extends MergeOptions {
  /** Preserve git commit history */
  preserveHistory?: boolean;
  /** Workspace tool to generate config for */
  workspaceTool?: WorkspaceTool;
  /** Strategy for merging CI/CD workflows */
  workflowStrategy?: WorkflowMergeStrategy;
}

/**
 * Turbo.json configuration
 */
export interface TurboConfig {
  $schema: string;
  tasks: Record<string, TurboTask>;
}

/**
 * A task in turbo.json
 */
export interface TurboTask {
  dependsOn?: string[];
  outputs?: string[];
  cache?: boolean;
  persistent?: boolean;
  env?: string[];
  inputs?: string[];
}

/**
 * Nx configuration (nx.json)
 */
export interface NxConfig {
  $schema: string;
  targetDefaults: Record<string, NxTargetDefault>;
  namedInputs?: Record<string, string[]>;
  defaultBase?: string;
}

/**
 * Default target configuration in Nx
 */
export interface NxTargetDefault {
  dependsOn?: string[];
  inputs?: string[];
  outputs?: string[];
  cache?: boolean;
}

// ============================================================================
// Stage 2: Transactional Apply
// ============================================================================

/**
 * Step identifiers for the apply operation.
 * Each step is idempotent and independently resumable.
 */
export type ApplyStepId =
  | 'header'
  | 'scaffold'
  | 'move-packages'
  | 'write-root'
  | 'write-extras'
  | 'install';

/**
 * A single entry in the operation log (JSONL)
 */
export interface OperationLogEntry {
  /** Step identifier */
  id: ApplyStepId | string;
  /** Status of the step */
  status: 'started' | 'completed' | 'failed';
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Hash of the plan file (header entry only) */
  planHash?: string;
  /** Inputs consumed by this step */
  inputs?: string[];
  /** Outputs produced by this step */
  outputs?: string[];
  /** Duration in milliseconds */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Source entry in the plan file. Describes a repo to place into the monorepo.
 */
export interface PlanSource {
  /** Name used as the package directory name */
  name: string;
  /** Absolute path to the repo directory (already cloned/copied) */
  path: string;
}

/**
 * A file to write into the output directory
 */
export interface PlanFile {
  /** Relative path within the output directory */
  relativePath: string;
  /** Content to write */
  content: string;
}

/**
 * The complete plan for the apply command.
 * Schema for --plan <file>.json
 */
export interface ApplyPlan {
  /** Schema version for forward compatibility */
  version: 1;
  /** Sources to move into packages/ */
  sources: PlanSource[];
  /** Name of the packages subdirectory */
  packagesDir: string;
  /** Root package.json to write */
  rootPackageJson: Record<string, unknown>;
  /** Additional files to write (workspace configs, tool configs, etc.) */
  files: PlanFile[];
  /** Whether to run package manager install */
  install: boolean;
  /** Install command to run (e.g., "pnpm install") */
  installCommand?: string;
}

/**
 * Options for the apply command (internal)
 */
export interface ApplyOptions {
  /** Absolute path to the final output directory */
  output: string;
  /** Absolute path to the plan file */
  planPath: string;
  /** Resume from existing staging directory */
  resume: boolean;
  /** Clean up staging artifacts */
  cleanup: boolean;
  /** Show what would be done without executing */
  dryRun: boolean;
  /** Verbose output */
  verbose: boolean;
}
