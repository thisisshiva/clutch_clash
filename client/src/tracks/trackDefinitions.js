/**
 * Track data comes from the server (single source of truth) so checkpoint
 * validation and spawn points always match what the client renders.
 */

let cache = null;

export async function loadTracks() {
  if (cache) return cache;
  const res = await fetch('/api/tracks/full');
  if (!res.ok) throw new Error('Track data load nahi hui');
  cache = await res.json();
  return cache;
}

export function getCachedTrack(id) {
  return cache?.find((t) => t.id === id) || null;
}
