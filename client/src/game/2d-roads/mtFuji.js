/** Mt Fuji sakura — filmstrip journey (one mountain, smooth crossfades). */
export const MT_FUJI_2D = {
  id: 'fuji-2d-day',
  mode: 'filmstrip',
  root: '/img/2d-roads/mt-fuji',
  sky: ['#7eb8e8', '#b8daf5', '#e8f2fc'],
  filmstrip: {
    frames: [
      'frame-1.png',
      'frame-2.png',
      'frame-3.png',
      'frame-4.png',
    ],
    tripSeconds: 28,
    holdAtEnd: 2.6,
    refSpeed: 140,
  },
  car: {
    file: 'car-side.png',
    x: 0.32,
    y: 0.86,
    width: 0.30,
  },
};

/** Optional dawn strip (legacy single panorama). */
export const MT_FUJI_2D_DAWN = {
  id: 'fuji-2d-dawn',
  mode: 'journey',
  root: '/img/2d-roads/mt-fuji',
  sky: ['#2a1a40', '#c07050', '#f0c090'],
  holdAtEnd: 2.2,
  layers: [
    {
      file: 'fuji-dawn-panorama.png',
      speed: 1,
      y: 0,
      height: 1,
      opacity: 1,
    },
  ],
  car: {
    file: 'car-side.png',
    x: 0.32,
    y: 0.86,
    width: 0.30,
  },
};
