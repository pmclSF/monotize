import { Router } from 'express';
import type { WsHub } from '../ws/hub.js';

export function statusRoute(hub: WsHub): Router {
  const router = Router();

  router.get('/:opId', (req, res) => {
    const { opId } = req.params;
    const events = hub.getEvents(opId);

    if (events.length === 0) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }

    res.json({
      events,
      done: hub.isDone(opId),
    });
  });

  return router;
}
