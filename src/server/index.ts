import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { ServerOptions } from './types.js';
import { WsHub } from './ws/hub.js';
import { analyzeRoute } from './routes/analyze.js';
import { planRoute } from './routes/plan.js';
import { applyRoute } from './routes/apply.js';
import { verifyRoute } from './routes/verify.js';
import { statusRoute } from './routes/status.js';
import { wizardRoute } from './routes/wizard.js';
import { prepareRoute } from './routes/prepare.js';
import { configureRoute } from './routes/configure.js';
import { archiveRoute } from './routes/archive.js';
import { addRoute } from './routes/add.js';
import { migrateBranchRoute } from './routes/migrate-branch.js';

export interface ServerResult {
  server: http.Server;
  token: string;
}

/**
 * Create and start the HTTP + WebSocket server.
 * Returns the http.Server and auth token so callers can display it.
 */
export function createServer(options: ServerOptions): ServerResult {
  const app = express();

  // Generate auth token (SEC-03)
  const token = crypto.randomBytes(24).toString('hex');

  // Body size limit (SEC-06)
  app.use(express.json({ limit: '50kb' }));

  // CORS - localhost only (SEC-03)
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Auth middleware for API routes (SEC-03)
  app.use('/api', (req, res, next) => {
    // Allow wizard state endpoint without auth for initial UI load
    if (req.path === '/wizard/state' && req.method === 'GET') {
      next();
      return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${token}`) {
      res.status(401).json({ error: 'Unauthorized. Provide Authorization: Bearer <token> header.' });
      return;
    }
    next();
  });

  const hub = new WsHub();

  // API routes
  app.use('/api/analyze', analyzeRoute(hub));
  app.use('/api/plan', planRoute(hub));
  app.use('/api/apply', applyRoute(hub));
  app.use('/api/verify', verifyRoute(hub));
  app.use('/api/status', statusRoute(hub));
  app.use('/api/wizard', wizardRoute());
  app.use('/api/prepare', prepareRoute(hub));
  app.use('/api/configure', configureRoute(hub));
  app.use('/api/archive', archiveRoute(hub));
  app.use('/api/add', addRoute(hub));
  app.use('/api/migrate-branch', migrateBranchRoute(hub));

  // Serve static UI assets if available
  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    // SPA fallback — serve index.html for non-API routes
    // Express 5 requires named wildcard parameters
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(options.staticDir!, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // WebSocket upgrade with auth (SEC-03)
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    // Check token in query string for WebSocket
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const wsToken = url.searchParams.get('token');
    if (wsToken !== token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    hub.register(ws);
  });

  // Clean up on server close
  server.on('close', () => {
    hub.destroy();
    wss.close();
  });

  server.listen(options.port);

  return { server, token };
}
