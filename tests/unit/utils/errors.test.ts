import { describe, it, expect } from 'vitest';
import { ActionableError, shapeError } from '../../../src/utils/errors.js';

describe('ActionableError', () => {
  it('should construct with message and hint', () => {
    const error = new ActionableError('Something failed', 'Try again');

    expect(error.message).toBe('Something failed');
    expect(error.hint).toBe('Try again');
    expect(error.name).toBe('ActionableError');
  });

  it('should be an instance of Error', () => {
    const error = new ActionableError('test', 'hint');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ActionableError);
  });

  it('should have a stack trace', () => {
    const error = new ActionableError('test', 'hint');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ActionableError');
  });
});

describe('shapeError', () => {
  it('should return the same error if already ActionableError', () => {
    const original = new ActionableError('original', 'original hint');
    const shaped = shapeError(original);

    expect(shaped).toBe(original);
    expect(shaped.hint).toBe('original hint');
  });

  it('should shape ENOENT errors with file hint', () => {
    const err = new Error('ENOENT: no such file or directory');
    const shaped = shapeError(err);

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.message).toBe('ENOENT: no such file or directory');
    expect(shaped.hint).toBe('Check that the file or directory exists');
  });

  it('should shape EACCES errors with permission hint', () => {
    const err = new Error('EACCES: permission denied');
    const shaped = shapeError(err);

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.hint).toBe(
      'Check file permissions or try running with elevated privileges'
    );
  });

  it('should shape EPERM errors with permission hint', () => {
    const err = new Error('EPERM: operation not permitted');
    const shaped = shapeError(err);

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.hint).toBe(
      'Check file permissions or try running with elevated privileges'
    );
  });

  it('should shape git-related errors with git hint', () => {
    const err = new Error('fatal: not a git repository');
    const shaped = shapeError(err);

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.hint).toBe(
      'Ensure git is installed and the repository is valid'
    );
  });

  it('should shape ENOSPC errors with disk space hint', () => {
    const err = new Error('ENOSPC: no space left on device');
    const shaped = shapeError(err);

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.hint).toBe(
      'Insufficient disk space. Free up space and try again'
    );
  });

  it('should provide a generic hint for unknown errors', () => {
    const err = new Error('Something completely unexpected happened');
    const shaped = shapeError(err);

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.hint).toBe('Check the error details above and try again');
  });

  it('should handle string errors', () => {
    const shaped = shapeError('a string error');

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.message).toBe('a string error');
    expect(shaped.hint).toBe('Check the error details above and try again');
  });

  it('should handle non-Error objects', () => {
    const shaped = shapeError({ code: 'UNKNOWN' });

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.message).toBe('[object Object]');
  });

  it('should handle null and undefined', () => {
    const shapedNull = shapeError(null);
    expect(shapedNull).toBeInstanceOf(ActionableError);
    expect(shapedNull.message).toBe('null');

    const shapedUndefined = shapeError(undefined);
    expect(shapedUndefined).toBeInstanceOf(ActionableError);
    expect(shapedUndefined.message).toBe('undefined');
  });

  it('should handle number errors', () => {
    const shaped = shapeError(42);

    expect(shaped).toBeInstanceOf(ActionableError);
    expect(shaped.message).toBe('42');
  });

  it('should match ENOENT in string errors', () => {
    const shaped = shapeError('ENOENT: file missing');

    expect(shaped.hint).toBe('Check that the file or directory exists');
  });
});
