#!/usr/bin/env node
import { Command } from 'commander';
import { mergeCommand } from './commands/merge.js';

const program = new Command();

program
  .name('monorepo')
  .description('Combine multiple Git repositories into a monorepo')
  .version('0.1.0');

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
  .action(mergeCommand);

program.parse();
