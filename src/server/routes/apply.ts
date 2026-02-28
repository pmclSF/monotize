import crypto from 'node:crypto';
import { Router } from 'express';
import type { WsHub } from '../ws/hub.js';
import { createWsLogger } from '../ws/logger.js';
import { runApply } from '../api.js';

export function applyRoute(hub: WsHub): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { plan, out } = req.body ?? {};

    if (typeof plan !== 'string' || !plan) {
      res.status(400).json({ error: 'Request body must include a "plan" string (path to plan file)' });
      return;
    }

    const opId = crypto.randomUUID();
    const controller = hub.createOperation(opId);
    res.status(202).json({ opId });

    const logger = createWsLogger(hub, opId);
    runApply({ plan, out }, logger, controller.signal)
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
