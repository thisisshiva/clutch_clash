import { el } from './dom.js';

/**
 * Track picker - used when creating a room.
 * @param {{ tracks: Array, onSelect: (trackId: string) => void, onBack: () => void }} props
 */
export function MapSelectScreen({ tracks, onSelect, onBack }) {
  let selectedId = tracks[0]?.id;

  const cards = tracks.map((t) =>
    el('div.track-card', {
      dataset: { id: t.id },
      onclick: (e) => {
        selectedId = t.id;
        for (const c of cards) c.classList.toggle('selected', c.dataset.id === t.id);
      },
    },
      el('div.t-name', {}, t.name),
      el('div.t-meta', {}, `${t.checkpointCount} checkpoints · ${t.laps} laps · ${t.length}m`),
      el('div.t-desc', {}, t.description),
    )
  );
  cards[0]?.classList.add('selected');

  return el('div.screen', {},
    el('div.panel', { style: 'width:660px' },
      el('h2', {}, 'Track Chuno'),
      el('div.track-grid', {}, cards),
      el('div.row', { style: 'margin-top:18px' },
        el('button.btn.secondary', { onclick: onBack }, 'Back'),
        el('button.btn', { onclick: () => onSelect(selectedId) }, 'Room Banao'),
      ),
    ),
  );
}
