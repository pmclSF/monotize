import { Router } from 'express';
import {
  readWizardState,
  writeWizardState,
  createDefaultWizardState,
} from '../wizard-state.js';

export function wizardRoute(): Router {
  const router = Router();

  // GET /api/wizard/state — read current wizard state
  router.get('/state', async (_req, res) => {
    try {
      const state = await readWizardState();
      res.json({ exists: state !== null, state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to read wizard state',
      });
    }
  });

  // PUT /api/wizard/state — update wizard state on disk
  router.put('/state', async (req, res) => {
    try {
      const state = req.body;
      if (!state || typeof state !== 'object' || state.version !== 1) {
        res.status(400).json({ error: 'Invalid wizard state: must include version: 1' });
        return;
      }
      await writeWizardState(state);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to write wizard state',
      });
    }
  });

  // POST /api/wizard/init — create default state with provided repos
  router.post('/init', async (req, res) => {
    try {
      const { repos } = req.body ?? {};
      if (!Array.isArray(repos) || repos.length === 0 || !repos.every((r: unknown) => typeof r === 'string')) {
        res.status(400).json({ error: 'Request body must include a non-empty "repos" array of strings' });
        return;
      }
      const state = createDefaultWizardState(repos as string[]);
      await writeWizardState(state);
      res.json({ state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to initialize wizard state',
      });
    }
  });

  return router;
}
