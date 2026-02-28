import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WsHub } from '../../../src/server/ws/hub.js';
import type { WsEvent } from '../../../src/server/types.js';
import { EventEmitter } from 'node:events';

// Minimal mock WebSocket that satisfies WsHub's needs
function createMockWs() {
  const emitter = new EventEmitter();
  const sent: string[] = [];
  return {
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    send: (data: string) => sent.push(data),
    readyState: 1,
    OPEN: 1,
    sent,
  } as unknown as import('ws').WebSocket;
}

describe('WsHub', () => {
  let hub: WsHub;

  beforeEach(() => {
    hub = new WsHub();
  });

  afterEach(() => {
    hub.destroy();
  });

  it('broadcasts to subscribed clients only', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    hub.register(ws1);
    hub.register(ws2);

    hub.createOperation('op1');

    // Subscribe ws1 to op1
    ws1.emit('message', JSON.stringify({ type: 'subscribe', opId: 'op1' }));

    // Broadcast
    const event: WsEvent = { type: 'log', level: 'info', message: 'hello', opId: 'op1' };
    hub.broadcast('op1', event);

    // ws1 got the event (the subscribe replay + broadcast)
    expect((ws1 as any).sent.length).toBeGreaterThanOrEqual(1);
    // ws2 did not
    expect((ws2 as any).sent.length).toBe(0);
  });

  it('buffers events for replay', () => {
    hub.createOperation('op1');
    hub.broadcast('op1', { type: 'log', level: 'info', message: 'first', opId: 'op1' });
    hub.broadcast('op1', { type: 'log', level: 'info', message: 'second', opId: 'op1' });

    const events = hub.getEvents('op1');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ message: 'first' });
    expect(events[1]).toMatchObject({ message: 'second' });
  });

  it('replays buffered events to late subscribers', () => {
    hub.createOperation('op1');
    hub.broadcast('op1', { type: 'log', level: 'info', message: 'buffered', opId: 'op1' });

    const ws = createMockWs();
    hub.register(ws);

    // Subscribe after broadcast
    ws.emit('message', JSON.stringify({ type: 'subscribe', opId: 'op1' }));

    // Should receive the buffered event
    expect((ws as any).sent.length).toBe(1);
    expect(JSON.parse((ws as any).sent[0]).message).toBe('buffered');
  });

  it('cancel triggers abort on correct operation', () => {
    const controller = hub.createOperation('op1');
    expect(controller.signal.aborted).toBe(false);

    hub.cancel('op1');
    expect(controller.signal.aborted).toBe(true);
  });

  it('cancel via WebSocket message', () => {
    const controller = hub.createOperation('op1');
    const ws = createMockWs();
    hub.register(ws);

    ws.emit('message', JSON.stringify({ type: 'cancel', opId: 'op1' }));
    expect(controller.signal.aborted).toBe(true);
  });

  it('isDone returns true when done event present', () => {
    hub.createOperation('op1');
    expect(hub.isDone('op1')).toBe(false);

    hub.broadcast('op1', { type: 'done', opId: 'op1' });
    expect(hub.isDone('op1')).toBe(true);
  });

  it('returns empty events for unknown operation', () => {
    expect(hub.getEvents('unknown')).toEqual([]);
  });

  it('handles close event by removing connection', () => {
    const ws = createMockWs();
    hub.register(ws);
    hub.createOperation('op1');

    ws.emit('message', JSON.stringify({ type: 'subscribe', opId: 'op1' }));
    ws.emit('close');

    // After close, broadcast should not fail
    hub.broadcast('op1', { type: 'log', level: 'info', message: 'after close', opId: 'op1' });
    // ws should not receive new messages after close
    // (it received the subscribe replay only)
    expect((ws as any).sent.length).toBe(0); // 0 because there were no buffered events at subscribe time
  });

  it('scheduleCleanup removes operation after delay', async () => {
    hub.createOperation('op1');
    hub.broadcast('op1', { type: 'log', level: 'info', message: 'test', opId: 'op1' });

    hub.scheduleCleanup('op1', 50); // 50ms

    // Still present
    expect(hub.getEvents('op1')).toHaveLength(1);

    // Wait for cleanup
    await new Promise((r) => setTimeout(r, 100));
    expect(hub.getEvents('op1')).toHaveLength(0);
  });
});
