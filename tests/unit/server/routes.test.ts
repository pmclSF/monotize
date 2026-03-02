import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { createServer } from '../../../src/server/index.js';

describe('server routes - add and migrate-branch', () => {
  let server: http.Server;
  let authToken: string;

  function authPost(path: string) {
    return request(server).post(path).set('Authorization', `Bearer ${authToken}`);
  }

  beforeAll(async () => {
    const result = createServer({ port: 0 });
    server = result.server;
    authToken = result.token;
    await new Promise<void>((resolve) => {
      server.on('listening', resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('POST /api/add', () => {
    it('should return 400 when repo is missing', async () => {
      const res = await authPost('/api/add').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('repo');
    });

    it('should return 400 when repo is not a string', async () => {
      const res = await authPost('/api/add').send({ repo: 123 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('repo');
    });

    it('should return 400 when targetMonorepo is missing', async () => {
      const res = await authPost('/api/add').send({ repo: 'org/my-lib' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('targetMonorepo');
    });

    it('should return 400 when targetMonorepo is not a string', async () => {
      const res = await authPost('/api/add').send({ repo: 'org/my-lib', targetMonorepo: 42 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('targetMonorepo');
    });

    it('should return 202 with opId for valid request', async () => {
      const res = await authPost('/api/add').send({
        repo: 'tests/fixtures/repo-a',
        targetMonorepo: '/tmp/nonexistent-mono',
      });
      expect(res.status).toBe(202);
      expect(res.body.opId).toBeDefined();
      expect(typeof res.body.opId).toBe('string');
    });
  });

  describe('POST /api/migrate-branch', () => {
    it('should return 400 when branch is missing', async () => {
      const res = await authPost('/api/migrate-branch').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('branch');
    });

    it('should return 400 when branch is not a string', async () => {
      const res = await authPost('/api/migrate-branch').send({ branch: 123 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('branch');
    });

    it('should return 400 when sourceRepo is missing', async () => {
      const res = await authPost('/api/migrate-branch').send({ branch: 'main' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('sourceRepo');
    });

    it('should return 400 when sourceRepo is not a string', async () => {
      const res = await authPost('/api/migrate-branch').send({ branch: 'main', sourceRepo: 42 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('sourceRepo');
    });

    it('should return 400 when targetMonorepo is missing', async () => {
      const res = await authPost('/api/migrate-branch').send({
        branch: 'main',
        sourceRepo: '/tmp/src',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('targetMonorepo');
    });

    it('should return 400 when targetMonorepo is not a string', async () => {
      const res = await authPost('/api/migrate-branch').send({
        branch: 'main',
        sourceRepo: '/tmp/src',
        targetMonorepo: false,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('targetMonorepo');
    });

    it('should return 202 with opId for valid request', async () => {
      const res = await authPost('/api/migrate-branch').send({
        branch: 'main',
        sourceRepo: '/tmp/src',
        targetMonorepo: '/tmp/target',
      });
      expect(res.status).toBe(202);
      expect(res.body.opId).toBeDefined();
      expect(typeof res.body.opId).toBe('string');
    });

    it('should default to subtree strategy', async () => {
      const res = await authPost('/api/migrate-branch').send({
        branch: 'main',
        sourceRepo: '/tmp/src',
        targetMonorepo: '/tmp/target',
      });
      expect(res.status).toBe(202);
    });

    it('should accept replay strategy', async () => {
      const res = await authPost('/api/migrate-branch').send({
        branch: 'feature',
        sourceRepo: '/tmp/src',
        targetMonorepo: '/tmp/target',
        strategy: 'replay',
      });
      expect(res.status).toBe(202);
    });
  });
});
