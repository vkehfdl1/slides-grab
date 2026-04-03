/**
 * SSE events and run tracking routes.
 * Routes: GET /api/events, GET /api/runs, GET /api/runs/:runId/log
 */
export function createEventsRouter(ctx) {
  const { express } = ctx;
  const router = express.Router();

  router.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: connected\ndata: {}\n\n');

    ctx.sseClients.add(res);
    req.on('close', () => ctx.sseClients.delete(res));

    const snapshotPayload = {
      runs: ctx.runStore.listRuns(),
      activeRuns: ctx.runStore.listActiveRuns(),
    };
    res.write(`event: runsSnapshot\ndata: ${JSON.stringify(snapshotPayload)}\n\n`);
  });

  router.get('/api/generate-status', (_req, res) => {
    res.json({ active: !!ctx.activeGenerate });
  });

  router.get('/api/runs', (_req, res) => {
    res.json({
      runs: ctx.runStore.listRuns(100),
      activeRuns: ctx.runStore.listActiveRuns(),
    });
  });

  router.get('/api/runs/:runId/log', (req, res) => {
    const log = ctx.runStore.getRunLog(req.params.runId);
    if (log === null) {
      return res.status(404).send('Run not found');
    }

    res.type('text/plain').send(log);
  });

  return router;
}
