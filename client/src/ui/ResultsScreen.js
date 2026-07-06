import { el, formatTime } from './dom.js';

/**
 * Post-race results table.
 * @param {{
 *   results: Array<{name:string, finished:boolean, place:number|null, timeMs:number|null, lap:number}>,
 *   isHost: boolean,
 *   onBackToLobby: () => void,
 *   onLeave: () => void,
 * }} props
 */
export function ResultsScreen({ results, isHost, onBackToLobby, onLeave }) {
  const rows = results.map((r, i) => {
    const place = r.finished ? r.place : '-';
    return el('tr', {},
      el(`td.pos-${place}`, {}, r.finished ? `P${place}` : 'DNF'),
      el('td', {}, r.name),
      el('td', {}, r.finished ? formatTime(r.timeMs) : `Lap ${r.lap}`),
    );
  });

  return el('div.screen', {},
    el('div.panel', { style: 'width:480px' },
      el('h2', {}, 'Race Results'),
      el('table.results-table', {},
        el('tr', {}, el('th', {}, 'Pos'), el('th', {}, 'Racer'), el('th', {}, 'Time')),
        rows,
      ),
      el('div.stack', {},
        isHost
          ? el('button.btn', { onclick: onBackToLobby }, 'Back to Lobby (Rematch)')
          : el('div.hint', { style: 'text-align:center' }, 'The host can start a rematch...'),
        el('button.btn.secondary', { onclick: onLeave }, 'Leave Room'),
      ),
    ),
  );
}
