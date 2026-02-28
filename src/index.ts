#!/usr/bin/env node
import { Command } from 'commander';
import { mergeCommand } from './commands/merge.js';
import { initCommand } from './commands/init.js';
import { analyzeCommand } from './commands/analyze.js';
import { applyCommand } from './commands/apply.js';
import { planCommand } from './commands/plan.js';
import { verifyCommand } from './commands/verify.js';
import { prepareCommand } from './commands/prepare.js';
import { uiCommand } from './commands/ui.js';
import { addCommand } from './commands/add.js';
import { archiveCommand } from './commands/archive.js';
import { migrateBranchCommand } from './commands/migrate-branch.js';
import { registerConfigureCommand } from './commands/configure.js';

const program = new Command();

program
  .name('monorepo')
  .description('Combine multiple Git repositories into a monorepo')
  .version('0.2.0');

program
  .command('merge')
  .description('Merge repositories into a monorepo')
  .argument('<repos...>', 'Repositories to merge (URLs, GitHub shorthand, or local paths)')
  .option('-o, --output <dir>', 'Output directory', './monorepo')
  .option('-p, --packages-dir <name>', 'Packages subdirectory name', 'packages')
  .option('--dry-run', 'Show plan without executing')
  .option('-y, --yes', 'Skip prompts, use defaults')
  .option(
    '--conflict-strategy <strategy>',
    'Dependency conflict resolution strategy (highest, lowest, prompt)',
    'prompt'
  )
  .option('-v, --verbose', 'Verbose output')
  .option('--no-install', 'Skip running package install')
  .option('--no-hoist', 'Keep dependencies in each package (prevents type conflicts)')
  .option('--pin-versions', 'Pin dependency versions by removing ^ and ~ ranges')
  .option(
    '--package-manager <pm>',
    'Package manager to use (pnpm, yarn, yarn-berry, npm)',
    'pnpm'
  )
  .option('--auto-detect-pm', 'Auto-detect package manager from source repos')
  // Phase 2 options
  .option('--preserve-history', 'Preserve git commit history from source repos')
  .option(
    '--workspace-tool <tool>',
    'Generate workspace tool config (turbo, nx, none)',
    'none'
  )
  .option(
    '--workflow-strategy <strategy>',
    'CI workflow merge strategy (combine, keep-first, keep-last, skip)',
    'combine'
  )
  .action(mergeCommand);

program
  .command('init')
  .description('Initialize a new monorepo workspace')
  .argument('[directory]', 'Directory to initialize (defaults to current directory)')
  .option('-p, --packages-dir <name>', 'Packages subdirectory name', 'packages')
  .option(
    '--workspace-tool <tool>',
    'Workspace tool to configure (turbo, nx, none)',
    'none'
  )
  .option(
    '--package-manager <pm>',
    'Package manager to use (pnpm, yarn, yarn-berry, npm)',
    'pnpm'
  )
  .option('--no-git', 'Skip git initialization')
  .option('-v, --verbose', 'Verbose output')
  .action(initCommand);

program
  .command('analyze')
  .description('Analyze repositories before merging')
  .argument('<repos...>', 'Repositories to analyze (URLs, GitHub shorthand, or local paths)')
  .option('-v, --verbose', 'Verbose output')
  .option('--json', 'Output as JSON')
  .action(analyzeCommand);

program
  .command('plan')
  .description('Generate a migration plan for review before applying')
  .argument('<repos...>', 'Repositories to merge (URLs, GitHub shorthand, or local paths)')
  .option('-o, --output <dir>', 'Target output directory for the monorepo', './monorepo')
  .option('-p, --packages-dir <name>', 'Packages subdirectory name', 'packages')
  .option('--plan-file <file>', 'Path for the generated plan JSON file')
  .option('-y, --yes', 'Skip prompts, use defaults')
  .option(
    '--conflict-strategy <strategy>',
    'Dependency conflict resolution strategy (highest, lowest, prompt)',
    'prompt'
  )
  .option('-v, --verbose', 'Verbose output')
  .option('--no-install', 'Skip running package install in the apply phase')
  .option('--no-hoist', 'Keep dependencies in each package (prevents type conflicts)')
  .option('--pin-versions', 'Pin dependency versions by removing ^ and ~ ranges')
  .option(
    '--package-manager <pm>',
    'Package manager to use (pnpm, yarn, yarn-berry, npm)',
    'pnpm'
  )
  .option('--auto-detect-pm', 'Auto-detect package manager from source repos')
  .option(
    '--workspace-tool <tool>',
    'Generate workspace tool config (turbo, nx, none)',
    'none'
  )
  .option(
    '--workflow-strategy <strategy>',
    'CI workflow merge strategy (combine, keep-first, keep-last, skip)',
    'combine'
  )
  .action(planCommand);

