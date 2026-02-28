import crypto from 'node:crypto';
import { Router } from 'express';
import type { WsHub } from '../ws/hub.js';
import { createWsLogger } from '../ws/logger.js';
import { runVerify } from '../api.js';

export function verifyRoute(hub: WsHub): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { plan, dir, tier } = req.body ?? {};

    if (!plan && !dir) {
      res.status(400).json({ error: 'Request body must include either "plan" or "dir"' });
      return;
    }
    if (plan && dir) {
      res.status(400).json({ error: 'Specify either "plan" or "dir", not both' });
      return;
    }

    const opId = crypto.randomUUID();
    hub.createOperation(opId);
    res.status(202).json({ opId });

    const logger = createWsLogger(hub, opId);
    runVerify({ plan, dir, tier }, logger)
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
