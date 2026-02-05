# Monotize

> Combine multiple Git repositories into a pnpm workspace monorepo with Turborepo/Nx support

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

## Why Monotize?

Consolidating multiple repositories into a monorepo typically involves:
- Copying files while preserving directory structure
- Resolving dependency version conflicts
- Merging configuration files (.gitignore, tsconfig, etc.)
- Setting up workspace tooling (pnpm, Turborepo, Nx)
- Combining CI/CD workflows

Monotize automates all of this in a single command, with smart defaults and full customization options.

## Features

| Feature | Description |
|---------|-------------|
| **Smart Merging** | Combine multiple repositories with intelligent dependency conflict detection and resolution |
| **Git History Preservation** | Keep commit history from source repositories using git-filter-repo or git subtree |
| **Turborepo/Nx Support** | Generate workspace configs with task pipelines, caching, and proper dependency ordering |
| **CI/CD Merging** | Automatically combine GitHub Actions workflows with namespaced jobs |
| **Conflict Resolution** | Interactive or automatic resolution with `highest`, `lowest`, or `prompt` strategies |
| **Analysis Mode** | Preview merge complexity, conflicts, and get recommendations before executing |
| **Cross-Dependency Detection** | Automatically rewrite inter-package dependencies to workspace protocol |
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

**Prerequisites:**
- Node.js 18+
- pnpm (for workspace management)
- git (for cloning repositories)
- git-filter-repo (optional, for history preservation)

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
| `--dry-run` | Show plan without executing | - |
| `-y, --yes` | Skip prompts, use defaults | - |
| `--conflict-strategy <strategy>` | Resolution strategy (`highest`, `lowest`, `prompt`) | `prompt` |
| `-v, --verbose` | Verbose output | - |
| `--no-install` | Skip `pnpm install` | - |
| `--no-hoist` | Keep dependencies in each package | - |
| `--pin-versions` | Remove ^ and ~ from versions | - |
| `--preserve-history` | Preserve git commit history | - |
| `--workspace-tool <tool>` | Generate config (`turbo`, `nx`, `none`) | `none` |
| `--workflow-strategy <strategy>` | CI merge strategy (`combine`, `keep-first`, `keep-last`, `skip`) | `combine` |

**Examples:**

```bash
# Basic merge
monorepo merge owner/repo1 owner/repo2

# With Turborepo support
monorepo merge owner/repo1 owner/repo2 --workspace-tool turbo

# Preserve git history
monorepo merge owner/repo1 owner/repo2 --preserve-history

# Non-interactive with highest versions
monorepo merge owner/repo1 owner/repo2 -y --conflict-strategy highest

# Preview without executing
monorepo merge owner/repo1 owner/repo2 --dry-run
```

### `analyze`

Analyze repositories before merging to understand complexity and conflicts.

```bash
monorepo analyze <repos...> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show detailed information |
| `--json` | Output as JSON |

**Examples:**

```bash
# Analyze repositories
monorepo analyze owner/repo1 owner/repo2

# Get JSON output for scripting
monorepo analyze owner/repo1 owner/repo2 --json
```

**Sample Output:**
```
📊 Analysis Results

Packages (2):
  • repo1 (1.0.0) - 12 dependencies
  • repo2 (2.1.0) - 8 dependencies

⚠️  Dependency Conflicts (3):
  • typescript: 5.0.0 vs 5.3.0 (minor)
  • eslint: 8.0.0 vs 9.0.0 (major)
  • lodash: 4.17.20 vs 4.17.21 (patch)

📁 File Collisions (1):
  • .eslintrc.js (different content)

🔗 Cross-Dependencies (1):
  • repo2 depends on repo1

Complexity Score: 35/100 (Low)

💡 Recommendations:
  • Use --conflict-strategy highest for safe upgrades
  • Review eslint major version change
```

### `init`

Initialize a new monorepo workspace.

```bash
monorepo init [directory] [options]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --packages-dir <name>` | Packages subdirectory | `packages` |
| `--workspace-tool <tool>` | Workspace tool (`turbo`, `nx`, `none`) | `none` |
| `--no-git` | Skip git initialization | - |
| `-v, --verbose` | Verbose output | - |

**Examples:**

```bash
# Initialize in current directory
monorepo init

# Initialize with Turborepo
monorepo init my-monorepo --workspace-tool turbo

