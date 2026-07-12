import { el, formatTime } from './dom.js';

const REMATCH_SECONDS = 12;

/**
 * Post-race results with auto-rematch countdown.
 * @param {{
 *   results: Array,
 *   isHost: boolean,
 *   onRematchNow: () => void,
 *   onBackToLobby: () => void,
 *   onLeave: () => void,
 * }} props
 */
export function ResultsScreen({ results, isHost, onRematchNow, onBackToLobby, onLeave }) {
  const countdownEl = el('div.rematch-countdown', {});
  let secondsLeft = REMATCH_SECONDS;
  let timer = null;

  function tick() {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      clearInterval(timer);
      countdownEl.textContent = 'Starting rematch...';
      if (isHost) onRematchNow();
      return;
    }
    countdownEl.textContent = isHost
      ? `Rematch in ${secondsLeft}s...`
      : `Host rematch in ${secondsLeft}s...`;
  }

  countdownEl.textContent = isHost
    ? `Rematch in ${secondsLeft}s...`
    : `Host rematch in ${secondsLeft}s...`;
  timer = setInterval(tick, 1000);

  const rows = results.map((r) => {
    const place = r.finished ? r.place : '-';
    return el('tr', {},
      el(`td.pos-${place}`, {}, r.finished ? `P${place}` : 'DNF'),
      el('td', {}, r.name),
      el('td', {}, r.finished ? formatTime(r.timeMs) : `Lap ${r.lap}`),
    );
  });

  const node = el('div.screen', {},
    el('div.panel', { style: 'width:480px' },
      el('h2', {}, 'Race Results'),
      countdownEl,
      el('table.results-table', {},
        el('tr', {}, el('th', {}, 'Pos'), el('th', {}, 'Racer'), el('th', {}, 'Time')),
        rows,
      ),
      el('div.stack', {},
        isHost
          ? el('button.btn', { onclick: () => { clearInterval(timer); onRematchNow(); } }, 'Rematch Now')
          : null,
        isHost
          ? el('button.btn.secondary', { onclick: () => { clearInterval(timer); onBackToLobby(); } }, 'Back to Lobby')
          : el('div.hint', { style: 'text-align:center' }, 'Waiting for host rematch...'),
        el('button.btn.secondary', { onclick: () => { clearInterval(timer); onLeave(); } }, 'Leave Room'),
      ),
    ),
  );

  return { node, cancel: () => clearInterval(timer) };
}
