import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CliExitError } from '../../../src/utils/errors.js';

const createServerMock = vi.hoisted(() => vi.fn());
const createLoggerMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/server/index.js', () => ({
  createServer: createServerMock,
}));

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: createLoggerMock,
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { uiCommand } from '../../../src/commands/ui.js';

class MockServer extends EventEmitter {
  address() {
    return { port: 3847 };
  }
}

describe('uiCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
    });
  });

  it('throws CliExitError for invalid port input', async () => {
    await expect(uiCommand({ port: 'invalid', open: false, verbose: false })).rejects.toBeInstanceOf(CliExitError);
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it('rejects with CliExitError when server emits EADDRINUSE', async () => {
    const server = new MockServer();
    createServerMock.mockReturnValue({ server, token: 'token-abc' });

    const promise = uiCommand({ port: '3847', open: false, verbose: false });
    setImmediate(() => {
      const err = Object.assign(new Error('port in use'), { code: 'EADDRINUSE' });
      server.emit('error', err);
    });

    await expect(promise).rejects.toBeInstanceOf(CliExitError);
  });

  it('resolves when server closes cleanly', async () => {
    const server = new MockServer();
    createServerMock.mockReturnValue({ server, token: 'token-abc' });

    const promise = uiCommand({ port: '3847', open: false, verbose: false });
    setImmediate(() => {
      server.emit('listening');
      server.emit('close');
    });

    await expect(promise).resolves.toBeUndefined();
  });
});
