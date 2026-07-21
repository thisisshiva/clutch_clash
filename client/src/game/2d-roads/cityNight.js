/**
 * City night moving picture — generated art backdrop + flat transparent car.
 * STYLE: 'vector' | 'pixel'
 */
const STYLE = 'vector';

const ROOT = '/img/2d-roads/city-night';

const VECTOR = {
  id: 'city-night-vector',
  root: ROOT,
  // Single full-bleed panorama — no mid overlay (that caused the black sky bar).
  layers: [
    {
      file: 'city-panorama.png',
      speed: 0.4,
      y: 0,
      height: 1,
      opacity: 1,
      blend: 0.22,
    },
  ],
  road: {
    file: 'city-road.png',
    speed: 1.1,
    y: 0.86,
    height: 0.14,
    opacity: 0,
  },
  car: {
    drawn: false,
    file: 'car-side.png',
    x: 0.3,
    y: 0.93,
    width: 0.3,
  },
};

const PIXEL = {
  id: 'city-night-pixel',
  root: ROOT,
  layers: [
    {
      file: 'city-pixel.png',
      speed: 0.42,
      y: 0,
      height: 1,
      opacity: 1,
      blend: 0.22,
    },
  ],
  road: {
    file: 'city-road.png',
    speed: 1.1,
    y: 0.86,
    height: 0.14,
    opacity: 0,
  },
  car: {
    drawn: false,
    file: 'car-side.png',
    x: 0.3,
    y: 0.93,
    width: 0.3,
  },
};

export const CITY_NIGHT_MOVING = STYLE === 'pixel' ? PIXEL : VECTOR;
