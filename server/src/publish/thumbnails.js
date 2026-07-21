import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND_DIR = path.resolve(__dirname, '../../../brand');
const THUMB_DIR = path.join(BRAND_DIR, 'thumbnails');
const FALLBACK = path.join(BRAND_DIR, 'thumbnail-template-1280x720.png');

/** Map theater track names / ids → thumbnail file under brand/thumbnails. */
const TRACK_THUMBNAILS = [
  { match: /chapman/i, file: 'chapmans-peak.png' },
  { match: /frozen|road-to-heaven-snow|heaven.?snow/i, file: 'frozen-heaven.png' },
  { match: /north.?path|canada/i, file: 'north-path.png' },
  { match: /sakura|fuji.?day|mt-fuji-day/i, file: 'mt-fuji-sakura.png' },
  { match: /fuji.?dawn|mt-fuji-dawn/i, file: 'mt-fuji-dawn.png' },
  { match: /fuji.?night|mt-fuji-night/i, file: 'mt-fuji-night.png' },
  { match: /fuji.?autumn|mt-fuji-autumn/i, file: 'mt-fuji-autumn.png' },
  { match: /black.?hole/i, file: 'black-hole.png' },
  { match: /endless/i, file: 'road-to-endless.png' },
  // After Frozen Heaven so "road-to-heaven-snow" never lands here.
  { match: /road to heaven|road-to-heaven/i, file: 'road-to-heaven.png' },
];

/**
 * Picks the best YouTube thumbnail for a track. Falls back to the brand template.
 * @param {string} [trackName]
 * @returns {Buffer|null}
 */
export function loadThumbnailForTrack(trackName = '') {
  const key = String(trackName || '');
  for (const entry of TRACK_THUMBNAILS) {
    if (!entry.match.test(key)) continue;
    const full = path.join(THUMB_DIR, entry.file);
    if (fs.existsSync(full)) {
      try {
        return fs.readFileSync(full);
      } catch {
        break;
      }
    }
  }
  try {
    if (fs.existsSync(FALLBACK)) return fs.readFileSync(FALLBACK);
  } catch {
    return null;
  }
  return null;
}

export function thumbnailFileNameForTrack(trackName = '') {
  const key = String(trackName || '');
  for (const entry of TRACK_THUMBNAILS) {
    if (entry.match.test(key) && fs.existsSync(path.join(THUMB_DIR, entry.file))) {
      return entry.file;
    }
  }
  return path.basename(FALLBACK);
}
