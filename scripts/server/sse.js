/**
 * SSE (Server-Sent Events) utilities.
 */

export function broadcastSSE(sseClients, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

export function broadcastRunsSnapshot(ctx) {
  broadcastSSE(ctx.sseClients, 'runsSnapshot', {
    runs: ctx.runStore.listRuns(),
    activeRuns: ctx.runStore.listActiveRuns(),
  });
}
