import type { Logger } from '../../types/index.js';
import type { WsHub } from './hub.js';

/**
 * Create a Logger that broadcasts messages over WebSocket via the hub.
 */
export function createWsLogger(hub: WsHub, opId: string): Logger {
  const log = (level: 'info' | 'success' | 'warn' | 'error' | 'debug', message: string) => {
    hub.broadcast(opId, { type: 'log', level, message, opId });
  };

  return {
    info: (message: string) => log('info', message),
    success: (message: string) => log('success', message),
    warn: (message: string) => log('warn', message),
    error: (message: string) => log('error', message),
    debug: (message: string) => log('debug', message),
    log: (message: string) => log('info', message),
  };
}