# Initialize with Nx
monorepo init my-monorepo --workspace-tool nx
```

## Repository Sources

Monotize supports multiple ways to specify repositories:

```bash
# GitHub shorthand
monorepo merge owner/repo

# Full GitHub URL
monorepo merge https://github.com/owner/repo

# GitLab (use gitlab: prefix)
monorepo merge gitlab:owner/repo

# Local directories
monorepo merge ./local-repo ../other-repo

# Mix and match
monorepo merge owner/repo ./local-repo https://github.com/other/repo
```

## Guides

### Preserving Git History

By default, monotize copies files without preserving git history. Use `--preserve-history` to maintain commit history:

```bash
monorepo merge owner/repo1 owner/repo2 --preserve-history
```

This works best with [git-filter-repo](https://github.com/newren/git-filter-repo) installed:

```bash
pip install git-filter-repo
```

If git-filter-repo is not available, monotize falls back to `git subtree`, which provides basic history preservation.

### Using Turborepo

Generate a monorepo with [Turborepo](https://turbo.build/) for task orchestration:

```bash
monorepo merge owner/repo1 owner/repo2 --workspace-tool turbo
```

This creates:
- `turbo.json` with task pipelines
- Updated root `package.json` with turbo commands
- Proper `dependsOn` ordering for build/test/lint

### Using Nx

Generate a monorepo with [Nx](https://nx.dev/) for task orchestration:

```bash
monorepo merge owner/repo1 owner/repo2 --workspace-tool nx
```

This creates:
- `nx.json` with target defaults
- Named inputs for cache invalidation
- Task dependencies configuration

### Handling Dependency Conflicts

When packages have conflicting dependency versions, monotize offers three strategies:

1. **`highest`**: Use the highest version (safest for most cases)
2. **`lowest`**: Use the lowest version (better compatibility)
3. **`prompt`**: Ask for each conflict (default)

```bash
# Always use highest versions
monorepo merge owner/repo1 owner/repo2 --conflict-strategy highest -y

# Prevent hoisting to isolate dependencies
monorepo merge owner/repo1 owner/repo2 --no-hoist
```

### CI/CD Workflow Merging

Monotize can combine GitHub Actions workflows from merged repositories:

```bash
# Combine all workflows (default)
monorepo merge owner/repo1 owner/repo2 --workflow-strategy combine

# Keep only first repository's workflows
monorepo merge owner/repo1 owner/repo2 --workflow-strategy keep-first

# Skip workflow merging
monorepo merge owner/repo1 owner/repo2 --workflow-strategy skip
```

Combined workflows have jobs prefixed with the source package name to avoid conflicts.

## Configuration

### Output Structure

```
my-monorepo/
├── packages/
│   ├── repo1/
│   │   ├── src/
│   │   └── package.json
│   └── repo2/
│       ├── src/
│       └── package.json
├── .github/
│   └── workflows/
│       └── ci.yml          # Merged workflows
├── package.json            # Root workspace config
├── pnpm-workspace.yaml
├── turbo.json              # If --workspace-tool turbo
├── .gitignore
└── README.md
```

### Root package.json

The generated root `package.json` includes:
- Aggregated scripts (`build`, `test`, `lint`)
- Per-package scripts (`repo1:build`, `repo2:test`)
- Resolved dependencies (unless `--no-hoist`)
- Workspace tool dependencies

## Troubleshooting

### "pnpm not found"

Monotize requires pnpm for workspace management:

```bash
npm install -g pnpm
```

### Dependency conflicts

For packages with incompatible dependency versions:

```bash
# Option 1: Use --no-hoist to isolate dependencies
monorepo merge owner/repo1 owner/repo2 --no-hoist

# Option 2: Pin versions for reproducibility
monorepo merge owner/repo1 owner/repo2 --pin-versions
```

### Git history not preserved

Ensure git-filter-repo is installed for best results:

```bash
pip install git-filter-repo
```

### Clone failures

For private repositories, ensure your git credentials are configured:

```bash
# Using SSH
git config --global url."git@github.com:".insteadOf "https://github.com/"

# Or use a personal access token
git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

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
# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests
pnpm test:integration

# E2E tests
pnpm test:e2e

# With coverage
pnpm test:coverage
```

## Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Required |
| pnpm | 8+ | Required for workspace management |
| git | 2.0+ | Required for cloning |
| git-filter-repo | any | Optional, for `--preserve-history` |

## License

MIT
