# Monotize Architecture

## Overview

Monotize is a CLI tool that combines multiple Git repositories into a single monorepo with workspace support for pnpm, yarn, yarn-berry, and npm.

## Directory Layout

```
src/
├── index.ts                  # CLI entry point (commander.js program definition)
├── commands/
│   ├── merge.ts              # `monorepo merge` - combine repos into monorepo
│   ├── init.ts               # `monorepo init`  - scaffold empty monorepo
│   └── analyze.ts            # `monorepo analyze` - inspect repos before merge
├── analyzers/
│   ├── dependencies.ts       # Read package.json files, detect version conflicts
│   └── files.ts              # Detect root-level file collisions across repos
├── resolvers/
│   └── dependencies.ts       # Apply conflict strategy (highest/lowest/prompt)
├── strategies/
│   ├── copy.ts               # Clone remote / copy local repos to temp dir
│   ├── history-preserve.ts   # Rewrite git history via filter-repo or subtree
│   ├── merge-files.ts        # Merge .gitignore, generate README, handle collisions
│   ├── package-manager.ts    # PM detection, config, validation (pnpm/yarn/npm)
│   ├── workspace-config.ts   # Generate root package.json + workspace protocol
│   ├── workspace-tools.ts    # Generate turbo.json / nx.json configs
│   └── workflow-merge.ts     # Merge GitHub Actions workflow YAML files
├── types/
│   └── index.ts              # All TypeScript interfaces and type aliases
└── utils/
    ├── fs.ts                 # Async wrappers around fs-extra
    ├── logger.ts             # Colored console output helpers
    ├── prompts.ts            # Interactive CLI prompts (@inquirer/prompts)
    └── validation.ts         # Parse and validate repo source inputs
```

## Command Flow

### `merge <repos...>`

The primary command. Orchestrated by `mergeCommand()` in `src/commands/merge.ts`.

```
  User input (URLs, local paths, GitHub shorthand)
       │
       ▼
  1. validateRepoSources()          ── validation.ts
       │
       ▼
  2. createTempDir()                ── fs.ts
       │
       ▼
  3. cloneOrCopyRepos()             ── strategies/copy.ts
       │  (git clone for remote, fs.copy for local)
       ▼
  4. analyzeDependencies()          ── analyzers/dependencies.ts
       │  (reads every package.json, builds conflict list)
       ▼
  5. detectFileCollisions()         ── analyzers/files.ts
       │
       ▼
  6. [--dry-run?]  ─── yes ──▶ printDryRunReport() → exit
       │ no
       ▼
  7. resolveDependencyConflicts()   ── resolvers/dependencies.ts
       │  + prompt user for file collision strategies
       ▼
  8. ensureDir(output)              ── fs.ts
       │
       ▼
  9. Move/preserveHistory           ── strategies/history-preserve.ts
       │  (move repos into packages/<name>/)
       ▼
 10. generateWorkspaceConfig()      ── strategies/workspace-config.ts
       │  (root package.json with aggregated deps)
       ▼
 11. generateWorkspaceFiles()       ── strategies/package-manager.ts
       │  (pnpm-workspace.yaml or workspaces field)
       ▼
 12. generateWorkspaceToolConfig()  ── strategies/workspace-tools.ts
       │  (turbo.json / nx.json, optional)
       ▼
 13. mergeWorkflows()               ── strategies/workflow-merge.ts
       │  (merge .github/workflows/*.yml)
       ▼
 14. handleFileCollision()          ── strategies/merge-files.ts
       │  + mergeGitignores() + generateRootReadme()
       ▼
 15. execSync(pmConfig.install)     ── child_process  (unless --no-install)
       │
       ▼
 16. Print success summary → cleanup temp dir
```

### `init [directory]`

Scaffolds an empty monorepo. Orchestrated by `initCommand()` in `src/commands/init.ts`.

```
  1. Validate target dir has no package.json
  2. ensureDir(target), ensureDir(target/packages)
  3. Write root package.json (private, scripts, workspaces)
  4. Write workspace files (pnpm-workspace.yaml or workspaces field)
  5. Write workspace tool config (turbo.json / nx.json, optional)
  6. Write .gitignore, README.md
  7. git init (unless --no-git)
```

### `analyze <repos...>`

Read-only inspection. Orchestrated by `analyzeCommand()` in `src/commands/analyze.ts`.

```
  1. validateRepoSources()
  2. createTempDir() + cloneOrCopyRepos()
  3. analyzeDependencies()
  4. detectFileCollisions()
  5. detectCrossDependencies()
  6. calculateComplexityScore()
  7. generateRecommendations()
  8. Output human-readable report or JSON (--json)
  9. Cleanup temp dir
```

### `apply --plan <file> --out <dir>`

Transactional write phase. Orchestrated by `applyCommand()` in `src/commands/apply.ts`.

Reads a pre-computed plan JSON file and writes all output through a staging directory
with an operation log (JSONL). On success, atomically renames staging → output.

```
  1. Load + validate plan file
  2. Create staging dir: <output>.staging-<nonce>
  3. Create operation log: <staging>.ops.jsonl
  4. Step "scaffold"       — ensureDir(staging + packages/)
  5. Step "move-packages"  — move each source into staging/packages/<name>/
  6. Step "write-root"     — writeJson root package.json
  7. Step "write-extras"   — writeFile for each plan.files[] entry
  8. Step "install"        — execSync(installCommand) if enabled
  9. Atomic finalize       — move(staging → output), remove log
```

