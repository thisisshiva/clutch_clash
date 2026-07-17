import { env } from '../config/env.js';
import { publishLog } from './logger.js';

function fallbackMetadata(trackName) {
  return {
    title: `Slow Lane — ${trackName} | Cinematic Theater Run`,
    description:
      `A cinematic theater-mode drive on ${trackName} in Slow Lane, ` +
      'a cinematic arcade racing game.\n\n#SlowLane #RacingGame #Gaming',
    tags: ['slow lane', 'racing game', 'theater mode', 'cinematic', trackName.toLowerCase()],
    instagramCaption: `Cinematic drive on ${trackName} in Slow Lane. #SlowLane #RacingGame #Reels`,
    source: 'fallback',
  };
}

/**
 * Generates draft video metadata (title, description, tags, IG caption)
 * with the Gemini API. Falls back to templated copy when no API key is
 * configured or the request fails.
 */
export async function generateVideoMetadata({ trackName }) {
  if (!env.geminiApiKey) {
    publishLog.warn('GEMINI_API_KEY not set; using fallback metadata');
    return fallbackMetadata(trackName);
  }

  const prompt = [
    'You are writing social media copy for "Slow Lane", a cinematic arcade racing game.',
    `We recorded a 60-second cinematic "theater mode" video of an autopilot drive on the track "${trackName}".`,
    'Return JSON with exactly these fields:',
    '- "title": catchy YouTube title, max 90 characters',
    '- "description": YouTube description, 2-4 sentences followed by 3-6 hashtags',
    '- "tags": array of up to 10 short YouTube tags',
    '- "instagramCaption": Instagram Reels caption, max 200 characters, ending with 3-5 hashtags',
  ].join('\n');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no content');
    const parsed = JSON.parse(text);
    if (!parsed.title || !parsed.description) throw new Error('Gemini JSON missing fields');
    return {
      title: String(parsed.title).slice(0, 100),
      description: String(parsed.description),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 10).map(String) : [],
      instagramCaption: String(parsed.instagramCaption || parsed.description).slice(0, 2200),
      source: 'gemini',
    };
  } catch (err) {
    publishLog.warn('Gemini metadata generation failed', err);
    return fallbackMetadata(trackName);
  }
}
