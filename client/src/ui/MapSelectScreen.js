import { el, splitLayout } from './dom.js';

/**
 * Track picker - used when creating a room.
 * @param {{ tracks: Array, onSelect: (trackId: string) => void, onBack: () => void }} props
 */
export function MapSelectScreen({ tracks, onSelect, onBack }) {
  let selectedId = tracks[0]?.id;
  const previewName = el('div.logo', { style: 'font-size:clamp(28px,4vw,44px)' });
  const previewMeta = el('div.game-pane-meta');

  function updatePreview(track) {
    previewName.textContent = track?.name ?? 'Select Track';
    previewMeta.textContent = track
      ? `${track.description} · ${track.checkpointCount} CP · ${track.laps} laps · ${track.length}m`
      : '';
  }

  const cards = tracks.map((t) =>
    el('div.track-card', {
      dataset: { id: t.id },
      onclick: () => {
        selectedId = t.id;
        for (const c of cards) c.classList.toggle('selected', c.dataset.id === t.id);
        updatePreview(tracks.find((tr) => tr.id === t.id));
      },
    },
      el('div.t-name', {}, t.name),
      el('div.t-meta', {}, `${t.checkpointCount} CP · ${t.laps} laps`),
      el('div.t-desc', {}, t.description),
    )
  );
  cards[0]?.classList.add('selected');
  updatePreview(tracks[0]);

  return splitLayout(
    [
      el('div.game-pane-label', {}, 'Track preview'),
      previewName,
      previewMeta,
    ],
    [
      el('h2', {}, 'Choose Track'),
      el('div.track-grid', {}, cards),
      el('div.row', { style: 'margin-top:14px' },
        el('button.btn.secondary', { onclick: onBack }, 'Back'),
        el('button.btn', { onclick: () => onSelect(selectedId) }, 'Create Room'),
      ),
    ],
  );
}
