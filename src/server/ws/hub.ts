import type { WebSocket } from 'ws';
import type { WsEvent, WsClientMessage } from '../types.js';

/**
 * Manages WebSocket connections, operation subscriptions, and event broadcasting.
 */
export class WsHub {
  /** Which opIds each client is subscribed to */
  private connections = new Map<WebSocket, Set<string>>();

  /** In-flight operations: abort controller + buffered events */
  private operations = new Map<
    string,
    { controller: AbortController; events: WsEvent[] }
  >();

  /** Cleanup timers for completed operations */
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Register a new WebSocket connection and wire up message handling.
   */
  register(ws: WebSocket): void {
    this.connections.set(ws, new Set());

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as WsClientMessage;
        if (msg.type === 'subscribe' && typeof msg.opId === 'string') {
          const subs = this.connections.get(ws);
          if (subs) subs.add(msg.opId);

          // Replay buffered events
          const op = this.operations.get(msg.opId);
          if (op) {
            for (const event of op.events) {
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify(event));
              }
            }
          }
        } else if (msg.type === 'cancel' && typeof msg.opId === 'string') {
          this.cancel(msg.opId);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.connections.delete(ws);
    });
  }

  /**
   * Create a new operation and return its AbortController.
   */
  createOperation(opId: string): AbortController {
    const controller = new AbortController();
    this.operations.set(opId, { controller, events: [] });
    return controller;
  }

  /**
   * Broadcast an event to all clients subscribed to its opId, and buffer it.
   */
  broadcast(opId: string, event: WsEvent): void {
    const op = this.operations.get(opId);
    if (op) {
      op.events.push(event);
    }

    for (const [ws, subs] of this.connections) {
      if (subs.has(opId) && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    }
  }

  /**
   * Get buffered events for an operation (for status endpoint replay).
   */
  getEvents(opId: string): WsEvent[] {
    return this.operations.get(opId)?.events ?? [];
  }

  /**
   * Check whether an operation has completed (received a 'done' event).
   */
  isDone(opId: string): boolean {
    const events = this.getEvents(opId);
    return events.some((e) => e.type === 'done');
  }

  /**
   * Cancel an in-flight operation by aborting its controller.
   */
  cancel(opId: string): void {
    const op = this.operations.get(opId);
    if (op) {
      op.controller.abort();
    }
  }

  /**
   * Schedule cleanup of a completed operation after a delay.
   */
  scheduleCleanup(opId: string, delayMs = 5 * 60 * 1000): void {
    const existing = this.cleanupTimers.get(opId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.operations.delete(opId);
      this.cleanupTimers.delete(opId);
    }, delayMs);

    // Prevent timer from keeping the process alive
    if (timer.unref) timer.unref();
    this.cleanupTimers.set(opId, timer);
  }

  /**
   * Tear down all connections and timers.
   */
  destroy(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.operations.clear();
    this.connections.clear();
  }
}
