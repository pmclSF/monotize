import chalk from 'chalk';
import type { Logger } from '../types/index.js';

const ICONS = {
  success: '\u2713',
  warning: '\u26A0',
  error: '\u2717',
  info: '\u2139',
  debug: '\u2022',
} as const;

/**
 * Create a logger with colored console output
 */
export function createLogger(verbose = false): Logger {
  return {
    info(message: string): void {
      console.log(chalk.blue(`${ICONS.info} ${message}`));
    },

    success(message: string): void {
      console.log(chalk.green(`${ICONS.success} ${message}`));
    },

    warn(message: string): void {
      console.log(chalk.yellow(`${ICONS.warning} ${message}`));
    },

    error(message: string): void {
      console.error(chalk.red(`${ICONS.error} ${message}`));
    },

    debug(message: string): void {
      if (verbose) {
        console.log(chalk.gray(`${ICONS.debug} ${message}`));
      }
    },

    log(message: string): void {
      console.log(message);
    },
  };
}

/**
 * Format a list of items for display
 */
export function formatList(items: string[], indent = 2): string {
  const spaces = ' '.repeat(indent);
  return items.map((item) => `${spaces}- ${item}`).join('\n');
}

/**
 * Format a header for section output
 */
export function formatHeader(title: string): string {
  return chalk.bold.underline(`\n${title}\n`);
}

/**
 * Format a key-value pair for display
 */
export function formatKeyValue(key: string, value: string): string {
  return `${chalk.cyan(key)}: ${value}`;
}