program
  .command('apply')
  .description('Apply a migration plan to create a monorepo (transactional)')
  .requiredOption('--plan <file>', 'Path to migration plan JSON file')
  .option('-o, --out <dir>', 'Output directory', './monorepo')
  .option('--resume', 'Resume an interrupted apply from staging directory')
  .option('--cleanup', 'Remove staging artifacts from a previous interrupted run')
  .option('--dry-run', 'Show what would be done without executing')
  .option('-v, --verbose', 'Verbose output')
  .action(applyCommand);

program
  .command('verify')
  .description('Verify a migration plan or applied monorepo')
  .option('--plan <file>', 'Path to migration plan JSON file')
  .option('--dir <dir>', 'Path to applied monorepo directory')
  .option('--tier <tier>', 'Verification tier (static, install, full)', 'static')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Verbose output')
  .action(verifyCommand);

program
  .command('prepare')
  .description('Analyze repos and generate pre-migration patches and checklist')
  .argument('<repos...>', 'Repositories to prepare')
  .option('--node-version <ver>', 'Target Node.js version (e.g. "20")')
  .option('--package-manager <pm>', 'Target package manager (pnpm, yarn, npm)')
  .option('--patch-only', 'Emit patches only (default mode)')
  .option('--out-dir <dir>', 'Write patches and checklist to directory')
  .option('--prep-workspace <dir>', 'Clone repos, apply patches, commit on branch')
  .option('--out <file>', 'Write PreparationPlan JSON to file')
  .option('-v, --verbose', 'Verbose output')
  .action(prepareCommand);

program
  .command('add')
  .description('Add a repository to an existing monorepo')
  .argument('<repo>', 'Repository to add (URL, GitHub shorthand, or local path)')
  .requiredOption('--to <dir>', 'Path to target monorepo')
  .option('-p, --packages-dir <name>', 'Packages subdirectory name', 'packages')
  .option('--out <file>', 'Output path for plan JSON')
  .option('--apply', 'Apply immediately after planning')
  .option(
    '--conflict-strategy <strategy>',
    'Dependency conflict resolution strategy (highest, lowest, prompt)',
    'highest'
  )
  .option(
    '--package-manager <pm>',
    'Package manager to use (pnpm, yarn, yarn-berry, npm)',
    'pnpm'
  )
  .option('-v, --verbose', 'Verbose output')
  .action(addCommand);

program
  .command('archive')
  .description('Generate deprecation notices and optionally archive source repositories')
  .argument('<repos...>', 'Repositories to archive (URLs or GitHub shorthand)')
  .requiredOption('--monorepo-url <url>', 'URL of the monorepo these repos migrated to')
  .option('--out <file>', 'Output path for archive plan JSON')
  .option('--apply', 'Apply archive operations via GitHub API')
  .option('--token-from-env', 'Read GitHub token from GITHUB_TOKEN environment variable')
  .option('-v, --verbose', 'Verbose output')
  .action(archiveCommand);

program
  .command('migrate-branch')
  .description('Migrate a branch from a source repo to a monorepo')
  .argument('<branch>', 'Branch name to migrate')
  .requiredOption('--from <repo>', 'Source repository path')
  .requiredOption('--to <monorepo>', 'Target monorepo path')
  .option(
    '--strategy <strategy>',
    'Migration strategy (subtree, replay)',
    'subtree'
  )
  .option('--out <file>', 'Output path for branch plan JSON')
  .option('--apply', 'Apply migration immediately')
  .option('-v, --verbose', 'Verbose output')
  .action(migrateBranchCommand);

program
  .command('ui')
  .description('Start the web UI server')
  .option('-p, --port <port>', 'Port to listen on', '3847')
  .option('--no-open', 'Do not open browser automatically')
  .option('-v, --verbose', 'Verbose output')
  .action(uiCommand);

registerConfigureCommand(program);

program.parse();
