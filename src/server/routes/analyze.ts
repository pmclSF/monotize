import crypto from 'node:crypto';
import { Router } from 'express';
import type { WsHub } from '../ws/hub.js';
import { createWsLogger } from '../ws/logger.js';
import { runAnalyze } from '../api.js';

export function analyzeRoute(hub: WsHub): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { repos } = req.body ?? {};

    if (!Array.isArray(repos) || repos.length === 0 || !repos.every((r: unknown) => typeof r === 'string')) {
      res.status(400).json({ error: 'Request body must include a non-empty "repos" array of strings' });
      return;
    }

    const opId = crypto.randomUUID();
    hub.createOperation(opId);
    res.status(202).json({ opId });

    // Fire-and-forget
    const logger = createWsLogger(hub, opId);
    runAnalyze(repos as string[], logger)
      .then((data) => {
        hub.broadcast(opId, { type: 'result', data, opId });
        hub.broadcast(opId, { type: 'done', opId });
      })
      .catch((err) => {
        hub.broadcast(opId, {
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
          opId,
        });
        hub.broadcast(opId, { type: 'done', opId });
      })
      .finally(() => {
        hub.scheduleCleanup(opId);
      });
  });

  return router;
}
