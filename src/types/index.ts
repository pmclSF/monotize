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
