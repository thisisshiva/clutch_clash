/**
 * Instagram Reels upload via Graph API.
 * Prefers video_url when a public HTTPS URL is available (more reliable than rupload).
 * Falls back to resumable rupload for local-only setups.
 */

import https from 'node:https';
import { URL } from 'node:url';

const GRAPH_HOST = 'graph.facebook.com';
const GRAPH_VER = 'v21.0';

export function hasInstagramCredentials(creds = {}) {
  return Boolean(creds?.accessToken && creds?.instagramBusinessAccountId);
}

/**
 * @param {object} credentials
 * @param {Buffer} videoBuffer
 * @param {string} caption
 * @param {{ videoUrl?: string }} [opts] If videoUrl is set, Meta fetches it (skips rupload).
 */
export async function uploadReel(credentials, videoBuffer, caption, opts = {}) {
  const { accessToken, instagramBusinessAccountId: igUserId } = credentials;
  if (!hasInstagramCredentials(credentials)) {
    throw new Error('Instagram credentials incomplete');
  }

  if (opts.videoUrl) {
    return uploadReelFromUrl(igUserId, accessToken, opts.videoUrl, caption);
  }

  if (!videoBuffer?.length) throw new Error('Empty Instagram video buffer');

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await uploadReelResumable(igUserId, accessToken, videoBuffer, caption);
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '');
      const retriable = /rupload failed|ProcessingFailedError|unknown upload error/i.test(msg);
      if (!retriable || attempt === 2) break;
      await sleep(3000);
    }
  }
  throw lastError;
}

async function uploadReelFromUrl(igUserId, accessToken, videoUrl, caption) {
  const createBody = await graphPostForm(`/${GRAPH_VER}/${igUserId}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    share_to_feed: 'true',
    caption: String(caption || '').slice(0, 2200),
    access_token: accessToken,
  });
  if (!createBody.id) {
    throw new Error(`Instagram container create failed: ${JSON.stringify(createBody)}`);
  }

  const containerId = createBody.id;
  await waitUntilFinished(containerId, accessToken);

  const publishBody = await graphPostForm(`/${GRAPH_VER}/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  if (!publishBody.id) {
    throw new Error(`Instagram publish failed: ${JSON.stringify(publishBody)}`);
  }

  let permalink;
  try {
    const media = await graphGet(`/${GRAPH_VER}/${publishBody.id}`, {
      fields: 'permalink',
      access_token: accessToken,
    });
    permalink = media.permalink;
  } catch {
    // optional
  }

  return { containerId, mediaId: publishBody.id, permalink, method: 'video_url' };
}

async function uploadReelResumable(igUserId, accessToken, videoBuffer, caption) {
  const createBody = await graphPostForm(`/${GRAPH_VER}/${igUserId}/media`, {
    media_type: 'REELS',
    upload_type: 'resumable',
    share_to_feed: 'true',
    caption: String(caption || '').slice(0, 2200),
    access_token: accessToken,
  });
  if (!createBody.id) {
    throw new Error(`Instagram container create failed: ${JSON.stringify(createBody)}`);
  }

  const containerId = createBody.id;
  const uploadUri = String(createBody.uri || '').trim()
    || `https://rupload.facebook.com/ig-api-upload/${GRAPH_VER}/${containerId}`;

  const uploadRes = await ruploadBinary(uploadUri, accessToken, videoBuffer);
  if (uploadRes.statusCode < 200 || uploadRes.statusCode >= 300) {
    throw new Error(
      `Instagram rupload failed (${uploadRes.statusCode}): ${uploadRes.body.slice(0, 500)}`,
    );
  }

  await waitUntilFinished(containerId, accessToken);

  const publishBody = await graphPostForm(`/${GRAPH_VER}/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  if (!publishBody.id) {
    throw new Error(`Instagram publish failed: ${JSON.stringify(publishBody)}`);
  }

  let permalink;
  try {
    const media = await graphGet(`/${GRAPH_VER}/${publishBody.id}`, {
      fields: 'permalink',
      access_token: accessToken,
    });
    permalink = media.permalink;
  } catch {
    // optional
  }

  return { containerId, mediaId: publishBody.id, permalink, method: 'resumable' };
}

function ruploadBinary(uploadUri, accessToken, videoBuffer) {
  const url = new URL(uploadUri);
  const body = Buffer.isBuffer(videoBuffer) ? videoBuffer : Buffer.from(videoBuffer);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          Authorization: `OAuth ${accessToken}`,
          offset: '0',
          file_size: String(body.length),
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(body.length),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(300_000, () => {
      req.destroy(new Error('Instagram rupload timed out'));
    });
    req.write(body);
    req.end();
  });
}

function graphPostForm(pathname, fields) {
  const body = new URLSearchParams(fields).toString();
  return httpsJson({
    method: 'POST',
    hostname: GRAPH_HOST,
    path: pathname,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(body)),
    },
    body,
  });
}

function graphGet(pathname, query) {
  const qs = new URLSearchParams(query).toString();
  return httpsJson({
    method: 'GET',
    hostname: GRAPH_HOST,
    path: `${pathname}?${qs}`,
  });
}

function httpsJson({ method, hostname, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method, hostname, path, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            reject(new Error(`Instagram Graph non-JSON (${res.statusCode}): ${text.slice(0, 300)}`));
            return;
          }
          if (res.statusCode >= 400 || json.error) {
            reject(new Error(`Instagram Graph ${res.statusCode}: ${JSON.stringify(json)}`));
            return;
          }
          resolve(json);
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitUntilFinished(containerId, accessToken, {
  timeoutMs = 300_000,
  intervalMs = 4000,
} = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await graphGet(`/${GRAPH_VER}/${containerId}`, {
      fields: 'status_code,status',
      access_token: accessToken,
    });
    const code = String(body.status_code || '').toUpperCase();
    if (code === 'FINISHED') return body;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`Instagram container ${code}: ${JSON.stringify(body)}`);
    }
    await sleep(intervalMs);
  }
  throw new Error('Instagram container timed out waiting for FINISHED');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
