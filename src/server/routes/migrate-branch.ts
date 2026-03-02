import crypto from 'node:crypto';
import { Router } from 'express';
import type { WsHub } from '../ws/hub.js';
import { createWsLogger } from '../ws/logger.js';
import { generateBranchPlan, applyBranchPlan } from '../../strategies/migrate-branch.js';
import type { BranchMigrateStrategy } from '../../types/index.js';

export function migrateBranchRoute(hub: WsHub): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { branch, sourceRepo, targetMonorepo, strategy, options } = req.body ?? {};

    if (!branch || typeof branch !== 'string') {
      res.status(400).json({ error: 'Request body must include a "branch" string' });
      return;
    }

    if (!sourceRepo || typeof sourceRepo !== 'string') {
      res.status(400).json({ error: 'Request body must include a "sourceRepo" string' });
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
    const migrationStrategy: BranchMigrateStrategy = strategy === 'replay' ? 'replay' : 'subtree';

    (async () => {
      try {
        const plan = await generateBranchPlan(
          branch, sourceRepo, targetMonorepo,
          migrationStrategy, logger,
        );

        if (options?.apply) {
          await applyBranchPlan(plan, options?.subdir || plan.sourceRepo, logger);
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
