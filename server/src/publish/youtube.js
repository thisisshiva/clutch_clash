/**
 * Uploads a video to YouTube as PRIVATE using OAuth2 refresh-token credentials
 * from connections.json. Uses the resumable upload protocol (single PUT).
 */

export function hasYouTubeCredentials(credentials = {}) {
  return Boolean(credentials.clientId && credentials.clientSecret && credentials.refreshToken);
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`YouTube token refresh failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

/**
 * @param {object} credentials { clientId, clientSecret, refreshToken }
 * @param {Buffer} videoBuffer
 * @param {{ title: string, description: string, tags: string[] }} metadata
 * @param {{ contentType?: string, thumbnailBuffer?: Buffer, thumbnailContentType?: string }} [opts]
 * @returns {Promise<{ videoId: string, url: string, thumbnail?: object }>}
 */
export async function uploadToYouTube(credentials, videoBuffer, metadata, opts = {}) {
  if (!hasYouTubeCredentials(credentials)) {
    throw new Error('YouTube credentials incomplete in connections.json');
  }
  const accessToken = await getAccessToken(credentials);
  const contentType = opts.contentType || 'video/mp4';

  const body = {
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: '20', // Gaming
    },
    status: {
      privacyStatus: 'private', // draft-like: owner reviews, then publishes
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(videoBuffer.length),
        'X-Upload-Content-Type': contentType,
      },
      body: JSON.stringify(body),
    },
  );
  if (!initRes.ok) {
    throw new Error(`YouTube upload init failed (${initRes.status}): ${await initRes.text()}`);
  }
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL');

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(videoBuffer.length) },
    body: videoBuffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`YouTube upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }
  const video = await uploadRes.json();

  const result = {
    videoId: video.id,
    url: `https://studio.youtube.com/video/${video.id}/edit`,
  };

  if (opts.thumbnailBuffer?.length) {
    result.thumbnail = await setYouTubeThumbnail(
      accessToken,
      video.id,
      opts.thumbnailBuffer,
      opts.thumbnailContentType || 'image/png',
    );
  }

  return result;
}

async function setYouTubeThumbnail(accessToken, videoId, thumbnailBuffer, contentType) {
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
        'Content-Length': String(thumbnailBuffer.length),
      },
      body: thumbnailBuffer,
    },
  );

  if (!res.ok) {
    return { status: 'error', error: `Thumbnail upload failed (${res.status}): ${await res.text()}` };
  }

  return { status: 'uploaded', response: await res.json() };
}
