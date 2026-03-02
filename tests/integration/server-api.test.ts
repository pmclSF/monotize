import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'fs-extra';
import request from 'supertest';
import WebSocket from 'ws';
import { createServer } from '../../src/server/index.js';

const fixturesDir = path.resolve(__dirname, '../fixtures');

let server: http.Server;
let authToken: string;
let wsUrl: string;

// Track artifacts for cleanup
const cleanupPaths: string[] = [];

/** Supertest agent pre-configured with Bearer auth */
function api() {
  return request(server);
}

function authPost(path: string) {
  return api().post(path).set('Authorization', `Bearer ${authToken}`);
}

function authGet(path: string) {
  return api().get(path).set('Authorization', `Bearer ${authToken}`);
}

function authPut(path: string) {
  return api().put(path).set('Authorization', `Bearer ${authToken}`);
}

beforeAll(async () => {
  const result = createServer({ port: 0 }); // OS-assigned port
  server = result.server;
  authToken = result.token;
  await new Promise<void>((resolve) => {
    server.on('listening', () => {
      const addr = server.address() as { port: number };
      wsUrl = `ws://localhost:${addr.port}/ws?token=${authToken}`;
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
    const res = await authPost('/api/plan')
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

describe('CORS and middleware', () => {
  it('should respond 204 to OPTIONS preflight request', async () => {
    await api()
      .options('/api/analyze')
      .expect(204);
  });

  it('should set CORS headers', async () => {
    const res = await api()
      .options('/api/analyze');

    expect(res.headers['access-control-allow-methods']).toContain('GET');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });
});

describe('POST /api/analyze', () => {
  it('returns 202 with opId for valid repos', async () => {
    const res = await authPost('/api/analyze')
      .send({ repos: [path.join(fixturesDir, 'repo-a')] })
      .expect(202);

    expect(res.body).toHaveProperty('opId');
    expect(typeof res.body.opId).toBe('string');
  });

  it('returns 400 for empty repos', async () => {
    await authPost('/api/analyze')
      .send({ repos: [] })
      .expect(400);
  });

  it('returns 400 for missing repos field', async () => {
    await authPost('/api/analyze')
      .send({})
      .expect(400);
  });

  it('returns 400 for non-array repos', async () => {
    await authPost('/api/analyze')
      .send({ repos: 'not-an-array' })
      .expect(400);
  });

  it('returns 401 without auth token', async () => {
    await api()
      .post('/api/analyze')
      .send({ repos: [path.join(fixturesDir, 'repo-a')] })
      .expect(401);
  });

  it('streams error event for nonexistent repo paths', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/analyze')
        .send({ repos: ['/nonexistent/path/repo'] })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    } finally {
      ws.close();
    }
  }, 60000);

  it('streams result over WebSocket', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/analyze')
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
    const res = await authPost('/api/plan')
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
    await authPost('/api/plan')
      .send({ repos: [] })
      .expect(400);
  });

  it('streams error event for nonexistent repo paths', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/plan')
        .send({ repos: ['/nonexistent/path/repo'] })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    } finally {
      ws.close();
    }
  }, 60000);

  it('receives plan result via WebSocket', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/plan')
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
      const verifyRes = await authPost('/api/verify')
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
    await authPost('/api/verify')
      .send({})
      .expect(400);
  });

  it('returns 400 when both plan and dir specified', async () => {
    await authPost('/api/verify')
      .send({ plan: 'a', dir: 'b' })
      .expect(400);
  });

  it('streams error event for nonexistent plan file', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/verify')
        .send({ plan: '/nonexistent/path/plan.json' })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    } finally {
      ws.close();
    }
  }, 60000);

  it('verifies a real directory with dir option', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/verify')
        .send({ dir: path.join(fixturesDir, 'repo-a') })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);

      const result = resultEvents[0].data as Record<string, unknown>;
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('summary');
    } finally {
      ws.close();
    }
  }, 60000);

  it('streams error for nonexistent dir', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/verify')
        .send({ dir: '/nonexistent/monorepo/path' })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    } finally {
      ws.close();
    }
  }, 60000);
});

describe('POST /api/apply', () => {
  it('returns 202 with opId for valid plan', async () => {
    const planPath = await generatePlanViaApi([path.join(fixturesDir, 'repo-a')]);

    const res = await authPost('/api/apply')
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
  }, 90000);

  it('returns 400 for missing plan', async () => {
    await authPost('/api/apply')
      .send({})
      .expect(400);
  });

  it('streams error event for nonexistent plan file', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/apply')
        .send({ plan: '/nonexistent/path/plan.json' })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    } finally {
      ws.close();
    }
  }, 60000);
});

