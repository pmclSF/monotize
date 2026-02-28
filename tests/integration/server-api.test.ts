import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'fs-extra';
import request from 'supertest';
import WebSocket from 'ws';
import { createServer } from '../../src/server/index.js';

const fixturesDir = path.resolve(__dirname, '../fixtures');

let server: http.Server;
let wsUrl: string;

// Track artifacts for cleanup
const cleanupPaths: string[] = [];

beforeAll(async () => {
  server = createServer({ port: 0 }); // OS-assigned port
  await new Promise<void>((resolve) => {
    server.on('listening', () => {
      const addr = server.address() as { port: number };
      wsUrl = `ws://localhost:${addr.port}/ws`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

afterEach(async () => {
  for (const p of cleanupPaths) {
    try { await fs.remove(p); } catch { /* ignore */ }
  }
  cleanupPaths.length = 0;
});

/** Helper: open a WS connection and wait for it to be ready */
function openWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Helper: collect WS events for an opId until 'done' */
function collectEvents(
  ws: WebSocket,
  opId: string,
  timeoutMs = 60000,
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const events: Array<Record<string, unknown>> = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out waiting for done event on ${opId}`));
    }, timeoutMs);

    ws.send(JSON.stringify({ type: 'subscribe', opId }));

    ws.on('message', (raw) => {
      const event = JSON.parse(String(raw));
      events.push(event);
      if (event.type === 'done' && event.opId === opId) {
        clearTimeout(timer);
        resolve(events);
      }
    });
  });
}

/** Helper: generate a plan via the API and return its path */
async function generatePlanViaApi(repos: string[]): Promise<string> {
  const ws = await openWs();
  try {
    const res = await request(server)
      .post('/api/plan')
      .send({ repos })
      .expect(202);

    const events = await collectEvents(ws, res.body.opId);
    const resultEvent = events.find((e) => e.type === 'result');
    if (!resultEvent) {
      const errorEvent = events.find((e) => e.type === 'error');
      throw new Error(`Plan failed: ${errorEvent?.message || 'no result event'}`);
    }

    const planPath = (resultEvent.data as Record<string, unknown>).planPath as string;
    // Track for cleanup
    cleanupPaths.push(planPath);
    cleanupPaths.push(`${planPath}.sources`);
    return planPath;
  } finally {
    ws.close();
  }
}

describe('POST /api/analyze', () => {
  it('returns 202 with opId for valid repos', async () => {
    const res = await request(server)
      .post('/api/analyze')
      .send({ repos: [path.join(fixturesDir, 'repo-a')] })
      .expect(202);

    expect(res.body).toHaveProperty('opId');
    expect(typeof res.body.opId).toBe('string');
  });

  it('returns 400 for empty repos', async () => {
    await request(server)
      .post('/api/analyze')
      .send({ repos: [] })
      .expect(400);
  });

  it('returns 400 for missing repos field', async () => {
    await request(server)
      .post('/api/analyze')
      .send({})
      .expect(400);
  });

  it('returns 400 for non-array repos', async () => {
    await request(server)
      .post('/api/analyze')
      .send({ repos: 'not-an-array' })
      .expect(400);
  });

  it('streams result over WebSocket', async () => {
    const ws = await openWs();
    try {
      const res = await request(server)
        .post('/api/analyze')
        .send({ repos: [path.join(fixturesDir, 'repo-a'), path.join(fixturesDir, 'repo-b')] })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);

      const logEvents = events.filter((e) => e.type === 'log');
      const resultEvents = events.filter((e) => e.type === 'result');
      const doneEvents = events.filter((e) => e.type === 'done');

      expect(logEvents.length).toBeGreaterThan(0);
      expect(resultEvents).toHaveLength(1);
      expect(doneEvents).toHaveLength(1);

      const result = resultEvents[0].data as Record<string, unknown>;
      expect(result).toHaveProperty('packages');
      expect(result).toHaveProperty('complexityScore');
    } finally {
      ws.close();
    }
  }, 60000);
});

describe('POST /api/plan', () => {
  it('returns 202 with opId', async () => {
    const res = await request(server)
      .post('/api/plan')
      .send({ repos: [path.join(fixturesDir, 'repo-a')] })
      .expect(202);

    expect(res.body).toHaveProperty('opId');

    // Wait for completion and clean up
    const ws = await openWs();
    try {
      const events = await collectEvents(ws, res.body.opId);
      const resultEvent = events.find((e) => e.type === 'result');
      if (resultEvent) {
        const planPath = (resultEvent.data as Record<string, unknown>).planPath as string;
        if (planPath) {
          cleanupPaths.push(planPath);
          cleanupPaths.push(`${planPath}.sources`);
        }
      }
    } finally {
      ws.close();
    }
  }, 60000);

  it('returns 400 for empty repos', async () => {
    await request(server)
      .post('/api/plan')
      .send({ repos: [] })
      .expect(400);
  });

  it('receives plan result via WebSocket', async () => {
    const ws = await openWs();
    try {
      const res = await request(server)
        .post('/api/plan')
        .send({
          repos: [path.join(fixturesDir, 'repo-a'), path.join(fixturesDir, 'repo-b')],
          options: { conflictStrategy: 'highest' },
        })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);

      const result = resultEvents[0].data as Record<string, unknown>;
      expect(result).toHaveProperty('planPath');
      expect(result).toHaveProperty('plan');

      const planPath = result.planPath as string;
      cleanupPaths.push(planPath);
      cleanupPaths.push(`${planPath}.sources`);
    } finally {
      ws.close();
    }
  }, 60000);
});

describe('POST /api/verify', () => {
  it('returns 202 with opId for plan file', async () => {
    const planPath = await generatePlanViaApi([path.join(fixturesDir, 'repo-a')]);

    const ws = await openWs();
    try {
      const verifyRes = await request(server)
        .post('/api/verify')
        .send({ plan: planPath })
        .expect(202);

      const verifyEvents = await collectEvents(ws, verifyRes.body.opId);
      const resultEvents = verifyEvents.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);

      const result = resultEvents[0].data as Record<string, unknown>;
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('ok');
    } finally {
      ws.close();
    }
  }, 60000);

  it('returns 400 when neither plan nor dir specified', async () => {
    await request(server)
      .post('/api/verify')
      .send({})
      .expect(400);
  });

  it('returns 400 when both plan and dir specified', async () => {
    await request(server)
      .post('/api/verify')
      .send({ plan: 'a', dir: 'b' })
      .expect(400);
  });
});

describe('POST /api/apply', () => {
  it('returns 202 with opId for valid plan', async () => {
    const planPath = await generatePlanViaApi([path.join(fixturesDir, 'repo-a')]);

    const res = await request(server)
      .post('/api/apply')
      .send({ plan: planPath })
      .expect(202);

    expect(res.body).toHaveProperty('opId');

    // Wait for completion (may error since sources were moved — that's ok, we just verify 202)
    const ws = await openWs();
    try {
      await collectEvents(ws, res.body.opId);
    } finally {
      ws.close();
    }
  }, 60000);

  it('returns 400 for missing plan', async () => {
    await request(server)
      .post('/api/apply')
      .send({})
      .expect(400);
  });
});

describe('GET /api/status/:opId', () => {
  it('returns buffered events after operation completes', async () => {
    const ws = await openWs();
    try {
      const res = await request(server)
        .post('/api/analyze')
        .send({ repos: [path.join(fixturesDir, 'repo-a')] })
        .expect(202);

      await collectEvents(ws, res.body.opId);

      const statusRes = await request(server)
        .get(`/api/status/${res.body.opId}`)
        .expect(200);

      expect(statusRes.body).toHaveProperty('events');
      expect(statusRes.body).toHaveProperty('done', true);
      expect(statusRes.body.events.length).toBeGreaterThan(0);
    } finally {
      ws.close();
    }
  }, 60000);

  it('returns 404 for unknown opId', async () => {
    await request(server)
      .get('/api/status/nonexistent-op')
      .expect(404);
  });
});

describe('WebSocket', () => {
  it('subscribe receives log events', async () => {
    const ws = await openWs();
    try {
      const res = await request(server)
        .post('/api/analyze')
        .send({ repos: [path.join(fixturesDir, 'repo-a')] })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const logEvents = events.filter((e) => e.type === 'log');
      expect(logEvents.length).toBeGreaterThan(0);

      for (const e of logEvents) {
        expect(e).toHaveProperty('opId', res.body.opId);
        expect(e).toHaveProperty('level');
        expect(e).toHaveProperty('message');
      }
    } finally {
      ws.close();
    }
  }, 60000);
});
