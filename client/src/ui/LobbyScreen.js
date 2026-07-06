import { el, toast } from './dom.js';

/**
 * Room lobby: shows join code, player list, track selector (host only)
 * and the start button.
 * @param {{
 *   tracks: Array,
 *   getRoom: () => object,
 *   localId: () => string,
 *   onSetTrack: (trackId: string) => void,
 *   onStart: () => void,
 *   onLeave: () => void,
 * }} props
 * @returns {{ node: HTMLElement, refresh: () => void }}
 */
export function LobbyScreen({ tracks, getRoom, localId, onSetTrack, onStart, onLeave }) {
  const playerList = el('ul.player-list');
  const trackGrid = el('div.track-grid');
  const startBtn = el('button.btn', { onclick: onStart }, 'Start Race');
  const waitHint = el('div.hint', { style: 'text-align:center' });
  const codeEl = el('div.room-code', {
    title: 'Click to copy',
    onclick: () => {
      navigator.clipboard?.writeText(getRoom()?.code || '');
      toast('Room code copied!');
    },
  });

  function refresh() {
    const room = getRoom();
    if (!room) return;
    const isHost = room.hostId === localId();

    codeEl.textContent = room.code;

    playerList.replaceChildren(...room.players.map((p) =>
      el('li', {},
        el('span.color-dot', { style: `background:#${p.color.toString(16).padStart(6, '0')}` }),
        el('span', {}, p.name, p.id === localId() ? ' (you)' : ''),
        p.id === room.hostId ? el('span.host-tag', {}, 'Host') : null,
      )
    ));

    trackGrid.replaceChildren(...tracks.map((t) =>
      el('div.track-card' + (t.id === room.trackId ? '.selected' : ''), {
        style: isHost ? '' : 'cursor:default; opacity:0.85',
        onclick: () => { if (isHost) onSetTrack(t.id); },
      },
        el('div.t-name', {}, t.name),
        el('div.t-meta', {}, `${t.checkpointCount} CP · ${t.laps} laps`),
      )
    ));

    startBtn.style.display = isHost ? '' : 'none';
    waitHint.style.display = isHost ? 'none' : '';
    waitHint.textContent = 'Waiting for the host to start the race...';
  }

  refresh();

  const node = el('div.screen', {},
    el('div.panel', { style: 'width:640px' },
      el('h2', {}, 'Race Lobby'),
      codeEl,
      el('h3', {}, 'Players'),
      playerList,
      el('h3', {}, 'Track'),
      trackGrid,
      el('div.stack', { style: 'margin-top:16px' },
        startBtn,
        waitHint,
        el('button.btn.secondary', { onclick: onLeave }, 'Leave Room'),
      ),
    ),
  );

  return { node, refresh };
}
