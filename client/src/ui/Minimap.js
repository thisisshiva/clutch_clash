import { el } from './dom.js';
import { sampleTrackLoopArcLength, trackBoundsFromPoints } from '../game/spline.js';

const SIZE = 168;
const PAD = 10;

/**
 * Top-down track radar showing the local car and opponents.
 */
export function createMinimap(trackDef) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.className = 'minimap-canvas';
  const ctx = canvas.getContext('2d');

  const sampleCount = Math.min(
    360,
    Math.max(160, Math.round((trackDef.length || 1200) / 35)),
  );
  const padding = (trackDef.roadWidth || 16) * 0.75 + 16;
  const closed = trackDef.closed !== false;
  const loop = sampleTrackLoopArcLength(trackDef.controlPoints, sampleCount, closed);
  const bounds = trackBoundsFromPoints(loop, padding);
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1);

  function worldToCanvas(x, z) {
    const u = (x - bounds.minX) / spanX;
    const v = (z - bounds.minZ) / spanZ;
    return {
      x: PAD + u * (SIZE - PAD * 2),
      y: PAD + v * (SIZE - PAD * 2),
    };
  }

  function drawTrack() {
    ctx.fillStyle = 'rgba(8, 14, 32, 0.82)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const first = worldToCanvas(loop[0].x, loop[0].z);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < loop.length; i++) {
      const p = worldToCanvas(loop[i].x, loop[i].z);
      ctx.lineTo(p.x, p.y);
    }
    if (closed) ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(90, 100, 120, 0.55)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  function drawDot(x, z, color, size = 5, heading = null) {
    const p = worldToCanvas(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    if (heading != null) {
      const len = size + 4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.sin(heading) * len, p.y + Math.cos(heading) * len);
      ctx.stroke();
    }
  }

  const node = el('div.minimap', {}, canvas);

  return {
    node,
    /** @param {{x:number,z:number,heading:number}} local */
    update(local, opponents = []) {
      drawTrack();
      for (const o of opponents) {
        const hex = `#${(o.color ?? 0xffffff).toString(16).padStart(6, '0')}`;
        drawDot(o.x, o.z, hex, 4);
      }
      drawDot(local.x, local.z, '#ffffff', 5, local.heading);
    },
  };
}
