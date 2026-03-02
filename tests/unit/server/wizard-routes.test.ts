import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { createServer } from '../../../src/server/index.js';

describe('wizard routes', () => {
  let server: http.Server;
  let authToken: string;

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

  function authGet(urlPath: string) {
    return request(server).get(urlPath).set('Authorization', `Bearer ${authToken}`);
  }

  function authPut(urlPath: string) {
    return request(server).put(urlPath).set('Authorization', `Bearer ${authToken}`);
  }

  function authPost(urlPath: string) {
    return request(server).post(urlPath).set('Authorization', `Bearer ${authToken}`);
  }

  describe('GET /api/wizard/state', () => {
    it('should return state object with exists field', async () => {
      const res = await authGet('/api/wizard/state');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('exists');
      expect(typeof res.body.exists).toBe('boolean');
    });
  });

  describe('PUT /api/wizard/state', () => {
    it('should reject state without version', async () => {
      const res = await authPut('/api/wizard/state').send({ step: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('version');
    });

    it('should reject non-object body', async () => {
      const res = await authPut('/api/wizard/state').send('not-json');
      expect(res.status).toBe(400);
    });

    it('should accept valid wizard state', async () => {
      const state = {
        version: 1,
        currentStep: 0,
        repos: ['/tmp/repo-a'],
        completedSteps: [],
      };
      const res = await authPut('/api/wizard/state').send(state);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should persist state that can be read back', async () => {
      const state = {
        version: 1,
        currentStep: 2,
        repos: ['/tmp/test-repo'],
        completedSteps: [0, 1],
      };
      await authPut('/api/wizard/state').send(state);

      const res = await authGet('/api/wizard/state');
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.state.currentStep).toBe(2);
    });
  });

  describe('POST /api/wizard/init', () => {
    it('should reject missing repos', async () => {
      const res = await authPost('/api/wizard/init').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('repos');
    });

    it('should reject empty repos array', async () => {
      const res = await authPost('/api/wizard/init').send({ repos: [] });
      expect(res.status).toBe(400);
    });

    it('should reject non-string repos', async () => {
      const res = await authPost('/api/wizard/init').send({ repos: [1, 2] });
      expect(res.status).toBe(400);
    });

    it('should create default state with provided repos', async () => {
      const res = await authPost('/api/wizard/init').send({
        repos: ['/tmp/repo-a', '/tmp/repo-b'],
      });
      expect(res.status).toBe(200);
      expect(res.body.state).toBeDefined();
      expect(res.body.state.version).toBe(1);
    });
  });
});
