import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PROFILES = {
  shorts: {
    suffix: 'shorts',
    // YouTube Shorts: vertical 9:16, crop sides to fill the screen.
    filter:
      'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,' +
      'crop=1080:1920,setsar=1,format=yuv420p',
  },
  youtube: {
    suffix: 'youtube',
    // Standard YouTube video: landscape 16:9.
    filter:
      'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,' +
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p',
  },
};

/**
 * Converts a WebM (or any ffmpeg-readable) file to high-quality H.264/AAC MP4.
 * Uses a slower preset / lower CRF — quality over speed.
 * @param {'shorts'|'youtube'} [profile]
 * @returns {Promise<{ mp4Path: string, buffer: Buffer }>}
 */
export function convertToMp4(inputPath, outputPath = mp4FileName(inputPath), profile = 'youtube') {
  const selected = PROFILES[profile] ?? PROFILES.youtube;
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-fflags', '+genpts',
      '-i', inputPath,
      '-vf', selected.filter,
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '17',
      '-profile:v', 'high',
      '-level:v', '4.1',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-bf', '2',
      '-fps_mode', 'cfr',
      '-r', '30',
      '-maxrate', '12M',
      '-bufsize', '24M',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      outputPath,
    ];
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
