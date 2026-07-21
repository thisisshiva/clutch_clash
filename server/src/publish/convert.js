import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PROFILES = {
  shorts: {
    suffix: 'shorts',
    durationSec: 60,
    filter:
      'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,' +
      'crop=1080:1920,setsar=1,format=yuv420p',
    // YouTube Shorts can stay higher quality.
    video: {
      preset: 'slow',
      crf: '18',
      profile: 'high',
      level: '4.1',
      bf: '2',
      maxrate: '10M',
      bufsize: '20M',
    },
    audio: { bitrate: '160k', rate: '48000' },
  },
  instagram: {
    suffix: 'instagram',
    durationSec: 60,
    filter:
      'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,' +
      'crop=1080:1920,setsar=1,format=yuv420p',
    // IG Reels: keep under typical API limits (?25 Mbps video, ?128 kbps AAC).
    video: {
      preset: 'medium',
      crf: '23',
      profile: 'main',
      level: '4.0',
      bf: '0',
      maxrate: '8M',
      bufsize: '16M',
    },
    audio: { bitrate: '128k', rate: '44100' },
  },
  youtube: {
    suffix: 'youtube',
    filter:
      'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,' +
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p',
    video: {
      preset: 'slow',
      crf: '17',
      profile: 'high',
      level: '4.1',
      bf: '2',
      maxrate: '12M',
      bufsize: '24M',
    },
    audio: { bitrate: '192k', rate: '48000' },
  },
};

/**
 * Converts a WebM (or any ffmpeg-readable) file to high-quality H.264/AAC MP4.
 * @param {'shorts'|'instagram'|'youtube'} [profile]
 * @returns {Promise<{ mp4Path: string, buffer: Buffer }>}
 */
export function convertToMp4(inputPath, outputPath = mp4FileName(inputPath), profile = 'youtube') {
  const selected = PROFILES[profile] ?? PROFILES.youtube;
  const video = selected.video;
  const audio = selected.audio;
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-fflags', '+genpts',
      '-i', inputPath,
    ];
    if (selected.durationSec) {
      args.push('-t', String(selected.durationSec));
    }
    args.push(
      '-vf', selected.filter,
      '-c:v', 'libx264',
      '-preset', video.preset,
      '-crf', video.crf,
      '-profile:v', video.profile,
      '-level:v', video.level,
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-bf', video.bf,
      '-fps_mode', 'cfr',
      '-r', '30',
      '-maxrate', video.maxrate,
      '-bufsize', video.bufsize,
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', audio.bitrate,
      '-ar', audio.rate,
      '-ac', '2',
      '-brand', 'mp42',
      outputPath,
    );
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(new Error(`ffmpeg not available: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
        return;
      }
      if (!fs.existsSync(outputPath)) {
        reject(new Error('ffmpeg finished but MP4 is missing'));
        return;
      }
      const buffer = fs.readFileSync(outputPath);
      if (!buffer.length) {
        reject(new Error('ffmpeg produced an empty MP4 (check input video dimensions/codecs)'));
        return;
      }
      resolve({ mp4Path: outputPath, buffer });
    });
  });
}

export function mp4FileName(webmName, profile = '') {
  const suffix = profile ? `-${PROFILES[profile]?.suffix || profile}` : '';
  return path.basename(webmName).replace(/\.[^.]+$/, `${suffix}.mp4`);
}
