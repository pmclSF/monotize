import crypto from 'node:crypto';
import { Router } from 'express';
import type { WsHub } from '../ws/hub.js';
import { createWsLogger } from '../ws/logger.js';
import { generateAddPlan, applyAddPlan } from '../../strategies/add.js';

export function addRoute(hub: WsHub): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { repo, targetMonorepo, options } = req.body ?? {};

    if (!repo || typeof repo !== 'string') {
      res.status(400).json({ error: 'Request body must include a "repo" string' });
      return;
    }

    if (!targetMonorepo || typeof targetMonorepo !== 'string') {
      res.status(400).json({ error: 'Request body must include a "targetMonorepo" string' });
      return;
    }

    const opId = crypto.randomUUID();
    hub.createOperation(opId);
    res.status(202).json({ opId });

    const logger = createWsLogger(hub, opId);

    (async () => {
      try {
        const plan = await generateAddPlan(repo, {
          to: targetMonorepo,
          packagesDir: options?.packagesDir || 'packages',
          conflictStrategy: options?.conflictStrategy || 'highest',
          packageManager: options?.packageManager || 'pnpm',
        }, logger);

        if (options?.apply) {
          await applyAddPlan(plan, logger);
        }

        hub.broadcast(opId, { type: 'result', data: plan, opId });
        hub.broadcast(opId, { type: 'done', opId });
      } catch (err) {
        hub.broadcast(opId, {
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
          opId,
        });
        hub.broadcast(opId, { type: 'done', opId });
      } finally {
        hub.scheduleCleanup(opId);
      }
    })();
  });

  return router;
}
