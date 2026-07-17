import path from 'node:path';
import express from 'express';
import { startPublishJob, getJob, UPLOADS_DIR } from './publishService.js';
import { loadConnections } from './connections.js';
import { hasYouTubeCredentials } from './youtube.js';
import { publishLog } from './logger.js';

/**
 * Mounts the theater-video publishing API:
 *   GET  /api/publish/status                      connection readiness
 *   POST /api/publish/theater                     raw webm body -> starts job
 *   GET  /api/publish/jobs/:jobId                 job status for review
 *   GET  /api/publish/videos/:file                encoded video file preview
 */
export function registerPublishRoutes(app) {
  app.get('/api/publish/status', (_req, res) => {
    const conn = loadConnections();
    res.json({
      ok: true,
      dryRun: conn.dryRun,
      youtube: {
        enabled: Boolean(conn.youtube.enabled),
        configured: hasYouTubeCredentials(conn.youtube.credentials),
        outputs: ['standard-16x9', 'shorts-9x16'],
      },
      instagram: { enabled: false, skipped: true },
      gemini: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post(
    '/api/publish/theater',
    express.raw({ type: ['video/webm', 'application/octet-stream'], limit: '300mb' }),
    (req, res) => {
      try {
        if (!req.body?.length) {
          publishLog.warn('Theater upload rejected: empty body');
          return res.status(400).json({ ok: false, error: 'Empty video body' });
        }
        const trackName = String(req.query.track || 'Unknown Track').slice(0, 80);
        const filename = String(req.query.filename || 'theater.webm').slice(0, 120);
        const { jobId } = startPublishJob({ videoBuffer: req.body, filename, trackName });
        res.json({ ok: true, jobId });
      } catch (err) {
        publishLog.error('Theater upload handler failed', err);
        res.status(500).json({ ok: false, error: err.message });
      }
    },
  );

  app.get('/api/publish/jobs/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
    res.json({ ok: true, job });
  });

  app.get('/api/publish/videos/:file', (req, res) => {
    const file = path.basename(req.params.file);
    res.sendFile(path.join(UPLOADS_DIR, file), (err) => {
      if (err && !res.headersSent) {
        publishLog.warn(`Video file not found: ${file}`, err);
        res.status(404).end();
      }
    });
  });
}
