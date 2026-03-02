import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import request from 'supertest';

vi.mock('../../../src/server/wizard-state.js', () => ({
  readWizardState: vi.fn(),
  writeWizardState: vi.fn(),
  createDefaultWizardState: vi.fn(),
}));

import { wizardRoute } from '../../../src/server/routes/wizard.js';
import {
  readWizardState,
  writeWizardState,
  createDefaultWizardState,
} from '../../../src/server/wizard-state.js';

const mockRead = vi.mocked(readWizardState);
const mockWrite = vi.mocked(writeWizardState);
const mockCreate = vi.mocked(createDefaultWizardState);

describe('wizard routes error handling', () => {
  let app: express.Express;
  let server: http.Server;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/wizard', wizardRoute());
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('GET /api/wizard/state error path', () => {
    it('should return 500 when readWizardState throws an Error', async () => {
      mockRead.mockRejectedValueOnce(new Error('disk read failure'));

      const res = await request(server).get('/api/wizard/state');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('disk read failure');
    });

    it('should return 500 with fallback message for non-Error throw', async () => {
      mockRead.mockRejectedValueOnce('string error');

      const res = await request(server).get('/api/wizard/state');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to read wizard state');
    });
  });

  describe('PUT /api/wizard/state error path', () => {
    it('should return 500 when writeWizardState throws an Error', async () => {
      mockWrite.mockRejectedValueOnce(new Error('disk write failure'));

      const res = await request(server)
        .put('/api/wizard/state')
        .send({ version: 1, currentStep: 0 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('disk write failure');
    });

    it('should return 500 with fallback message for non-Error throw', async () => {
      mockWrite.mockRejectedValueOnce(42);

      const res = await request(server)
        .put('/api/wizard/state')
        .send({ version: 1, currentStep: 0 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to write wizard state');
    });
  });

  describe('POST /api/wizard/init error path', () => {
    it('should return 500 when createDefaultWizardState throws an Error', async () => {
      mockCreate.mockImplementationOnce(() => {
        throw new Error('creation failure');
      });

      const res = await request(server)
        .post('/api/wizard/init')
        .send({ repos: ['/tmp/test'] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('creation failure');
    });

    it('should return 500 when writeWizardState rejects after init', async () => {
      mockCreate.mockReturnValueOnce({ version: 1, currentStep: 'assess' } as ReturnType<typeof createDefaultWizardState>);
      mockWrite.mockRejectedValueOnce(new Error('write after init failed'));

      const res = await request(server)
        .post('/api/wizard/init')
        .send({ repos: ['/tmp/test'] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('write after init failed');
    });

    it('should return 500 with fallback for non-Error throw in init', async () => {
      mockCreate.mockImplementationOnce(() => {
        throw 'unexpected';
      });

      const res = await request(server)
        .post('/api/wizard/init')
        .send({ repos: ['/tmp/test'] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to initialize wizard state');
    });
  });
});
