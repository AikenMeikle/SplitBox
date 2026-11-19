import type { Request, Response } from 'express';

export type RealtimeEventType =
  | 'pool_updated'
  | 'drop_updated'
  | 'products_updated'
  | 'requests_updated';

/**
 * Lightweight Server-Sent Events (SSE) hub.
 * Broadcasts live pool, drop, catalog, and item-request updates to all open browser tabs.
 */
export class SseHub {
  private clients = new Set<Response>();

  subscribe(req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(': connected\n\n');
    this.clients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        this.clients.delete(res);
        clearInterval(heartbeat);
      }
    }, 25_000);
    heartbeat.unref();

    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  }

  broadcast(type: RealtimeEventType): void {
    const payload = `data: ${JSON.stringify({
      type,
      timestamp: new Date().toISOString(),
    })}\n\n`;

    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
