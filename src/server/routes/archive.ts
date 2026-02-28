import { Router } from 'express';
import type { WsHub } from '../ws/hub.js';

export function archiveRoute(_hub: WsHub): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const { repos } = req.body ?? {};

    if (!Array.isArray(repos) || repos.length === 0 || !repos.every((r: unknown) => typeof r === 'string')) {
      res.status(400).json({ error: 'Request body must include a non-empty "repos" array of strings' });
      return;
    }

    if (!process.env.GITHUB_TOKEN) {
      res.status(400).json({
        error: 'GITHUB_TOKEN environment variable is required for archive operations',
      });
      return;
    }

    // Stub response
    res.json({
      archived: [],
      status: 'stub',
      message: 'Archive functionality is experimental. Set GITHUB_TOKEN and implement repo archiving logic.',
    });
  });

  return router;
}
