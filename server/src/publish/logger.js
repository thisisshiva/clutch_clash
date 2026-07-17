import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOG_DIR = path.resolve(__dirname, '../../logs');
export const LOG_FILE = path.join(LOG_DIR, 'publish.log');

function formatDetail(detail) {
  if (detail == null) return '';
  if (detail instanceof Error) {
    return `\n  ${detail.stack || detail.message}`;
  }
  if (typeof detail === 'object') {
    try {
      return `\n  ${JSON.stringify(detail, null, 2)}`;
    } catch {
      return `\n  ${String(detail)}`;
    }
  }
  return `\n  ${detail}`;
}

function write(level, message, detail) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] [${level}] ${message}${formatDetail(detail)}`;
  fs.appendFileSync(LOG_FILE, `${line}\n`);
  if (level === 'ERROR') {
    console.error('[publish]', message, detail instanceof Error ? detail : detail ?? '');
  } else if (level === 'WARN') {
    console.warn('[publish]', message, detail ?? '');
  } else {
    console.log('[publish]', message, detail ?? '');
  }
}

export const publishLog = {
  info: (message, detail) => write('INFO', message, detail),
  warn: (message, detail) => write('WARN', message, detail),
  error: (message, detail) => write('ERROR', message, detail),
};
