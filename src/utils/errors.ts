/**
 * An error with an actionable hint for the user.
 */
export class ActionableError extends Error {
  hint: string;

  constructor(message: string, hint: string) {
    super(message);
    this.name = 'ActionableError';
    this.hint = hint;
  }
}

/**
 * Shape any error into an ActionableError with a helpful hint.
 */
export function shapeError(err: unknown): ActionableError {
  if (err instanceof ActionableError) return err;

  const message = err instanceof Error ? err.message : String(err);

  // Pattern match common errors to provide hints
  if (message.includes('ENOENT')) {
    return new ActionableError(message, 'Check that the file or directory exists');
  }
  if (message.includes('EACCES') || message.includes('EPERM')) {
    return new ActionableError(
      message,
      'Check file permissions or try running with elevated privileges'
    );
  }
  if (message.includes('git')) {
    return new ActionableError(
      message,
      'Ensure git is installed and the repository is valid'
    );
  }
  if (message.includes('ENOSPC')) {
    return new ActionableError(
      message,
      'Insufficient disk space. Free up space and try again'
    );
  }

  return new ActionableError(message, 'Check the error details above and try again');
}
