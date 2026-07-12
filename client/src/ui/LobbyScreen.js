import { el, toast, splitLayout } from './dom.js';
import { getCarDef } from '../game/carCatalog.js';
import { CarPicker } from './CarPicker.js';

/**
 * Room lobby: shows join code, player list, track selector (host only)
 * and the start button.
 * @param {{
 *   tracks: Array,
 *   getRoom: () => object,
 *   localId: () => string,
 *   onSetTrack: (trackId: string) => void,
 *   onSelectCar: (carId: string) => void,
 *   onAddBot: () => void,
 *   onRemoveBot: (id: string) => void,
 *   onStart: () => void,
 *   onLeave: () => void,
 * }} props
 * @returns {{ node: HTMLElement, refresh: () => void }}
 */
export function LobbyScreen({ tracks, getRoom, localId, onSetTrack, onSelectCar, onAddBot, onRemoveBot, onStart, onLeave }) {
  const playerList = el('ul.player-list');
  const trackGrid = el('div.track-grid');
  const carPicker = CarPicker({ compact: true, onSelect: onSelectCar });
  const startBtn = el('button.btn', { onclick: onStart }, 'Start Race');
  const botBtn = el('button.btn.secondary', { onclick: onAddBot }, 'Add Bot');
  const waitHint = el('div.hint', { style: 'text-align:center' });
  const gameCodeEl = el('div.game-pane-room-code');
  const gameTrackEl = el('div.game-pane-meta');

  function refresh() {
    const room = getRoom();
    if (!room) return;
    const isHost = room.hostId === localId();
    const track = tracks.find((t) => t.id === room.trackId);

    gameCodeEl.textContent = room.code;
    gameCodeEl.title = 'Click to copy';
    gameCodeEl.style.cursor = 'pointer';
    gameCodeEl.onclick = () => {
      navigator.clipboard?.writeText(room.code);
      toast('Room code copied!');
    };
    gameTrackEl.textContent = track
      ? `${track.name} · ${track.checkpointCount} checkpoints · ${track.laps} laps`
      : '';

    playerList.replaceChildren(...room.players.map((p) => {
      const carName = getCarDef(p.carModel).name;
      return el('li', {},
        el('span.color-dot', { style: `background:#${p.color.toString(16).padStart(6, '0')}` }),
        el('span', {}, p.name, p.isBot ? ' 🤖' : '', p.id === localId() ? ' (you)' : ''),
        el('span.player-tags', {},
          el('span.car-tag', {}, carName),
          p.id === room.hostId ? el('span.host-tag', {}, 'Host') : null,
          isHost && p.isBot
            ? el('button.btn.secondary.small', { onclick: () => onRemoveBot(p.id) }, 'Remove')
            : null,
        ),
      );
    }));

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
    botBtn.style.display = isHost ? '' : 'none';
    waitHint.style.display = isHost ? 'none' : '';
    waitHint.textContent = 'Waiting for the host to start the race...';
    carPicker.refresh();
  }

  refresh();

  const node = splitLayout(
    [
      el('div.game-pane-label', {}, 'Race lobby'),
      gameCodeEl,
      gameTrackEl,
      el('div.pane-section', {},
        el('h3', {}, 'Your Car'),
        carPicker.node,
      ),
      el('div.pane-section', {},
        el('h3', {}, 'Track'),
        trackGrid,
      ),
    ],
    [
      el('h2', {}, 'Room'),
      el('h3', {}, 'Players'),
      playerList,
      el('div.stack', { style: 'margin-top:14px' },
        startBtn,
        botBtn,
        waitHint,
        el('button.btn.secondary', { onclick: onLeave }, 'Leave Room'),
      ),
    ],
  );

  return { node, refresh };
}