describe('GET /api/status/:opId', () => {
  it('returns buffered events after operation completes', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/analyze')
        .send({ repos: [path.join(fixturesDir, 'repo-a')] })
        .expect(202);

      await collectEvents(ws, res.body.opId);

      const statusRes = await authGet(`/api/status/${res.body.opId}`)
        .expect(200);

      expect(statusRes.body).toHaveProperty('events');
      expect(statusRes.body).toHaveProperty('done', true);
      expect(statusRes.body.events.length).toBeGreaterThan(0);
    } finally {
      ws.close();
    }
  }, 60000);

  it('returns 404 for unknown opId', async () => {
    await authGet('/api/status/nonexistent-op')
      .expect(404);
  });
});

describe('WebSocket', () => {
  it('subscribe receives log events', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/analyze')
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

  it('should reject WebSocket upgrade on non-/ws path', async () => {
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/not-ws?token=${authToken}`);

    await new Promise<void>((resolve) => {
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
    });

    // Connection should have been destroyed
    expect(ws.readyState).toBeGreaterThanOrEqual(2); // CLOSING or CLOSED
  });

  it('should reject WebSocket upgrade with invalid token', async () => {
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws?token=wrong-token`);

    await new Promise<void>((resolve) => {
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
    });

    expect(ws.readyState).toBeGreaterThanOrEqual(2); // CLOSING or CLOSED
  });

  it('should reject WebSocket upgrade with no token', async () => {
    const addr = server.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
    });

    expect(ws.readyState).toBeGreaterThanOrEqual(2); // CLOSING or CLOSED
  });
});

// ─── Wizard State Endpoints ─────────────────────────────────────────────

const monotizeDir = path.join(process.cwd(), '.monotize');

describe('GET /api/wizard/state', () => {
  afterEach(async () => {
    try { await fs.remove(monotizeDir); } catch { /* ignore */ }
  });

  it('returns { exists: false, state: null } when no config (no auth required)', async () => {
    // Ensure no leftover state
    await fs.remove(monotizeDir);

    const res = await api()
      .get('/api/wizard/state')
      .expect(200);

    expect(res.body.exists).toBe(false);
    expect(res.body.state).toBeNull();
  });
});

describe('POST /api/wizard/init', () => {
  afterEach(async () => {
    try { await fs.remove(monotizeDir); } catch { /* ignore */ }
  });

  it('creates default state and returns it', async () => {
    const res = await authPost('/api/wizard/init')
      .send({ repos: [path.join(fixturesDir, 'repo-a')] })
      .expect(200);

    expect(res.body).toHaveProperty('state');
    expect(res.body.state.version).toBe(1);
    expect(res.body.state.repos).toEqual([path.join(fixturesDir, 'repo-a')]);
    expect(res.body.state.steps).toHaveLength(8);
    expect(res.body.state.currentStep).toBe('assess');
  });

  it('returns 400 for missing repos', async () => {
    await authPost('/api/wizard/init')
      .send({})
      .expect(400);
  });

  it('returns 400 for empty repos', async () => {
    await authPost('/api/wizard/init')
      .send({ repos: [] })
      .expect(400);
  });
});

describe('PUT /api/wizard/state', () => {
  afterEach(async () => {
    try { await fs.remove(monotizeDir); } catch { /* ignore */ }
  });

  it('saves state to disk', async () => {
    // First init
    const initRes = await authPost('/api/wizard/init')
      .send({ repos: ['./repo-a'] })
      .expect(200);

    const state = initRes.body.state;
    state.currentStep = 'prepare';

    const putRes = await authPut('/api/wizard/state')
      .send(state)
      .expect(200);

    expect(putRes.body).toEqual({ ok: true });

    // Verify persisted (GET wizard/state does not require auth)
    const getRes = await api()
      .get('/api/wizard/state')
      .expect(200);

    expect(getRes.body.exists).toBe(true);
    expect(getRes.body.state.currentStep).toBe('prepare');
  });

  it('returns 400 for invalid state', async () => {
    await authPut('/api/wizard/state')
      .send({ notAState: true })
      .expect(400);
  });
});

// ─── Prepare Endpoint ───────────────────────────────────────────────────

