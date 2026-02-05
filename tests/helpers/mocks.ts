import { vi } from 'vitest';
import type { Logger } from '../../src/types/index.js';

/**
 * Create a mock Logger for testing
 */
export function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  };
}

/**
 * Mock simple-git responses
 */
export interface MockGitOptions {
  /** Whether clone should succeed */
  cloneSuccess?: boolean;
  /** Error message for clone failure */
  cloneError?: string;
  /** Error code (e.g., 'ENOTFOUND', 'ECONNREFUSED') */
  cloneErrorCode?: string;
  /** Delay before clone completes (ms) */
  cloneDelay?: number;
}

/**
 * Create a mock for simple-git
 */
export function createMockSimpleGit(options: MockGitOptions = {}) {
  const {
    cloneSuccess = true,
    cloneError = 'Clone failed',
    cloneErrorCode,
    cloneDelay = 0,
  } = options;

  const mockGit = {
    clone: vi.fn().mockImplementation(async () => {
      if (cloneDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, cloneDelay));
      }

      if (!cloneSuccess) {
        const error = new Error(cloneError) as Error & { code?: string };
        if (cloneErrorCode) {
          error.code = cloneErrorCode;
        }
        throw error;
      }

      return mockGit;
    }),
  };

  return vi.fn(() => mockGit);
}

/**
 * Mock @inquirer/prompts responses
 */
export interface MockPromptOptions {
  /** Response for select prompts */
  selectResponse?: string;
  /** Response for confirm prompts */
  confirmResponse?: boolean;
  /** Response for input prompts */
  inputResponse?: string;
  /** Whether to simulate Ctrl+C (user abort) */
  simulateAbort?: boolean;
  /** Sequence of responses for multiple prompts */
  responseSequence?: Array<string | boolean>;
}

/**
 * Create mocks for @inquirer/prompts
 */
export function createMockPrompts(options: MockPromptOptions = {}) {
  const {
    selectResponse = 'highest',
    confirmResponse = true,
    inputResponse = 'test-input',
    simulateAbort = false,
    responseSequence = [],
  } = options;

  let sequenceIndex = 0;

  const getNextResponse = (defaultResponse: string | boolean) => {
    if (responseSequence.length > sequenceIndex) {
      return responseSequence[sequenceIndex++];
    }
    return defaultResponse;
  };

  const createAbortError = () => {
    const error = new Error('User cancelled');
    (error as Error & { code: string }).code = 'ERR_USE_AFTER_CLOSE';
    return error;
  };

  return {
    select: vi.fn().mockImplementation(async () => {
      if (simulateAbort) throw createAbortError();
      return getNextResponse(selectResponse);
    }),
    confirm: vi.fn().mockImplementation(async () => {
      if (simulateAbort) throw createAbortError();
      return getNextResponse(confirmResponse);
    }),
    input: vi.fn().mockImplementation(async () => {
      if (simulateAbort) throw createAbortError();
      return getNextResponse(inputResponse);
    }),
  };
}

/**
 * Mock fs-extra error scenarios
 */
export interface MockFsErrorOptions {
  /** Error to throw on specific operations */
  errors?: {
    readJson?: Error;
    writeJson?: Error;
    copy?: Error;
    ensureDir?: Error;
    remove?: Error;
    pathExists?: Error;
    readFile?: Error;
    writeFile?: Error;
  };
  /** Paths that should throw specific errors */
  pathErrors?: Map<string, Error>;
}

/**
 * Create mock fs-extra functions that can simulate errors
 */
export function createMockFs(options: MockFsErrorOptions = {}) {
  const { errors = {}, pathErrors = new Map() } = options;

  const checkPathError = (path: string) => {
    const error = pathErrors.get(path);
    if (error) throw error;
  };

  return {
    readJson: vi.fn().mockImplementation(async (path: string) => {
      checkPathError(path);
      if (errors.readJson) throw errors.readJson;
      return {};
    }),
    writeJson: vi.fn().mockImplementation(async (path: string) => {
      checkPathError(path);
      if (errors.writeJson) throw errors.writeJson;
    }),
    copy: vi.fn().mockImplementation(async (src: string, dest: string) => {
      checkPathError(src);
      checkPathError(dest);
      if (errors.copy) throw errors.copy;
    }),
    ensureDir: vi.fn().mockImplementation(async (path: string) => {
      checkPathError(path);
      if (errors.ensureDir) throw errors.ensureDir;
    }),
    remove: vi.fn().mockImplementation(async (path: string) => {
      checkPathError(path);
      if (errors.remove) throw errors.remove;
    }),
    pathExists: vi.fn().mockImplementation(async (path: string) => {
      checkPathError(path);
      if (errors.pathExists) throw errors.pathExists;
      return true;
    }),
    readFile: vi.fn().mockImplementation(async (path: string) => {
      checkPathError(path);
      if (errors.readFile) throw errors.readFile;
      return '';
    }),
    writeFile: vi.fn().mockImplementation(async (path: string) => {
      checkPathError(path);
      if (errors.writeFile) throw errors.writeFile;
    }),
  };
}

