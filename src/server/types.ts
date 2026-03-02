import type { Logger } from '../types/index.js';

/**
 * Server → Client WebSocket event
 */
export type WsEvent =
  | { type: 'log'; level: 'info' | 'success' | 'warn' | 'error' | 'debug'; message: string; opId: string }
  | { type: 'result'; data: unknown; opId: string }
  | { type: 'error'; message: string; opId: string }
  | { type: 'done'; opId: string };

/**
 * Client → Server WebSocket message
 */
export type WsClientMessage =
  | { type: 'subscribe'; opId: string }
  | { type: 'cancel'; opId: string };

/**
 * Options for creating the HTTP server
 */
export interface ServerOptions {
  /** Port to listen on (0 for OS-assigned) */
  port: number;
  /** Interface to bind to. Defaults to loopback for local-only access. */
  host?: string;
  /** Directory containing pre-built UI assets to serve statically */
  staticDir?: string;
}

/**
 * Logger type re-exported for convenience
 */
export type { Logger };
