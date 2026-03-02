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
  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      const url = `http://localhost:${actualPort}`;

      logger.success(`Server running at ${url}`);
      logger.info(`Auth token: ${token}`);
      logger.info('Pass this token as Authorization: Bearer <token> for API requests');
      logger.info('Press Ctrl+C to stop');

      if (options.open) {
        const browserUrl = `${url}?token=${token}`;
        const { command, args } = process.platform === 'darwin'
          ? { command: 'open', args: [browserUrl] }
          : process.platform === 'win32'
            ? { command: 'cmd', args: ['/c', 'start', '', browserUrl] }
            : { command: 'xdg-open', args: [browserUrl] };
        execFile(command, args, (err) => {
          if (err) logger.debug(`Failed to open browser: ${err.message}`);
        });
      }
    };

    const onError = (err: NodeJS.ErrnoException) => {
      cleanup();
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use. Try a different port with -p.`);
      } else {
        logger.error(`Server error: ${err.message}`);
      }
      reject(new CliExitError());
    };

    const onClose = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      server.off('listening', onListening);
      server.off('error', onError);
      server.off('close', onClose);
    };

    server.on('listening', onListening);
    server.on('error', onError);
    server.on('close', onClose);
  });
}