/**
 * Create common error types for testing
 */
export const mockErrors = {
  /** Permission denied error */
  permissionDenied: () => {
    const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    return error;
  },

  /** File/directory not found error */
  notFound: (path = '/not/found') => {
    const error = new Error(`ENOENT: no such file or directory, '${path}'`) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    return error;
  },

  /** Disk full error */
  diskFull: () => {
    const error = new Error('ENOSPC: no space left on device') as NodeJS.ErrnoException;
    error.code = 'ENOSPC';
    return error;
  },

  /** Path too long error */
  pathTooLong: () => {
    const error = new Error('ENAMETOOLONG: name too long') as NodeJS.ErrnoException;
    error.code = 'ENAMETOOLONG';
    return error;
  },

  /** Network error */
  networkError: (code = 'ENOTFOUND') => {
    const error = new Error(`${code}: network error`) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  },

  /** Connection refused */
  connectionRefused: () => {
    const error = new Error('ECONNREFUSED: connection refused') as NodeJS.ErrnoException;
    error.code = 'ECONNREFUSED';
    return error;
  },

  /** Timeout error */
  timeout: () => {
    const error = new Error('ETIMEDOUT: operation timed out') as NodeJS.ErrnoException;
    error.code = 'ETIMEDOUT';
    return error;
  },

  /** Git authentication error */
  gitAuthError: () => {
    const error = new Error('Authentication failed for repository') as Error & { code?: string };
    error.code = 'AUTHENTICATION_FAILED';
    return error;
  },

  /** Git repository not found */
  gitRepoNotFound: () => {
    const error = new Error('Repository not found') as Error & { code?: string };
    error.code = 'REPOSITORY_NOT_FOUND';
    return error;
  },

  /** Invalid JSON error */
  invalidJson: () => {
    return new SyntaxError('Unexpected token } in JSON at position 10');
  },

  /** File busy/locked error */
  fileBusy: () => {
    const error = new Error('EBUSY: resource busy or locked') as NodeJS.ErrnoException;
    error.code = 'EBUSY';
    return error;
  },

  /** Read-only file system */
  readOnlyFs: () => {
    const error = new Error('EROFS: read-only file system') as NodeJS.ErrnoException;
    error.code = 'EROFS';
    return error;
  },
};

/**
 * Create a mock process for testing signal handling
 */
export function createMockProcess() {
  const listeners = new Map<string, Function[]>();

  return {
    on: vi.fn((event: string, handler: Function) => {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
    }),
    exit: vi.fn(),
    emit: (event: string, ...args: unknown[]) => {
      const handlers = listeners.get(event) || [];
      for (const handler of handlers) {
        handler(...args);
      }
    },
    getListeners: (event: string) => listeners.get(event) || [],
    removeAllListeners: vi.fn((event?: string) => {
      if (event) {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
    }),
  };
}

/**
 * Create a mock child_process.execSync for testing pnpm install
 */
export interface MockExecSyncOptions {
  /** Whether command should succeed */
  success?: boolean;
  /** Output to return on success */
  output?: string;
  /** Error to throw on failure */
  error?: Error;
  /** Commands that should fail */
  failCommands?: string[];
}

export function createMockExecSync(options: MockExecSyncOptions = {}) {
  const { success = true, output = '', error, failCommands = [] } = options;

  return vi.fn().mockImplementation((command: string) => {
    if (failCommands.some((fc) => command.includes(fc))) {
      throw error || new Error(`Command failed: ${command}`);
    }

    if (!success) {
      throw error || new Error(`Command failed: ${command}`);
    }

    return output;
  });
}

/**
 * Wait for all pending promises to resolve
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Create a deferred promise for testing async operations
 */
export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
