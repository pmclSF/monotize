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
 * Confidence level for a conflict finding
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Source of a conflict finding
 */
export type ConflictSource = 'declared' | 'resolved' | 'peer-constraint';

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
  /** Confidence level of this finding */
  confidence?: ConfidenceLevel;
  /** How this conflict was detected */
  conflictSource?: ConflictSource;
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
 * A circular dependency between packages
 */
export interface CircularDependency {
  /** Package names forming the cycle, last connects back to first */
  cycle: string[];
  /** Types of edges forming the cycle */
  edgeTypes: Array<'dependencies' | 'devDependencies' | 'peerDependencies'>;
}

/**
 * A dependency that is heavily depended on across packages
 */
export interface DependencyHotspot {
  /** Dependency name */
  name: string;
  /** Number of packages depending on it */
  dependentCount: number;
  /** Whether this dependency has a version conflict */
  hasConflict: boolean;
  /** All version ranges used for this dependency */
  versionRanges: string[];
}

/**
 * Lockfile resolution data for a single repo
 */
export interface LockfileResolution {
  /** Package manager that produced the lockfile */
  packageManager: 'pnpm' | 'yarn' | 'npm';
  /** Name of the repo this lockfile belongs to */
  repoName: string;
  /** Map of dependency name to resolved version */
  resolvedVersions: Record<string, string>;
}

/**
 * An item requiring human judgment during merge
 */
export interface DecisionRequired {
  /** Kind of decision needed */
  kind: 'version-conflict' | 'peer-constraint-violation' | 'circular-dependency';
  /** Human-readable description */
  description: string;
  /** Name of the related conflict, if any */
  relatedConflict?: string;
  /** Suggested action to take */
  suggestedAction?: string;
}

/**
 * Categorized analysis findings with confidence levels
 */
