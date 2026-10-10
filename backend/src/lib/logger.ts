// Tiny structured logger. Technical details go to the server log only — never to API clients.
import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: unknown) {
  if (env.isTest && level !== 'error') return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (meta === undefined) out(line);
  else out(line, meta instanceof Error ? (meta.stack ?? meta.message) : meta);
}

export const logger = {
  debug: (msg: string, meta?: unknown) => !env.isProduction && write('debug', msg, meta),
  info: (msg: string, meta?: unknown) => write('info', msg, meta),
  warn: (msg: string, meta?: unknown) => write('warn', msg, meta),
  error: (msg: string, meta?: unknown) => write('error', msg, meta),
};
