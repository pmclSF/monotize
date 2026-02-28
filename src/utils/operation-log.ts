import fs from 'fs-extra';
import crypto from 'node:crypto';
import type { OperationLogEntry, ApplyStepId } from '../types/index.js';

/**
 * Get the log file path for a staging directory.
 * The log lives adjacent to (not inside) the staging dir.
 */
export function getLogPath(stagingDir: string): string {
  return `${stagingDir}.ops.jsonl`;
}

/**
 * Create a new operation log with a header entry.
 */
export async function createOperationLog(
  logPath: string,
  planHash: string
): Promise<void> {
  const header: OperationLogEntry = {
    id: 'header',
    status: 'started',
    planHash,
    timestamp: new Date().toISOString(),
  };
  await fs.writeFile(logPath, JSON.stringify(header) + '\n', 'utf-8');
}

/**
 * Read all entries from an existing operation log.
 * Returns an empty array if the file doesn't exist or is empty.
 */
export async function readOperationLog(
  logPath: string
): Promise<OperationLogEntry[]> {
  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map((line) => JSON.parse(line) as OperationLogEntry);
  } catch {
    return [];
  }
}

/**
 * Check if a step has already been completed in the log.
 */
export function isStepCompleted(
  entries: OperationLogEntry[],
  stepId: ApplyStepId
): boolean {
  return entries.some((e) => e.id === stepId && e.status === 'completed');
}

/**
 * Append a log entry to the operation log.
 */
export async function appendLogEntry(
  logPath: string,
  entry: OperationLogEntry
): Promise<void> {
  await fs.appendFile(logPath, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * Compute a SHA-256 hash of a string (for plan file integrity).
 */
export function computePlanHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