export interface AnalysisFindings {
  /** Conflicts from declared ranges in package.json */
  declaredConflicts: DependencyConflict[];
  /** Conflicts from actual resolved versions in lockfiles */
  resolvedConflicts: DependencyConflict[];
  /** Conflicts from peer dependency constraints */
  peerConflicts: DependencyConflict[];
  /** Items requiring human judgment */
  decisions: DecisionRequired[];
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
  /** Circular dependencies between packages */
  circularDependencies?: CircularDependency[];
  /** Most-depended-on packages */
  hotspots?: DependencyHotspot[];
  /** Categorized findings with confidence */
  findings?: AnalysisFindings;
  /** Extended analysis from Stage 12 analyzers */
  extendedAnalysis?: ExtendedAnalysis;
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
  /** Analysis findings requiring attention */
  analysisFindings?: AnalysisFindings;
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

// ============================================================================
// Stage 6: Tiered Verification
// ============================================================================

/**
 * Verification tier level
 */
export type VerifyTier = 'static' | 'install' | 'full';

/**
 * Status of a single verification check
 */
export type VerifyCheckStatus = 'pass' | 'warn' | 'fail';

/**
 * A single verification check result
 */
export interface VerifyCheck {
  /** Unique identifier, e.g. 'root-private', 'pkg-name:pkg-a' */
  id: string;
  /** Human-readable description */
  message: string;
  /** Check outcome */
  status: VerifyCheckStatus;
  /** Which tier this check belongs to */
  tier: VerifyTier;
  /** Dot-path into the plan, e.g. "rootPackageJson.private" */
  planRef?: string;
  /** Additional detail for verbose output */
  details?: string;
}

/**
 * Complete result of a verify run
 */
export interface VerifyResult {
  /** Tier that was executed */
  tier: VerifyTier;
  /** Whether input was a plan file or directory */
  inputType: 'plan' | 'dir';
  /** Path to the input file or directory */
  inputPath: string;
  /** All checks that were run */
  checks: VerifyCheck[];
  /** Counts by status */
  summary: { total: number; pass: number; warn: number; fail: number };
  /** True when summary.fail === 0 */
  ok: boolean;
  /** ISO-8601 timestamp */
  timestamp: string;
}

// ============================================================================
// Stage 7: Pre-migration Preparation
// ============================================================================

/**
 * Category of a preparation checklist item
 */
export type PrepCheckCategory = 'node-version' | 'build-script' | 'package-manager' | 'engines' | 'general';

/**
 * Severity of a preparation checklist item
 */
export type PrepCheckSeverity = 'info' | 'warn' | 'action-required';

/**
 * A single item on the pre-migration checklist
 */
export interface PrepCheckItem {
  /** Repository name, or null for cross-repo items */
  repoName: string | null;
  /** Category of the check */
  category: PrepCheckCategory;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Whether this item was auto-fixed by a patch */
  autoFixed: boolean;
  /** Severity level */
  severity: PrepCheckSeverity;
}

/**
 * Type of patch that can be generated
 */
export type PrepPatchType = 'node-version' | 'build-script' | 'package-manager-field';

/**
 * A unified diff patch for a single file
 */
export interface PrepPatch {
  /** Patch filename, e.g. "repo-a/nvmrc.patch" */
  filename: string;
  /** Unified diff content */
  content: string;
  /** Repository this patch applies to */
  repoName: string;
  /** Target file path within the repo, e.g. ".nvmrc" */
  targetFile: string;
  /** Type of patch */
  patchType: PrepPatchType;
}

/**
 * Analysis of a single repo for preparation
 */
export interface RepoPrepAnalysis {
  /** Repository name */
  repoName: string;
  /** Absolute path to the repo */
  repoPath: string;
  /** Content of .nvmrc file, or null if missing */
  nvmrc: string | null;
  /** Content of .node-version file, or null if missing */
  nodeVersion: string | null;
  /** Value of engines.node in package.json, or null if missing */
  enginesNode: string | null;
  /** Whether the repo has a build script */
  hasBuildScript: boolean;
  /** The existing build script command, or null */
  existingBuildScript: string | null;
  /** The existing packageManager field value, or null */
  existingPackageManagerField: string | null;
  /** The full package.json content */
  packageJson: Record<string, unknown>;
}

/**
 * Complete analysis result for all repos
 */
export interface PrepareAnalysis {
  /** Per-repo analysis results */
  repos: RepoPrepAnalysis[];
  /** Checklist items generated from analysis */
  checklist: PrepCheckItem[];
  /** Patches generated for auto-fixable items */
  patches: PrepPatch[];
  /** Target Node.js version, if specified */
  targetNodeVersion: string | null;
  /** Target package manager, if specified */
  targetPackageManager: string | null;
}

/**
 * Configuration stored in .monotize/config.json inside a prep workspace
 */
export interface PrepWorkspaceConfig {
  /** Schema version */
  version: 1;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** Names of repos that have been prepared */
  preparedRepos: string[];
  /** Target Node.js version used for preparation */
  targetNodeVersion: string | null;
  /** Target package manager used for preparation */
  targetPackageManager: string | null;
  /** Branch name used for preparation commits */
  branchName: string;
  /** Filenames of patches that were applied */
  appliedPatches: string[];
}

// ─── Wizard Types ─────────────────────────────────────────────────────────

export type WizardStepId =
  | 'assess' | 'prepare' | 'merge' | 'configure'
  | 'migrate-branches' | 'verify' | 'archive' | 'operate';

export type WizardStepStatus = 'pending' | 'in-progress' | 'completed' | 'skipped';

export interface WizardStepState {
  id: WizardStepId;
  status: WizardStepStatus;
  startedAt?: string;
  completedAt?: string;
  skipRationale?: string;
  artifactPath?: string;
  lastOpId?: string;
}

export interface WizardGlobalOptions {
  outputDir: string;
  packagesDir: string;
  packageManager: string;
  conflictStrategy: string;
  workspaceTool: WorkspaceTool;
  planPath?: string;
  targetNodeVersion?: string;
}

export interface WizardState {
  version: 1;
  createdAt: string;
  updatedAt: string;
  repos: string[];
  currentStep: WizardStepId;
  steps: WizardStepState[];  // always 8 elements, fixed order
  options: WizardGlobalOptions;
}

export interface ConfigureResult {
  scaffoldedFiles: Array<{ relativePath: string; description: string }>;
  skippedConfigs: Array<{ name: string; reason: string }>;
}

// ============================================================================
// Stage 11: Full Lifecycle Plan Types
// ============================================================================

/**
 * Base interface for all plan artifacts
 */
export interface PlanBase {
  /** Schema version for forward compatibility */
  schemaVersion: 1;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** Fields that were redacted (e.g. tokens, paths) */
  redactedFields?: string[];
}

/**
 * A decision made during plan generation
 */
export interface PlanDecision {
  /** Unique identifier */
  id: string;
  /** Kind of decision (version-conflict, file-collision, etc.) */
  kind: string;
  /** The chosen resolution */
  chosen: string;
  /** Other possible resolutions */
  alternatives: string[];
}

/**
 * A discrete operation within a plan
 */
export interface PlanOperation {
  /** Unique identifier */
  id: string;
  /** Operation type (copy, write, move, exec, api-call, etc.) */
  type: string;
  /** Human-readable description */
  description: string;
  /** Input paths or references */
  inputs: string[];
  /** Output paths or references */
  outputs: string[];
}

/**
 * PreparationPlan wraps PrepareAnalysis into a serializable plan artifact
 */
export interface PreparationPlan extends PlanBase {
  /** Checklist items from preparation analysis */
  checklist: PrepCheckItem[];
  /** Patches generated for auto-fixable items */
  patches: PrepPatch[];
  /** Optional workspace clone + apply actions */
  workspaceCloneActions?: Array<{
    repoName: string;
    branch: string;
    patchFiles: string[];
  }>;
}

/**
 * AddPlan for adding a repo to an existing monorepo
 */
export interface AddPlan extends PlanBase {
  /** Source repository being added */
  sourceRepo: RepoSource;
  /** Path to target monorepo */
  targetMonorepo: string;
  /** Packages subdirectory */
  packagesDir: string;
  /** Analysis of the addition */
  analysis: AnalyzeResult;
  /** Decisions made during planning */
  decisions: PlanDecision[];
  /** Operations to execute */
  operations: PlanOperation[];
}

/**
 * ArchivePlan for deprecating old repositories
 */
export interface ArchivePlan extends PlanBase {
  /** Repositories to archive */
  repos: Array<{
    name: string;
    url: string;
    readmePatch: string;
  }>;
  /** URL of the monorepo these repos migrated to */
  monorepoUrl: string;
  /** Optional GitHub API operations (require token) */
  apiOperations?: Array<{
    repo: string;
    action: 'archive' | 'update-description';
  }>;
}

/**
 * Strategy for branch migration
 */
export type BranchMigrateStrategy = 'subtree' | 'replay';

/**
 * BranchPlan for migrating branches between repos
 */
export interface BranchPlan extends PlanBase {
  /** Branch name to migrate */
  branch: string;
  /** Source repository */
  sourceRepo: string;
  /** Target monorepo */
  targetMonorepo: string;
  /** Migration strategy */
  strategy: BranchMigrateStrategy;
  /** Operations to execute */
  operations: PlanOperation[];
  /** Dry-run report with estimates */
  dryRunReport?: {
    commitCount: number;
    estimatedTime: string;
    contributors: string[];
  };
}

/**
 * Options for the add command
 */
export interface AddCommandOptions {
  /** Path to target monorepo */
  to: string;
  /** Packages subdirectory */
  packagesDir: string;
  /** Output path for plan JSON */
  out?: string;
  /** Apply immediately after planning */
  apply?: boolean;
  /** Conflict resolution strategy */
  conflictStrategy: ConflictStrategy;
  /** Verbose output */
  verbose?: boolean;
  /** Package manager */
  packageManager: PackageManagerType;
}

/**
 * Options for the archive command
 */
export interface ArchiveCommandOptions {
  /** URL of the monorepo */
  monorepoUrl: string;
  /** Output path for plan JSON */
  out?: string;
  /** Apply immediately (requires token) */
  apply?: boolean;
  /** Read GitHub token from environment */
  tokenFromEnv?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Options for the migrate-branch command
 */
export interface MigrateBranchCommandOptions {
  /** Source repository */
  from: string;
  /** Target monorepo */
  to: string;
  /** Migration strategy */
  strategy: BranchMigrateStrategy;
  /** Output path for plan JSON */
  out?: string;
  /** Apply immediately */
  apply?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

// ============================================================================
// Stage 12: Extended Analysis Types
// ============================================================================

/**
 * Severity of an analysis finding
 */
export type FindingSeverity = 'info' | 'warn' | 'error' | 'critical';

/**
 * Confidence level for a finding
 */
export type FindingConfidence = 'high' | 'medium' | 'low';

/**
 * Evidence for an analysis finding
 */
export interface FindingEvidence {
  /** File path where evidence was found */
  path: string;
  /** Line number, if applicable */
  line?: number;
  /** Code snippet or content */
  snippet?: string;
}

/**
 * A single analysis finding with actionable information
 */
export interface AnalysisFinding {
  /** Unique identifier (e.g. 'env-node-mismatch') */
  id: string;
  /** Human-readable title */
  title: string;
  /** Severity level */
  severity: FindingSeverity;
  /** Confidence in this finding */
  confidence: FindingConfidence;
  /** Supporting evidence */
  evidence: FindingEvidence[];
  /** Suggested action to resolve */
  suggestedAction: string;
}

/**
 * Migration risk classification
 */
export type RiskClassification = 'straightforward' | 'needs-decisions' | 'complex';

/**
 * Summary of migration risk
 */
export interface RiskSummary {
  /** Overall classification */
  classification: RiskClassification;
  /** Reasons for this classification */
  reasons: string[];
  /** Top findings driving the classification */
  topFindings: AnalysisFinding[];
}

/**
 * Extended analysis covering environment, tooling, CI, publishing, and risks
 */
export interface ExtendedAnalysis {
  /** Node.js version signals and mismatches */
  environment: AnalysisFinding[];
  /** Package manager detection and inconsistencies */
  packageManager: AnalysisFinding[];
  /** TypeScript, lint, format, test tool detection */
  tooling: AnalysisFinding[];
  /** CI/CD workflow systems and conflicts */
  ci: AnalysisFinding[];
  /** Publishing configuration and recommendations */
  publishing: AnalysisFinding[];
  /** Repository risks (submodules, LFS, large files, case collisions) */
  repoRisks: AnalysisFinding[];
  /** Overall risk summary */
  riskSummary: RiskSummary;
}

// ============================================================================
// Stage 14: Configure Engine Types
// ============================================================================

/**
 * A file patch in a configuration plan
 */
export interface ConfigPatch {
  /** File path relative to monorepo root */
  path: string;
  /** Content before (null for new files) */
  before?: string;
  /** Content after */
  after: string;
  /** Human-readable description */
  description: string;
}

/**
 * Configuration plan for workspace scaffolding
 */
export interface ConfigPlan extends PlanBase {
  /** File patches to apply */
  patches: ConfigPatch[];
  /** Warnings for configs that can't be safely merged */
  warnings: Array<{
    config: string;
    reason: string;
    suggestion: string;
  }>;
}

// ============================================================================
// Stage 15: Dependency Enforcement Types
// ============================================================================

/**
 * Result of dependency enforcement generation
 */
export interface DependencyEnforcementResult {
  /** Overrides/resolutions to add to root package.json */
  overrides: Record<string, string>;
  /** Key name for the PM (pnpm.overrides, resolutions, overrides) */
  overridesKey: string;
  /** Internal deps normalized to workspace protocol */
  workspaceProtocolUpdates: Array<{
    packageName: string;
    dependency: string;
    from: string;
    to: string;
  }>;
}

// ============================================================================
// Stage 18: Smart Defaults Types
// ============================================================================

/**
 * A suggested decision with evidence
 */
export interface SuggestedDecision {
  /** What is being decided */
  topic: string;
  /** The suggested value */
  suggestion: string;
  /** Confidence level */
  confidence: FindingConfidence;
  /** Evidence supporting this suggestion */
  evidence: string[];
  /** Alternative options */
  alternatives: string[];
}

/**
 * An actionable error with hints
 */
export interface ActionableError {
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
  /** Hint for resolution */
  hint?: string;
  /** Related documentation or commands */
  suggestions?: string[];
}

// ============================================================================
// Stage 19: Multi-Language Types
// ============================================================================

/**
 * Detected language in a repository
 */
export interface LanguageDetection {
  /** Repository name */
  repoName: string;
  /** Detected languages */
  languages: Array<{
    name: 'go' | 'rust' | 'python' | 'javascript' | 'typescript';
    /** Marker files that indicate this language */
    markers: string[];
    /** Metadata (e.g. module path for Go, crate name for Rust) */
    metadata?: Record<string, string>;
  }>;
}

// ============================================================================
// Stage 20: Performance Types
// ============================================================================

/**
 * Progress event for long-running operations
 */
export interface ProgressEvent {
  /** Current step number */
  current: number;
  /** Total steps */
  total: number;
  /** Label for the current step */
  label: string;
  /** Percentage complete (0-100) */
  percentage: number;
}
