import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { ServerOptions } from './types.js';
import { WsHub } from './ws/hub.js';
import { analyzeRoute } from './routes/analyze.js';
import { planRoute } from './routes/plan.js';
import { applyRoute } from './routes/apply.js';
import { verifyRoute } from './routes/verify.js';
import { statusRoute } from './routes/status.js';

/**
 * Create and start the HTTP + WebSocket server.
 * Returns the http.Server so callers can listen on it or close it.
 */
export function createServer(options: ServerOptions): http.Server {
  const app = express();
  app.use(express.json());

  const hub = new WsHub();

  // API routes
  app.use('/api/analyze', analyzeRoute(hub));
  app.use('/api/plan', planRoute(hub));
  app.use('/api/apply', applyRoute(hub));
  app.use('/api/verify', verifyRoute(hub));
  app.use('/api/status', statusRoute(hub));

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

  // WebSocket upgrade
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    hub.register(ws);
  });

  // Clean up on server close
  server.on('close', () => {
    hub.destroy();
    wss.close();
  });

  server.listen(options.port);

  return server;
}