Supports `--resume` (skip completed steps), `--cleanup` (remove staging artifacts),
`--dry-run` (print steps), and `AbortSignal` (SIGINT leaves staging for resume).

## Module Responsibilities

| Module | Reads | Writes | Shells Out |
|--------|-------|--------|------------|
| `commands/merge.ts` | — | output dir tree | `git init`, PM install |
| `commands/init.ts` | — | target dir tree | `git init` |
| `commands/analyze.ts` | — | stdout only | — |
| `commands/apply.ts` | plan JSON | staging dir → output | PM install |
| `analyzers/dependencies.ts` | package.json files | — | — |
| `analyzers/files.ts` | directory listings | — | — |
| `resolvers/dependencies.ts` | — | — | — (pure logic) |
| `strategies/copy.ts` | local repo dirs | temp dir | `git clone` |
| `strategies/history-preserve.ts` | git repos | output dir | `git filter-repo`, `git subtree` |
| `strategies/merge-files.ts` | .gitignore files | merged files | — |
| `strategies/package-manager.ts` | lock files (detection) | workspace files | PM version check |
| `strategies/workspace-config.ts` | PackageInfo[] | — | — (pure logic) |
| `strategies/workspace-tools.ts` | PackageInfo[] | — | — (pure logic) |
| `strategies/workflow-merge.ts` | .github/workflows/*.yml | merged workflows | — |
| `utils/fs.ts` | files/dirs | files/dirs | — |
| `utils/validation.ts` | local path checks | — | — |
| `utils/prompts.ts` | stdin | — | — |
| `utils/logger.ts` | — | stdout/stderr | — |
| `utils/redact.ts` | — | — | — (pure logic) |
| `utils/operation-log.ts` | JSONL log | JSONL log | — |

## IO Boundaries

### Filesystem reads
- `analyzers/dependencies.ts` reads `package.json` from each cloned/copied repo
- `analyzers/files.ts` lists directories to detect collisions
- `strategies/copy.ts` copies local repo dirs (excludes `node_modules`, `.git`, `dist`)
- `strategies/workflow-merge.ts` reads `.github/workflows/*.yml`
- `strategies/package-manager.ts` checks for lock files during detection
- `utils/validation.ts` checks `pathExists` + `isDirectory` for local repo sources

### Filesystem writes
- `commands/merge.ts` writes the entire output monorepo tree:
  - `package.json`, `pnpm-workspace.yaml`, `README.md`, `.gitignore`
  - `packages/<name>/` directories (moved from temp)
  - Optional: `turbo.json`, `nx.json`, `.npmrc`, merged workflows
- `commands/init.ts` writes scaffold files into the target directory
- `utils/fs.ts` manages temp directory lifecycle

### Network access
- `strategies/copy.ts` → `git clone` for remote repos (GitHub, GitLab, arbitrary URLs)
- `commands/merge.ts` → PM install fetches from npm registry (skippable with `--no-install`)

### External commands
All external commands use `execFileSync(cmd, args)` (no shell interpolation) to prevent injection.

- `git clone` (via `simple-git` library, with timeout + retry)
- `git init`
- `git filter-repo` / `git subtree` (history preservation)
- Package manager CLI (e.g. `pnpm install --ignore-scripts`)

### Security measures

- **No shell interpolation**: All `child_process` calls in `src/` use `execFileSync(cmd, args)` instead of `execSync(string)`, preventing shell injection via repo names, paths, or URLs.
- **Lifecycle scripts disabled**: All install commands include `--ignore-scripts` by default to prevent untrusted repos from executing arbitrary code during `npm/yarn/pnpm install`.
- **Credential redaction** (`utils/redact.ts`): URLs containing embedded tokens (`https://user:token@host`) are stripped to `https://***@host` before logging or error output. Known token patterns (GitHub PATs, GitLab PATs, npm tokens) are also redacted.
- **Tokens are env-only**: Authentication is handled through environment variables (`GITHUB_TOKEN`) and SSH keys. The tool never writes tokens to disk (plan files, operation logs, generated configs).

## Key Types

Defined in `src/types/index.ts`:

- `RepoSource` — parsed repo input (type: `github` | `gitlab` | `url` | `local`)
- `PackageInfo` — parsed package.json with deps, scripts, repoName
- `DependencyConflict` — conflicting versions with severity classification
- `FileCollision` — duplicated file with source repos and suggested strategy
- `MergeOptions` — all merge command options
- `PackageManagerConfig` — PM-specific commands, lock file paths, workspace protocol
- `WorkspaceConfig` — generated root package.json + workspace YAML content
- `AnalyzeResult` — full analysis output including complexity score

## Test Structure

```
tests/
├── unit/           # Isolated function tests (mocked deps)
├── integration/    # Multi-module interaction tests
├── e2e/            # Full CLI subprocess tests (execSync)
├── error/          # Error scenario coverage
├── strategies/     # Strategy-specific tests
├── fixtures/       # Static test repos (14 repos)
└── helpers/        # Test utilities (fixtures.ts, mocks.ts)
```

Tests run via `vitest`. Network-dependent tests (`real-repos.test.ts`) are excluded by default.
