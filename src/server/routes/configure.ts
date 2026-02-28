import crypto from 'node:crypto';
import { Router } from 'express';
import type { WsHub } from '../ws/hub.js';
import { createWsLogger } from '../ws/logger.js';
import { runConfigure } from '../api.js';

export function configureRoute(hub: WsHub): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { packagesDir, packageNames, workspaceTool, baseDir } = req.body ?? {};

    if (!packagesDir || typeof packagesDir !== 'string') {
      res.status(400).json({ error: 'Request body must include a "packagesDir" string' });
      return;
    }

    if (!Array.isArray(packageNames) || packageNames.length === 0 || !packageNames.every((n: unknown) => typeof n === 'string')) {
      res.status(400).json({ error: 'Request body must include a non-empty "packageNames" array of strings' });
      return;
    }

    const opId = crypto.randomUUID();
    hub.createOperation(opId);
    res.status(202).json({ opId });

    // Fire-and-forget
    const logger = createWsLogger(hub, opId);
    runConfigure({ packagesDir, packageNames: packageNames as string[], workspaceTool, baseDir }, logger)
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