describe('POST /api/prepare', () => {
  it('returns 202 with opId for valid repos', async () => {
    const res = await authPost('/api/prepare')
      .send({ repos: [path.join(fixturesDir, 'repo-a')] })
      .expect(202);

    expect(res.body).toHaveProperty('opId');
  });

  it('streams prepare result over WebSocket', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/prepare')
        .send({ repos: [path.join(fixturesDir, 'repo-a')] })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);

      const result = resultEvents[0].data as Record<string, unknown>;
      expect(result).toHaveProperty('repos');
      expect(result).toHaveProperty('checklist');
      expect(result).toHaveProperty('patches');
    } finally {
      ws.close();
    }
  }, 60000);

  it('returns 400 for empty repos', async () => {
    await authPost('/api/prepare')
      .send({ repos: [] })
      .expect(400);
  });

  it('streams error event for nonexistent repo paths', async () => {
    const ws = await openWs();
    try {
      const res = await authPost('/api/prepare')
        .send({ repos: ['/nonexistent/path/repo'] })
        .expect(202);

      const events = await collectEvents(ws, res.body.opId);
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    } finally {
      ws.close();
    }
  }, 60000);
});

// ─── Add Endpoint ───────────────────────────────────────────────────────

describe('POST /api/add', () => {
  it('returns 400 for missing repo', async () => {
    await authPost('/api/add')
      .send({ targetMonorepo: '/tmp/mono' })
      .expect(400);
  });

  it('returns 400 for missing targetMonorepo', async () => {
    await authPost('/api/add')
      .send({ repo: './some-repo' })
      .expect(400);
  });

  it('returns 400 for non-string repo', async () => {
    await authPost('/api/add')
      .send({ repo: 123, targetMonorepo: '/tmp/mono' })
      .expect(400);
  });

  it('returns 202 with opId for valid input', async () => {
    const res = await authPost('/api/add')
      .send({ repo: './tests/fixtures/repo-a', targetMonorepo: '/tmp/mono-test' })
      .expect(202);

    expect(res.body).toHaveProperty('opId');
  });
});

// ─── Migrate Branch Endpoint ────────────────────────────────────────────

describe('POST /api/migrate-branch', () => {
  it('returns 400 for missing branch', async () => {
    await authPost('/api/migrate-branch')
      .send({ sourceRepo: './repo', targetMonorepo: '/tmp/mono' })
      .expect(400);
  });

  it('returns 400 for missing sourceRepo', async () => {
    await authPost('/api/migrate-branch')
      .send({ branch: 'feature', targetMonorepo: '/tmp/mono' })
      .expect(400);
  });

  it('returns 400 for missing targetMonorepo', async () => {
    await authPost('/api/migrate-branch')
      .send({ branch: 'feature', sourceRepo: './repo' })
      .expect(400);
  });

  it('returns 202 with opId for valid input', async () => {
    const res = await authPost('/api/migrate-branch')
      .send({
        branch: 'feature',
        sourceRepo: './tests/fixtures/repo-a',
        targetMonorepo: '/tmp/mono-test',
      })
      .expect(202);

    expect(res.body).toHaveProperty('opId');
  });
});

// ─── Configure Endpoint ─────────────────────────────────────────────────

const configureTmpDir = path.join(__dirname, '../.tmp-configure-integration');

describe('POST /api/configure', () => {
  afterEach(async () => {
    try { await fs.remove(configureTmpDir); } catch { /* ignore */ }
  });

  it('returns 202 with opId for valid input', async () => {
    const res = await authPost('/api/configure')
      .send({ packagesDir: 'packages', packageNames: ['app-a'], baseDir: configureTmpDir })
      .expect(202);

    expect(res.body).toHaveProperty('opId');
  });

  it('returns 400 for missing packagesDir', async () => {
    await authPost('/api/configure')
      .send({ packageNames: ['app-a'] })
      .expect(400);
  });

  it('returns 400 for empty packageNames', async () => {
    await authPost('/api/configure')
      .send({ packagesDir: 'packages', packageNames: [] })
      .expect(400);
  });
});

// ─── Archive Endpoint ───────────────────────────────────────────────────

describe('POST /api/archive', () => {
  it('returns 400 when GITHUB_TOKEN is not set', async () => {
    const original = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    try {
      const res = await authPost('/api/archive')
        .send({ repos: ['./repo-a'] })
        .expect(400);

      expect(res.body.error).toContain('GITHUB_TOKEN');
    } finally {
      if (original) process.env.GITHUB_TOKEN = original;
    }
  });

  it('returns 400 for missing repos', async () => {
    await authPost('/api/archive')
      .send({})
      .expect(400);
  });

  it('returns stub response when GITHUB_TOKEN is set', async () => {
    const original = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token';

    try {
      const res = await authPost('/api/archive')
        .send({ repos: ['./repo-a'] })
        .expect(200);

      expect(res.body.status).toBe('stub');
      expect(res.body.archived).toEqual([]);
    } finally {
      if (original) process.env.GITHUB_TOKEN = original;
      else delete process.env.GITHUB_TOKEN;
    }
  });
});
