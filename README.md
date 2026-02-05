# Monotize

> Combine multiple Git repositories into a monorepo with workspace support

[![CI](https://github.com/pzachary/monotize/actions/workflows/ci.yml/badge.svg)](https://github.com/pzachary/monotize/actions/workflows/ci.yml)
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

## Features

- **Smart Merging**: Combine multiple repositories with intelligent dependency conflict detection
- **Git History Preservation**: Keep commit history from source repositories (`--preserve-history`)
- **Workspace Tools**: Generate Turborepo or Nx configurations (`--workspace-tool turbo|nx`)
- **CI/CD Merging**: Automatically combine GitHub Actions workflows
- **Conflict Resolution**: Interactive or automatic dependency conflict resolution
- **File Collision Handling**: Smart strategies for handling duplicate files
- **Analysis Mode**: Preview merge complexity before executing

## Installation

```bash
# npm
npm install -g monorepo-cli

# pnpm
pnpm add -g monorepo-cli

# Or use npx for one-off usage
npx monorepo-cli <command>
```

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

**Output includes:**
- Package information
- Dependency conflicts (with severity)
- File collisions
- Cross-dependencies between packages
- Complexity score (0-100)
- Recommendations

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
git clone https://github.com/pzachary/monotize
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

## License

MIT
