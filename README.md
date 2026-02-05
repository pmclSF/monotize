# Monotize

> Combine multiple Git repositories into a workspace monorepo with pnpm, yarn, or npm — plus Turborepo/Nx support

[![CI](https://github.com/pmclSF/monotize/actions/workflows/ci.yml/badge.svg)](https://github.com/pmclSF/monotize/actions/workflows/ci.yml)
[![Security](https://github.com/pmclSF/monotize/actions/workflows/security.yml/badge.svg)](https://github.com/pmclSF/monotize/actions/workflows/security.yml)
[![npm version](https://badge.fury.io/js/monorepo-cli.svg)](https://www.npmjs.com/package/monorepo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
# Install globally
npm install -g monorepo-cli

# Merge GitHub repositories into a monorepo
monorepo merge owner/repo1 owner/repo2 -o my-monorepo

# Or use npx
npx monorepo-cli merge owner/repo1 owner/repo2 -o my-monorepo
```

That's it! Your repositories are now combined into a pnpm workspace monorepo.

## Important: What This Tool Does (and Doesn't Do)

### Best For

- **JavaScript/TypeScript projects** with `package.json` files
- Combining multiple npm packages into a unified workspace
- Projects using pnpm, yarn, or npm workspaces
- Teams migrating from multi-repo to monorepo architecture

### Limitations

| Limitation | Details |
|------------|---------|
| **JS/TS only** | Dependency analysis only works with `package.json`. Non-JS projects (Python, Go, Rust) are copied but without conflict detection. |
| **No nested workspaces** | Cannot merge existing monorepos; each source should be a single-package repo. |
| **File collisions** | Conflicting root files (like `.eslintrc.js`) are renamed with package suffix, not merged. |
| **History preservation** | Requires `git-filter-repo` for full history; fallback to `git subtree` is limited. |

## Features

| Feature | Description |
|---------|-------------|
| **Smart Merging** | Combine multiple repositories with intelligent dependency conflict detection and resolution |
| **Multi-PM Support** | Generate workspaces for pnpm (default), yarn (v1 & berry), or npm |
| **Git History Preservation** | Keep commit history from source repositories using git-filter-repo or git subtree |
| **Turborepo/Nx Support** | Generate workspace configs with task pipelines based on detected scripts |
| **CI/CD Merging** | Automatically combine GitHub Actions workflows with namespaced jobs |
| **Conflict Resolution** | Interactive or automatic resolution with `highest`, `lowest`, or `prompt` strategies |
| **Analysis Mode** | Preview merge complexity, conflicts, and get recommendations before executing |
| **Cross-Dependency Detection** | Automatically detect when merged packages depend on each other |
| **Flexible Sources** | Merge from GitHub, GitLab, or local directories in any combination |

## Installation

```bash
# npm
npm install -g monorepo-cli

# pnpm
pnpm add -g monorepo-cli

# yarn
yarn global add monorepo-cli

# Or use npx for one-off usage
npx monorepo-cli <command>
```

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Required |
| git | 2.0+ | Required for cloning |
| pnpm | 8+ | Required if using pnpm (default) |
| yarn | 1.x or 2+ | Required if using `--package-manager yarn` or `yarn-berry` |
| npm | 7+ | Required if using `--package-manager npm` |
| git-filter-repo | any | Optional, for `--preserve-history` |

## Commands

### `merge`

Merge multiple repositories into a monorepo.

```bash
monorepo merge <repos...> [options]
```

**Arguments:**
- `<repos...>`: Repositories to merge (GitHub shorthand, URLs, or local paths)

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <dir>` | Output directory | `./monorepo` |
| `-p, --packages-dir <name>` | Packages subdirectory | `packages` |
| `--package-manager <pm>` | Package manager (`pnpm`, `yarn`, `yarn-berry`, `npm`) | `pnpm` |
| `--dry-run` | Show plan without executing | - |
| `-y, --yes` | Skip prompts, use defaults | - |
| `--conflict-strategy <strategy>` | Resolution strategy (`highest`, `lowest`, `prompt`) | `prompt` |
| `-v, --verbose` | Verbose output | - |
| `--no-install` | Skip dependency installation | - |
| `--no-hoist` | Keep dependencies in each package | - |
| `--pin-versions` | Remove ^ and ~ from versions | - |
| `--preserve-history` | Preserve git commit history | - |
| `--workspace-tool <tool>` | Generate config (`turbo`, `nx`, `none`) | `none` |
| `--workflow-strategy <strategy>` | CI merge strategy (`combine`, `keep-first`, `keep-last`, `skip`) | `combine` |

**Examples:**

```bash
# Basic merge from GitHub (uses pnpm by default)
monorepo merge owner/repo1 owner/repo2

# Merge with yarn workspaces
monorepo merge owner/repo1 owner/repo2 --package-manager yarn

# Merge with npm workspaces
monorepo merge owner/repo1 owner/repo2 --package-manager npm

# Merge with yarn berry (v2+)
monorepo merge owner/repo1 owner/repo2 --package-manager yarn-berry

# Merge local directories with Turborepo
monorepo merge ./app1 ./app2 --workspace-tool turbo -o my-monorepo

# Non-interactive with automatic conflict resolution
monorepo merge owner/repo1 owner/repo2 -y --conflict-strategy highest

# Preview what would happen without making changes
monorepo merge owner/repo1 owner/repo2 --dry-run

# Skip dependency installation (useful for CI or when you want to review first)
monorepo merge owner/repo1 owner/repo2 --no-install
```

### `analyze`

Analyze repositories before merging to understand complexity and potential issues.

```bash
monorepo analyze <repos...> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show detailed information |
| `--json` | Output as JSON (for scripting) |

**Example Output:**

```
Repository Analysis

Packages found:
  - pkg-a@1.0.0 (from repo-a)
  - pkg-b@2.0.0 (from repo-b)

Dependency conflicts:
  3 incompatible, 1 major, 1 minor

  typescript: ^5.3.0 (repo-a), ^5.2.0 (repo-b) [MAJOR]
  lodash: ^4.17.21 (repo-a), ^4.17.15 (repo-b) [minor]

File collisions:
  .gitignore (in: repo-a, repo-b) -> merge
  README.md (in: repo-a, repo-b) -> keep-first

Complexity score:
  35/100 (Low)

Recommendations:
  -> Use --conflict-strategy highest for safe upgrades
  -> Review major version conflicts before merging
```

### `init`

Initialize a new empty monorepo workspace.

```bash
monorepo init [directory] [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --packages-dir <name>` | Packages subdirectory | `packages` |
| `--package-manager <pm>` | Package manager (`pnpm`, `yarn`, `yarn-berry`, `npm`) | `pnpm` |
| `--workspace-tool <tool>` | Workspace tool (`turbo`, `nx`, `none`) | `none` |
| `--no-git` | Skip git initialization | - |
| `-v, --verbose` | Verbose output | - |

**Examples:**

```bash
# Initialize with Turborepo (pnpm by default)
monorepo init my-monorepo --workspace-tool turbo

# Initialize with yarn workspaces
monorepo init my-monorepo --package-manager yarn

# Initialize with npm workspaces
monorepo init my-monorepo --package-manager npm

# Initialize in current directory without git
monorepo init . --no-git
```

## Repository Sources

```bash
# GitHub shorthand (most common)
monorepo merge owner/repo

# Full GitHub URL
monorepo merge https://github.com/owner/repo

# GitLab
monorepo merge gitlab:owner/repo

# Local directories (absolute or relative paths)
monorepo merge ./local-repo /path/to/other-repo

# Mix and match
monorepo merge owner/repo ./local-repo https://github.com/other/repo
```

## Guides

### Using Turborepo

When you use `--workspace-tool turbo`, monotize generates a `turbo.json` that:
- Only includes tasks that your packages actually have (e.g., won't add `build` task if no package has a build script)
- Sets up proper task dependencies (`test` depends on `build` only if packages have build scripts)
- Configures output caching for build artifacts

```bash
monorepo merge ./pkg-a ./pkg-b --workspace-tool turbo

# After merge, run:
cd my-monorepo
pnpm install
pnpm build  # Runs: turbo run build
pnpm test   # Runs: turbo run test
```

### Using Nx

```bash
monorepo merge ./pkg-a ./pkg-b --workspace-tool nx

# After merge:
cd my-monorepo
pnpm install
pnpm build  # Runs: nx run-many --target=build
```

### Choosing a Package Manager

Monotize supports multiple package managers. Choose based on your team's preferences:

| Package Manager | Flag | Workspace Config | Best For |
|-----------------|------|------------------|----------|
| **pnpm** (default) | `--package-manager pnpm` | `pnpm-workspace.yaml` | Disk efficiency, strict dependency isolation |
| **yarn (classic)** | `--package-manager yarn` | `package.json` workspaces | Teams already using yarn v1 |
| **yarn (berry)** | `--package-manager yarn-berry` | `package.json` workspaces | Modern yarn with PnP support |
| **npm** | `--package-manager npm` | `package.json` workspaces | Universal availability, simplicity |

```bash
# Using yarn workspaces
monorepo merge owner/repo1 owner/repo2 --package-manager yarn
cd my-monorepo
yarn install
yarn workspaces run build

# Using npm workspaces
monorepo merge owner/repo1 owner/repo2 --package-manager npm
cd my-monorepo
npm install
npm run build -ws

# Using yarn berry
monorepo merge owner/repo1 owner/repo2 --package-manager yarn-berry
cd my-monorepo
yarn install
yarn workspaces foreach run build
```

**Key differences:**
- **pnpm**: Uses `pnpm-workspace.yaml` for workspace config, `workspace:*` protocol for internal deps
- **yarn/npm**: Uses `workspaces` field in `package.json`, simpler setup
- **yarn-berry**: Same as yarn but uses `workspace:*` protocol and modern `foreach` command

### Handling Dependency Conflicts

When packages have different versions of the same dependency:

| Strategy | When to Use |
|----------|-------------|
| `highest` | Default choice - newer versions usually have bug fixes |
| `lowest` | When you need maximum compatibility with older code |
| `prompt` | When you want to review each conflict manually |

```bash
# Automatic highest version (recommended for most cases)
monorepo merge owner/repo1 owner/repo2 -y --conflict-strategy highest

# Keep dependencies isolated in each package (avoids conflicts entirely)
monorepo merge owner/repo1 owner/repo2 --no-hoist
```

**When to use `--no-hoist`:**
- Packages have truly incompatible peer dependencies
- You're merging packages that were never designed to work together
- You encounter runtime errors after merging with hoisting

### Preserving Git History

By default, files are copied without git history. To preserve history:

```bash
# First, install git-filter-repo
pip install git-filter-repo

# Then merge with history preservation
monorepo merge owner/repo1 owner/repo2 --preserve-history
```

**Caveats:**
- Significantly slower than regular merge
- Requires `git-filter-repo` for best results
- Falls back to `git subtree` if git-filter-repo is not available
- Commit hashes will change (paths are rewritten to `packages/<name>/`)

### CI/CD Workflow Merging

```bash
# Combine all workflows (default)
monorepo merge owner/repo1 owner/repo2 --workflow-strategy combine

# Keep only first repo's workflows
monorepo merge owner/repo1 owner/repo2 --workflow-strategy keep-first

# Skip workflow merging entirely
monorepo merge owner/repo1 owner/repo2 --workflow-strategy skip
```

**How workflow combining works:**
- Triggers are merged (all `on:` events from all workflows)
- Jobs are prefixed with package name (`repo1-build`, `repo2-test`)
- Duplicate checkout steps are deduplicated

**Recommendation:** Use `--workflow-strategy skip` for complex CI setups and configure workflows manually after merge.

## Real-World Examples

### Example 1: Merging JavaScript packages (works great)

```bash
$ monorepo merge sindresorhus/slugify sindresorhus/camelcase -o string-utils --workspace-tool turbo -y

✓ Found 2 repositories to merge
✓ Processed slugify
✓ Processed camelcase
⚠ Found 1 dependency conflicts (0 incompatible, 0 major, 1 minor)
⚠ Found 10 file collisions

✓ Monorepo created successfully!

  Location: ./string-utils
  Packages: 2
  Resolved conflicts: 1

$ cd string-utils && pnpm install && pnpm test

• Packages in scope: @sindresorhus/slugify, camelcase
• Running test in 2 packages

@sindresorhus/slugify:test: 22 tests passed
camelcase:test: 20 tests passed

Tasks:    2 successful, 2 total
```

The generated `turbo.json` only includes `test` (not `build`) because these packages don't have build scripts.

### Example 2: Merging non-JavaScript projects (limited support)

```bash
$ monorepo analyze vllm-project/vllm containers/podman

Repository Analysis

Packages found:
  (none - no package.json files found)

Dependency conflicts:
  None detected

File collisions:
  • .gitignore (in: vllm, podman) → merge
  • LICENSE (in: vllm, podman) → keep-first
  • README.md (in: vllm, podman) → keep-first
  • .dockerignore (in: vllm, podman) → rename
  • pyproject.toml (in: vllm, podman) → rename

Complexity score:
  18/100 (Low)
```

**What this means:** vLLM (Python) and Podman (Go) have no `package.json`, so:
- No dependency conflict detection (Python/Go deps not analyzed)
- Files are still copied and organized into `packages/`
- File collisions are detected and handled
- No Turbo/Nx task generation (no scripts to detect)

For non-JS projects, monotize is essentially a smart file copier with collision detection. You'll need to set up build tooling manually.

## Output Structure

```
my-monorepo/
├── packages/
│   ├── repo1/
│   │   ├── src/
│   │   ├── package.json      # Original package.json (may be modified)
│   │   └── ...
│   └── repo2/
│       ├── src/
│       ├── package.json
│       └── ...
├── .github/
│   └── workflows/
│       └── ci.yml            # Merged workflows (if applicable)
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # pnpm only (yarn/npm use package.json workspaces)
├── turbo.json                # If --workspace-tool turbo
├── nx.json                   # If --workspace-tool nx
├── .gitignore                # Merged from all repos
└── README.md                 # Generated overview
```

### Root package.json

The generated root `package.json` includes:
- `packageManager` field with your chosen package manager and version
- `workspaces` field (for yarn/npm only; pnpm uses `pnpm-workspace.yaml`)
- Aggregated scripts (`build`, `test`, `lint`) using workspace tool or PM commands
- Per-package scripts (`repo1:build`, `repo2:test`)
- Hoisted dependencies (unless `--no-hoist`)

## Troubleshooting

### Package manager not found

```bash
# Install pnpm
npm install -g pnpm

# Install yarn
npm install -g yarn

# npm comes with Node.js
```

### "Could not find [task] in root turbo.json"

This happens when Turbo expects a task that packages don't have. Monotize now only generates tasks for scripts that exist, but if you see this:

1. Check that your packages have the expected scripts in their `package.json`
2. Or manually edit `turbo.json` to remove the missing task

### Clone failures for private repos

```bash
# Option 1: Use SSH
git config --global url."git@github.com:".insteadOf "https://github.com/"

# Option 2: Use personal access token
export GITHUB_TOKEN=your_token
git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
```

### Dependency conflicts causing runtime errors

```bash
# Try isolating dependencies
monorepo merge owner/repo1 owner/repo2 --no-hoist
```

### Large repos taking too long

```bash
# Clone locally first, then merge from local paths
git clone --depth 1 https://github.com/owner/large-repo ./large-repo
monorepo merge ./large-repo ./other-repo
```

### Non-JS projects show no dependency conflicts

This is expected. Monotize only analyzes `package.json` files. Python, Go, Rust, and other projects will be copied but without dependency analysis. See [Example 2](#example-2-merging-non-javascript-projects-limited-support) in the Real-World Examples section.

## Known Limitations

1. **No monorepo-to-monorepo merging**: Each source repo should be a single package
2. **File collision handling**: Root-level config files with conflicts are renamed, not merged
3. **Workflow merging**: Complex CI/CD setups may need manual adjustment
4. **Peer dependencies**: May require `--no-hoist` for packages with conflicting peers

## Contributing

```bash
# Clone the repository
git clone https://github.com/pmclSF/monotize
cd monotize

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

### Running Tests

```bash
pnpm test              # All tests
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests
pnpm test:e2e          # End-to-end tests
pnpm test:coverage     # With coverage report
```

## License

MIT
