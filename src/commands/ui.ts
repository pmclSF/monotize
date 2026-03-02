import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../utils/logger.js';
import { CliExitError } from '../utils/errors.js';

interface CLIUiOptions {
  port: string;
  open: boolean;
  verbose?: boolean;
}

export async function uiCommand(options: CLIUiOptions): Promise<void> {
  const logger = createLogger(options.verbose);
  const port = parseInt(options.port, 10);

  if (isNaN(port) || port < 0 || port > 65535) {
    logger.error(`Invalid port: ${options.port}`);
    throw new CliExitError();
  }

  // Dynamic import to avoid loading express/ws when running other CLI commands
  const { createServer } = await import('../server/index.js');

  // Resolve the UI dist directory
  // After tsup bundles to dist/index.js, __dirname = <project>/dist
  // So ui/dist is at ../ui/dist relative to that
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uiDistDir = path.resolve(__dirname, '../ui/dist');

  const { server, token } = createServer({ port, staticDir: uiDistDir });

  server.on('listening', () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    const url = `http://localhost:${actualPort}`;

    logger.success(`Server running at ${url}`);
    logger.info(`Auth token: ${token}`);
    logger.info('Pass this token as Authorization: Bearer <token> for API requests');
    logger.info('Press Ctrl+C to stop');

    if (options.open) {
      const browserUrl = `${url}?token=${token}`;
      const cmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      execFile(cmd, [browserUrl], (err) => {
        if (err) logger.debug(`Failed to open browser: ${err.message}`);
      });
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Try a different port with -p.`);
    } else {
      logger.error(`Server error: ${err.message}`);
    }
    process.exit(1);
  });
}
