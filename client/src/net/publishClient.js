/**
 * Client for the server's theater publishing API.
 */

export async function uploadTheaterVideo(blob, { filename, trackName }) {
  const params = new URLSearchParams({ filename, track: trackName });
  const res = await fetch(`/api/publish/theater?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'video/webm' },
    body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
  }
  return data.jobId;
}

/**
 * Polls until the job leaves "processing" (or times out).
 * Conversion + uploads can take a few minutes for a 60s video.
 * @returns {Promise<object|null>}
 */
export async function waitForPublishJob(jobId, { timeoutMs = 600_000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`/api/publish/jobs/${jobId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.job.status !== 'processing') return data.job;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
