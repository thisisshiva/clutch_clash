/**
 * Flat side-scrolling / filmstrip canvas for 2D Roads.
 *
 * Modes:
 * - loop: tiled seamless panorama (city)
 * - journey: one wide strip, no wrap (legacy)
 * - filmstrip: sequence of full-frame shots crossfaded by progress (Fuji)
 */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

function makeSeamlessHorizontal(img, blendFrac = 0.12) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img;
  const blend = Math.max(8, Math.round(w * blendFrac));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(w - blend, 0, w, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(w - blend, 0, blend, h);
  ctx.restore();
  ctx.drawImage(img, 0, 0, blend, h, w - blend, 0, blend, h);
  return canvas;
}

function cleanSpriteAlpha(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return img;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const brightness = (r + g + b) / 3;
    const greenDominant = g > r + 18 && g > b + 18;
    const neonGreen = greenDominant && g > 70 && chroma > 28;
    const limeWash = g > 140 && r < 170 && b < 150 && g > r && g > b;
    const darkGreenKey = g > 40 && g > r + 12 && g > b + 12 && brightness < 90;
    if (neonGreen || limeWash || darkGreenKey) {
      const kill = Math.min(1, chroma / 55 + (g - Math.max(r, b)) / 80);
      d[i + 3] = Math.round(d[i + 3] * (1 - kill));
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function measureDrawSize(img, targetH, viewW, fillWidth) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  let drawH = targetH;
  let drawW = Math.round(targetH * (iw / ih));
  if (fillWidth && drawW < viewW) {
    drawW = viewW;
    drawH = Math.round(viewW * (ih / iw));
  }
  return { drawW, drawH };
}

function tileDraw(ctx, img, scrollX, y, h, viewW) {
  if (!img) return;
  const { drawW, drawH } = measureDrawSize(img, h, viewW, true);
  const offset = ((scrollX % drawW) + drawW) % drawW;
  for (let x = -offset; x < viewW; x += drawW) {
    ctx.drawImage(img, Math.round(x), y, drawW, drawH);
  }
}

function journeyDraw(ctx, img, scrollX, y, h, viewW) {
  if (!img) return;
  const { drawW, drawH } = measureDrawSize(img, h, viewW, false);
  const maxScroll = Math.max(0, drawW - viewW);
  const x = -Math.min(Math.max(scrollX, 0), maxScroll);
  ctx.drawImage(img, Math.round(x), y, drawW, drawH);
}

/** Scale image to cover the viewport, with optional horizontal pan. */
function coverDraw(ctx, img, viewW, viewH, pan01 = 0.5) {
  if (!img) return;
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const scale = Math.max(viewW / iw, viewH / ih) * 1.08;
  const dw = iw * scale;
  const dh = ih * scale;
  const maxPan = Math.max(0, dw - viewW);
  const dx = -maxPan * Math.min(1, Math.max(0, pan01));
  const dy = (viewH - dh) * 0.42;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawFlatCar(ctx, x, y, w, time) {
  const h = w * 0.37;
  const bounce = Math.sin(time * 14) * 1.5;
  ctx.save();
  ctx.translate(x, y + bounce);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.92, w * 0.42, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1f2e';
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.72);
  ctx.lineTo(w * 0.18, h * 0.42);
  ctx.lineTo(w * 0.38, h * 0.28);
  ctx.lineTo(w * 0.62, h * 0.28);
  ctx.lineTo(w * 0.82, h * 0.42);
  ctx.lineTo(w * 0.94, h * 0.72);
  ctx.lineTo(w * 0.88, h * 0.82);
  ctx.lineTo(w * 0.12, h * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(120,200,255,0.35)';
  ctx.fillRect(w * 0.34, h * 0.34, w * 0.32, h * 0.16);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(w * 0.28, h * 0.82, h * 0.16, 0, Math.PI * 2);
  ctx.arc(w * 0.74, h * 0.82, h * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export class MovingPicture {
  constructor(config) {
    this.config = config;
    this.mode = config.mode || 'loop';
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.width = 1280;
    this.height = 720;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.layers = [];
    this.frames = [];
    this.roadImg = null;
    this.carImg = null;
    this.scroll = 0;
    this.progress = 0;
    this.time = 0;
    this._holdTimer = 0;
    this.ready = false;
  }

  async load() {
    const { assetRoot, root: rootKey, layers = [], road, car, filmstrip } = this.config;
    const root = String(assetRoot || rootKey || '').replace(/\/$/, '');

    if (this.mode === 'filmstrip' && filmstrip?.frames?.length) {
      this.frames = [];
      for (const file of filmstrip.frames) {
        try {
          this.frames.push(await loadImage(`${root}/${file}`));
        } catch (err) {
          console.warn('Filmstrip frame failed:', file, err);
        }
      }
    } else {
      this.layers = [];
      for (const layer of layers) {
        try {
          const img = await loadImage(`${root}/${layer.file}`);
          const prepared = this.mode === 'journey' ? img : makeSeamlessHorizontal(img, 0.15);
          this.layers.push({ ...layer, img: prepared });
        } catch (err) {
          console.warn('Moving picture layer failed:', layer.file, err);
        }
      }
    }

    if (road?.file && (road.opacity ?? 1) > 0.01) {
      try {
        const img = await loadImage(`${root}/${road.file}`);
        this.roadImg = this.mode === 'loop' ? makeSeamlessHorizontal(img, 0.15) : img;
      } catch (err) {
        console.warn('Moving picture road failed:', road.file, err);
      }
    }

    if (car?.file && !car.drawn) {
      try {
        const img = await loadImage(`${root}/${car.file}?v=neon`);
        this.carImg = cleanSpriteAlpha(img);
      } catch (err) {
        console.warn('Moving picture car failed:', car.file, err);
      }
    }

    this.ready = this.mode === 'filmstrip' ? this.frames.length > 0 : this.layers.length > 0;
  }

  resize(width, height) {
    this.width = Math.max(320, Math.floor(width));
    this.height = Math.max(180, Math.floor(height));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  render({ dt, speed }) {
    const { ctx, width, height } = this;
    const step = Math.min(Math.max(dt, 0), 1 / 30);
    this.time += step;

    const sky = this.config.sky || (this.mode === 'loop'
      ? ['#050814', '#121830', '#1a2030']
      : ['#8ec8f0', '#c8e4f8', '#e8f4fc']);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(0.55, sky[1]);
    grad.addColorStop(1, sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    if (this.mode === 'filmstrip') {
      this._renderFilmstrip(step, speed);
    } else if (this.mode === 'journey') {
      this._renderJourney(step, speed);
    } else {
      this.scroll += speed * step;
      for (const layer of this.layers) {
        const h = Math.round(height * layer.height);
        const y = Math.round(height * layer.y);
        ctx.globalAlpha = layer.opacity ?? 1;
        tileDraw(ctx, layer.img, this.scroll * layer.speed, y, h, width);
        ctx.globalAlpha = 1;
      }
    }

    const road = this.config.road;
    if (road && (road.opacity ?? 1) > 0.01 && this.roadImg) {
      const rh = Math.round(height * road.height);
      const ry = Math.round(height * road.y);
      ctx.globalAlpha = road.opacity ?? 1;
      if (this.mode === 'loop') {
        tileDraw(ctx, this.roadImg, this.scroll * road.speed, ry, rh, width);
      } else {
        journeyDraw(ctx, this.roadImg, this.scroll * (road.speed ?? 1), ry, rh, width);
      }
      ctx.globalAlpha = 1;
    }

    this._drawCar(speed);
  }

  _renderFilmstrip(step, speed) {
    const { ctx, width, height } = this;
    const strip = this.config.filmstrip || {};
    const frames = this.frames;
    if (!frames.length) return;

    const tripSecs = strip.tripSeconds ?? 26;
    const holdSecs = strip.holdAtEnd ?? 2.4;
    const refSpeed = strip.refSpeed ?? 140;
    const rate = (speed / refSpeed) / tripSecs;

    if (this._holdTimer > 0) {
      this._holdTimer -= step;
      if (this._holdTimer <= 0) {
        this.progress = 0;
        this._holdTimer = 0;
      }
    } else {
      this.progress += rate * step;
      if (this.progress >= 1) {
        this.progress = 1;
        this._holdTimer = holdSecs;
      }
    }

    const n = frames.length;
    const t = this.progress * (n - 1);
    const i0 = Math.min(n - 1, Math.floor(t));
    const i1 = Math.min(n - 1, i0 + 1);
    const blend = t - i0;
    const pan0 = 0.15 + (t - i0) * 0.55;
    const pan1 = 0.15 + Math.min(1, (t - i0 + 0.01)) * 0.55;

    ctx.save();
    ctx.globalAlpha = 1;
    coverDraw(ctx, frames[i0], width, height, pan0);
    if (i1 !== i0 && blend > 0.001) {
      ctx.globalAlpha = blend;
      coverDraw(ctx, frames[i1], width, height, pan1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _renderJourney(step, speed) {
    const { ctx, width, height } = this;
    const layer = this.layers[0];
    if (!layer?.img) return;

    const h = Math.round(height * (layer.height ?? 1));
    const y = Math.round(height * (layer.y ?? 0));
    const { drawW } = measureDrawSize(layer.img, h, width, false);
    const maxScroll = Math.max(0, drawW - width);
    const holdSecs = this.config.holdAtEnd ?? 2.2;

    if (this._holdTimer > 0) {
      this._holdTimer -= step;
      if (this._holdTimer <= 0) {
        this.scroll = 0;
        this._holdTimer = 0;
      }
    } else {
      this.scroll += speed * step * (layer.speed ?? 1);
      if (this.scroll >= maxScroll && maxScroll > 0) {
        this.scroll = maxScroll;
        this._holdTimer = holdSecs;
      }
    }

    ctx.globalAlpha = layer.opacity ?? 1;
    journeyDraw(ctx, layer.img, this.scroll, y, h, width);
    ctx.globalAlpha = 1;
  }

  _drawCar(speed) {
    const { ctx, width, height } = this;
    const car = this.config.car;
    if (!car) return;
    const bounce = Math.sin(this.time * 14) * Math.min(3, speed / 100);
    const cw = Math.round(width * car.width);
    const useDrawn = car.drawn || !this.carImg;
    let ch;
    if (useDrawn) {
      ch = Math.round(cw * (96 / 260));
    } else {
      const iw = this.carImg.naturalWidth || this.carImg.width || 1;
      const ih = this.carImg.naturalHeight || this.carImg.height || 1;
      ch = Math.round(cw * (ih / iw));
    }
    const cx = Math.round(width * car.x - cw / 2);
    const cy = Math.round(height * car.y - ch + bounce);

    if (useDrawn) drawFlatCar(ctx, cx, cy, cw, this.time);
    else ctx.drawImage(this.carImg, cx, cy, cw, ch);
  }
}
