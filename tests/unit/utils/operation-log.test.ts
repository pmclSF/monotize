import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import {
  getLogPath,
  createOperationLog,
  readOperationLog,
  isStepCompleted,
  appendLogEntry,
  computePlanHash,
} from '../../../src/utils/operation-log.js';
import type { OperationLogEntry } from '../../../src/types/index.js';

describe('operation-log', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `oplog-test-${crypto.randomBytes(8).toString('hex')}`
    );
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  describe('getLogPath', () => {
    it('should append .ops.jsonl to the staging dir path', () => {
      expect(getLogPath('/tmp/out.staging-abcd1234')).toBe(
        '/tmp/out.staging-abcd1234.ops.jsonl'
      );
    });
  });

  describe('createOperationLog', () => {
    it('should write a header entry', async () => {
      const logPath = path.join(tempDir, 'test.ops.jsonl');
      await createOperationLog(logPath, 'abc123');

      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const entry = JSON.parse(lines[0]) as OperationLogEntry;
      expect(entry.id).toBe('header');
      expect(entry.status).toBe('started');
      expect(entry.planHash).toBe('abc123');
      expect(entry.timestamp).toBeTruthy();
    });
  });

  describe('readOperationLog', () => {
    it('should parse all entries', async () => {
      const logPath = path.join(tempDir, 'test.ops.jsonl');
      const lines = [
        JSON.stringify({ id: 'header', status: 'started', planHash: 'h1', timestamp: '2026-01-01T00:00:00Z' }),
        JSON.stringify({ id: 'scaffold', status: 'completed', timestamp: '2026-01-01T00:00:01Z' }),
      ];
      await fs.writeFile(logPath, lines.join('\n') + '\n', 'utf-8');

      const entries = await readOperationLog(logPath);
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('header');
      expect(entries[1].id).toBe('scaffold');
    });

    it('should return empty array for missing file', async () => {
      const entries = await readOperationLog(path.join(tempDir, 'missing.jsonl'));
      expect(entries).toEqual([]);
    });

    it('should return empty array for empty file', async () => {
      const logPath = path.join(tempDir, 'empty.jsonl');
      await fs.writeFile(logPath, '', 'utf-8');

      const entries = await readOperationLog(logPath);
      expect(entries).toEqual([]);
    });
  });

  describe('isStepCompleted', () => {
    const entries: OperationLogEntry[] = [
      { id: 'header', status: 'started', planHash: 'h', timestamp: '' },
      { id: 'scaffold', status: 'completed', timestamp: '' },
      { id: 'move-packages', status: 'failed', timestamp: '' },
    ];

    it('should return true for completed steps', () => {
      expect(isStepCompleted(entries, 'scaffold')).toBe(true);
    });

    it('should return false for failed steps', () => {
      expect(isStepCompleted(entries, 'move-packages')).toBe(false);
    });

    it('should return false for missing steps', () => {
      expect(isStepCompleted(entries, 'write-root')).toBe(false);
    });
  });

  describe('appendLogEntry', () => {
    it('should append without overwriting existing entries', async () => {
      const logPath = path.join(tempDir, 'test.ops.jsonl');
      await createOperationLog(logPath, 'hash1');

      await appendLogEntry(logPath, {
        id: 'scaffold',
        status: 'completed',
        timestamp: new Date().toISOString(),
        outputs: ['staging/', 'staging/packages/'],
        durationMs: 5,
      });

      const entries = await readOperationLog(logPath);
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('header');
      expect(entries[1].id).toBe('scaffold');
      expect(entries[1].outputs).toEqual(['staging/', 'staging/packages/']);
    });
  });

  describe('computePlanHash', () => {
    it('should produce a deterministic hash', () => {
      const content = '{"version":1}';
      const h1 = computePlanHash(content);
      const h2 = computePlanHash(content);
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce different hashes for different content', () => {
      expect(computePlanHash('a')).not.toBe(computePlanHash('b'));
    });
  });
});
