/**
 * Cinematic theater intro drawn on a transparent canvas overlay so it
 * appears on screen and can be composited into the theater recording.
 *
 * Sequence: map-name words → [brand logo] → song name → 3 → 2 → 1 → clear
 * Black overlay stays constant for the whole intro (no flash between beats).
 *
 * @param {string[]} words
 * @param {{ songName?: string, brandLogoCanvas?: HTMLCanvasElement|null, skipSong?: boolean, skipCountdown?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export function playTheaterIntro(words = ['THEATER'], opts = {}) {
  const sequence = (words.length ? words : ['THEATER']).map((w) => String(w).toUpperCase());
  const countdown = ['3', '2', '1'];
  const songName = opts.skipSong ? '' : String(opts.songName || '').trim();
  const brandLogo = opts.brandLogoCanvas || null;
  const skipCountdown = !!opts.skipCountdown;

  const canvas = document.createElement('canvas');
  canvas.className = 'theater-intro-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:40;pointer-events:none;';
  document.body.appendChild(canvas);
  activeIntroCanvas = canvas;

  const ctx = canvas.getContext('2d');
  let disposed = false;
  let overlay = 0;
  let text = '';
  let textAlpha = 0;
  let scale = 0.85;
  let songMode = false;
  let logoAlpha = 0;
  let logoScale = 0.85;
  let showLogo = false;
  let raf = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    if (disposed) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (overlay > 0.01) {
      ctx.fillStyle = `rgba(2, 4, 12, ${0.62 * overlay})`;
      ctx.fillRect(0, 0, w, h);

      const g = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.08, w * 0.5, h * 0.5, w * 0.72);
      g.addColorStop(0, `rgba(4, 8, 18, ${0.05 * overlay})`);
      g.addColorStop(0.55, `rgba(4, 8, 18, ${0.18 * overlay})`);
      g.addColorStop(1, `rgba(0, 0, 0, ${0.28 * overlay})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (showLogo && brandLogo && logoAlpha > 0.01) {
      const maxW = w * 0.72;
      const maxH = h * 0.28;
      const fit = Math.min(maxW / brandLogo.width, maxH / brandLogo.height) * logoScale;
      const dw = brandLogo.width * fit;
      const dh = brandLogo.height * fit;
      ctx.save();
      ctx.globalAlpha = logoAlpha;
      ctx.drawImage(brandLogo, (w - dw) * 0.5, (h - dh) * 0.48, dw, dh);
      ctx.restore();
    }

    if (textAlpha > 0.01 && text) {
      ctx.save();
      ctx.translate(w * 0.5, h * 0.48);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const size = songMode
        ? Math.floor(Math.min(w, h) * 0.048)
        : Math.floor(Math.min(w, h) * 0.14);
      ctx.font = `900 ${size}px Orbitron, sans-serif`;
      ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
      ctx.shadowColor = songMode ? 'rgba(255, 200, 120, 0.35)' : 'rgba(0, 180, 255, 0.45)';
      ctx.shadowBlur = Math.floor(w * (songMode ? 0.02 : 0.04));
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);

  function animateTextIn() {
    return tween(280, (t) => {
      textAlpha = t;
      scale = 0.78 + t * 0.22;
    });
  }

  function animateTextOut() {
    return tween(220, (t) => {
      textAlpha = 1 - t;
      scale = 1 + t * 0.08;
    });
  }

  function hold(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function tween(ms, fn) {
    return new Promise((resolve) => {
      const start = performance.now();
      function step(now) {
        if (disposed) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - start) / ms);
        fn(easeOutCubic(t));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  async function showWord(word, { holdMs = 1100, asSong = false } = {}) {
    text = word;
    songMode = asSong;
    showLogo = false;
    await animateTextIn();
    await hold(holdMs);
    await animateTextOut();
  }

  async function showBrandLogo({ holdMs = 1800 } = {}) {
    if (!brandLogo) return;
    text = '';
    textAlpha = 0;
    showLogo = true;
    await tween(360, (t) => {
      logoAlpha = t;
      logoScale = 0.82 + t * 0.18;
    });
    await hold(holdMs);
    await tween(280, (t) => {
      logoAlpha = 1 - t;
      logoScale = 1 + t * 0.06;
    });
    showLogo = false;
    logoAlpha = 0;
  }

  return (async () => {
    try {
      await tween(450, (t) => { overlay = t; });

      for (const word of sequence) {
        await showWord(word, { holdMs: 1000 });
        if (disposed) return;
      }

      await showBrandLogo();
      if (disposed) return;

      if (songName) {
        await showWord(songName.toUpperCase(), { holdMs: 1600, asSong: true });
        if (disposed) return;
      }

      if (!skipCountdown) {
        for (const n of countdown) {
          await showWord(n, { holdMs: 750 });
          if (disposed) return;
        }
      }

      await tween(500, (t) => { overlay = 1 - t; });
      await hold(120);
    } finally {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.remove();
      if (activeIntroCanvas === canvas) activeIntroCanvas = null;
    }
  })();
}

/** Canvas currently showing the theater intro, if any (for recording composite). */
let activeIntroCanvas = null;

export function getTheaterIntroCanvas() {
  return activeIntroCanvas;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}
