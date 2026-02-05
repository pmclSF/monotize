#!/usr/bin/env node
import { Command } from 'commander';
import { mergeCommand } from './commands/merge.js';
import { initCommand } from './commands/init.js';
import { analyzeCommand } from './commands/analyze.js';

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
  .option('--no-install', 'Skip running pnpm install')
  .option('--no-hoist', 'Keep dependencies in each package (prevents type conflicts)')
  .option('--pin-versions', 'Pin dependency versions by removing ^ and ~ ranges')
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

program.parse();
