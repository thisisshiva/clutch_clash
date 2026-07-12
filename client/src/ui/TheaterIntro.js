import { el, addOverlay } from './dom.js';

/**
 * Full-screen cinematic word intro overlaid on the live theater drive.
 * @param {string[]} words  Map name split into words, e.g. ['ROAD','TO','HEAVEN']
 * @returns {Promise<void>}
 */
export function playTheaterIntro(words = ['THEATER']) {
  return new Promise((resolve) => {
    const stage = el('div.theater-intro');
    const wordEl = el('div.theater-intro-word');
    const sub = el('div.theater-intro-sub', {}, 'THEATER');
    const glow = el('div.theater-intro-glow');
    stage.append(glow, wordEl, sub);
    const remove = addOverlay(stage);

    let index = 0;
    const sequence = words.length ? words : ['THEATER'];

    function showNext() {
      if (index >= sequence.length) {
        stage.classList.add('theater-intro-out');
        setTimeout(() => {
          remove();
          resolve();
        }, 700);
        return;
      }

      const word = sequence[index];
      wordEl.textContent = word;
      wordEl.className = 'theater-intro-word';
      void wordEl.offsetWidth;
      wordEl.classList.add('theater-intro-word-in');
      if (index === sequence.length - 1) {
        wordEl.classList.add('theater-intro-finale');
        sub.classList.add('theater-intro-sub-show');
      }

      const hold = index === sequence.length - 1 ? 1800 : 1100;
      index += 1;
      setTimeout(() => {
        if (index < sequence.length) {
          wordEl.classList.remove('theater-intro-word-in');
          wordEl.classList.add('theater-intro-word-out');
          setTimeout(showNext, 280);
        } else {
          showNext();
        }
      }, hold);
    }

    requestAnimationFrame(() => {
      stage.classList.add('theater-intro-ready');
      showNext();
    });
  });
}
