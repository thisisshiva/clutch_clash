import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConnections } from './connections.js';
import { generateVideoMetadata } from './gemini.js';
import { uploadToYouTube, hasYouTubeCredentials } from './youtube.js';
import { convertToMp4, mp4FileName } from './convert.js';
import { publishLog } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const JOBS_DIR = path.resolve(__dirname, '../../jobs');
const BRAND_THUMBNAIL_PATH = path.resolve(__dirname, '../../../brand/thumbnail-template-1280x720.png');

const jobs = new Map();

function persistJob(job) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  fs.writeFileSync(path.join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2));
}

function loadPersistedJobs() {
  try {
    if (!fs.existsSync(JOBS_DIR)) return;
    for (const file of fs.readdirSync(JOBS_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const job = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, file), 'utf8'));
        if (job?.id) jobs.set(job.id, job);
      } catch {
        // ignore corrupt job files
      }
    }
  } catch (err) {
    publishLog.warn('Could not load persisted jobs', err);
  }
}

loadPersistedJobs();

export function getJob(jobId) {
  return jobs.get(jobId) ?? null;
}

/**
 * Saves the recording, generates metadata, then uploads two YouTube variants:
 * a standard landscape video and a vertical Shorts video. Both are private.
 * The landscape upload also gets a Slow Lane custom thumbnail when available.
 * @returns {{ jobId: string }}
 */
export function startPublishJob({ videoBuffer, filename, trackName }) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const jobId = crypto.randomUUID();
  const safeName = `${jobId}-${String(filename || 'theater.webm').replace(/[^\w.-]+/g, '_')}`;
  const filePath = path.join(UPLOADS_DIR, safeName);
  fs.writeFileSync(filePath, videoBuffer);

  const job = {
    id: jobId,
    trackName,
    fileName: safeName,
    youtubeMp4FileName: null,
    shortsMp4FileName: null,
    thumbnailFileName: null,
    createdAt: Date.now(),
    status: 'processing',
    dryRun: false,
    metadata: null,
    youtube: { status: 'pending' },
    instagram: { status: 'skipped', reason: 'disabled; publishing YouTube only' },
    error: null,
  };
  jobs.set(jobId, job);
  persistJob(job);
  publishLog.info('Job started', {
    jobId,
    trackName,
    filename: safeName,
    bytes: videoBuffer.length,
  });

  runJob(job, filePath).catch((err) => {
    job.status = 'failed';
    job.error = err.message;
    persistJob(job);
    publishLog.error(`Job ${jobId} failed`, err);
  });

  return { jobId };
}

async function runJob(job, webmPath) {
  const conn = loadConnections();
  job.dryRun = conn.dryRun;
  persistJob(job);

  job.metadata = await generateVideoMetadata({ trackName: job.trackName });
  persistJob(job);

  const youtubeReady = conn.youtube.enabled && hasYouTubeCredentials(conn.youtube.credentials);
  let youtubeMp4Buffer;
  let shortsMp4Buffer;

  if (youtubeReady && !conn.dryRun) {
    try {
      const youtubeName = mp4FileName(job.fileName, 'youtube');
      const youtubeOut = path.join(UPLOADS_DIR, youtubeName);
      const youtube = await convertToMp4(webmPath, youtubeOut, 'youtube');
      youtubeMp4Buffer = youtube.buffer;
      job.youtubeMp4FileName = youtubeName;

      const shortsName = mp4FileName(job.fileName, 'shorts');
      const shortsOut = path.join(UPLOADS_DIR, shortsName);
      const shorts = await convertToMp4(webmPath, shortsOut, 'shorts');
      shortsMp4Buffer = shorts.buffer;
      job.shortsMp4FileName = shortsName;

      persistJob(job);
      publishLog.info(`Job ${job.id} converted to YouTube MP4 variants`, {
        youtubeMp4FileName: job.youtubeMp4FileName,
        youtubeBytes: youtubeMp4Buffer.length,
        shortsMp4FileName: job.shortsMp4FileName,
        shortsBytes: shortsMp4Buffer.length,
      });
    } catch (err) {
      job.status = 'failed';
      job.error = `Video conversion failed: ${err.message}`;
      persistJob(job);
      publishLog.error(`Job ${job.id} conversion failed`, err);
      return;
    }
  }

  // --- YouTube: private standard upload + private Shorts upload ---
  if (!conn.youtube.enabled) {
    job.youtube = { status: 'skipped', reason: 'disabled in connections.json' };
  } else if (!hasYouTubeCredentials(conn.youtube.credentials)) {
    job.youtube = {
      status: 'skipped',
      reason: 'YouTube credentials incomplete - run: npm run youtube-oauth',
    };
  } else if (conn.dryRun) {
    job.youtube = {
      status: 'dry-run',
      wouldUpload: {
        standard: {
          title: job.metadata.title,
          aspect: '16:9',
          privacy: 'private',
          thumbnail: path.basename(BRAND_THUMBNAIL_PATH),
        },
        shorts: {
          title: `${job.metadata.title} #Shorts`,
          aspect: '9:16',
          privacy: 'private',
        },
      },
    };
  } else {
    try {
      const thumbnailBuffer = loadThumbnailBuffer();
      if (thumbnailBuffer) job.thumbnailFileName = path.basename(BRAND_THUMBNAIL_PATH);

      const standard = await uploadToYouTube(conn.youtube.credentials, youtubeMp4Buffer, job.metadata, {
        contentType: 'video/mp4',
        thumbnailBuffer,
        thumbnailContentType: 'image/png',
      });
      publishLog.info(`Job ${job.id} YouTube standard uploaded (private)`, standard);

      const shortsMetadata = makeShortsMetadata(job.metadata);
      const shorts = await uploadToYouTube(conn.youtube.credentials, shortsMp4Buffer, shortsMetadata, {
        contentType: 'video/mp4',
      });
      publishLog.info(`Job ${job.id} YouTube Shorts uploaded (private)`, shorts);

      job.youtube = { status: 'uploaded-private', standard, shorts };
    } catch (err) {
      job.youtube = { status: 'error', error: err.message };
      publishLog.error(`Job ${job.id} YouTube upload failed`, err);
    }
  }

  job.status = 'completed';
  persistJob(job);
  publishLog.info(`Job ${job.id} completed`, { youtube: job.youtube?.status });
}

function makeShortsMetadata(metadata) {
  const title = metadata.title.includes('#Shorts')
    ? metadata.title
    : `${metadata.title.replace(/\s+#Shorts\s*$/i, '')} #Shorts`;
  const description = metadata.description.includes('#Shorts')
    ? metadata.description
    : `#Shorts\n\n${metadata.description}`;
  const tags = Array.from(new Set([...(metadata.tags || []), 'shorts', 'youtube shorts', 'slow lane']));
  return { ...metadata, title: title.slice(0, 100), description, tags };
}

function loadThumbnailBuffer() {
  try {
    if (!fs.existsSync(BRAND_THUMBNAIL_PATH)) return null;
    return fs.readFileSync(BRAND_THUMBNAIL_PATH);
  } catch (err) {
    publishLog.warn('Could not read YouTube thumbnail template', err);
    return null;
  }
}
