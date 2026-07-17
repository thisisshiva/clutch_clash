import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishLog } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// connections.json lives at the repo root, next to the workspaces.
const CONNECTIONS_PATH = path.resolve(__dirname, '../../../connections.json');

/**
 * Loads publishing connections config. Missing/invalid file degrades to a
 * safe dry-run config with every platform disabled.
 */
export function loadConnections() {
  try {
    const data = JSON.parse(fs.readFileSync(CONNECTIONS_PATH, 'utf8'));
    return {
      dryRun: data.dryRun !== false,
      publicBaseUrl: String(data.publicBaseUrl || '').replace(/\/+$/, ''),
      youtube: data.platforms?.youtube ?? { enabled: false },
      instagram: data.platforms?.instagram ?? { enabled: false },
    };
  } catch (err) {
    publishLog.warn('Could not read connections.json', err);
    return {
      dryRun: true,
      publicBaseUrl: '',
      youtube: { enabled: false },
      instagram: { enabled: false },
    };
  }
}
