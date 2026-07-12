import { el, splitLayout } from './dom.js';

function isTheaterTrack(track) {
  return track?.id === 'road-to-heaven' || track?.id === 'road-to-heaven-snow';
}

/**
 * Track picker - used when creating a room or entering theater mode.
 * @param {{
 *   tracks: Array,
 *   onSelect: (trackId: string) => void,
 *   onTheater?: (trackId: string) => void,
 *   onBack: () => void,
 *   theaterOnly?: boolean,
 * }} props
 */
export function MapSelectScreen({ tracks, onSelect, onTheater, onBack, theaterOnly = false }) {
  const list = theaterOnly ? tracks.filter(isTheaterTrack) : tracks;
  let selectedId = list[0]?.id;
  const previewName = el('div.logo', { style: 'font-size:clamp(28px,4vw,44px)' });
  const previewMeta = el('div.game-pane-meta');
  const theaterBtn = el('button.btn.secondary', {
    onclick: () => onTheater?.(selectedId),
  }, 'Theater Mode');

  function updatePreview(track) {
    previewName.textContent = track?.name ?? 'Select Track';
    previewMeta.textContent = track
      ? `${track.description} · ${track.checkpointCount} CP · ${track.laps} laps · ${track.length}m`
      : '';
    const showTheater = !!onTheater && isTheaterTrack(track);
    theaterBtn.style.display = showTheater || theaterOnly ? '' : 'none';
  }

  const cards = list.map((t) =>
    el('div.track-card', {
      dataset: { id: t.id },
      onclick: () => {
        selectedId = t.id;
        for (const c of cards) c.classList.toggle('selected', c.dataset.id === t.id);
        updatePreview(list.find((tr) => tr.id === t.id));
      },
    },
      el('div.t-name', {}, t.name),
      el('div.t-meta', {}, `${t.checkpointCount} CP · ${t.laps} laps`),
      el('div.t-desc', {}, t.description),
    )
  );
  cards[0]?.classList.add('selected');
  updatePreview(list[0]);

  return splitLayout(
    [
      el('div.game-pane-label', {}, theaterOnly ? 'Theater preview' : 'Track preview'),
      previewName,
      previewMeta,
    ],
    [
      el('h2', {}, theaterOnly ? 'Theater Mode' : 'Choose Track'),
      el('div.track-grid', {}, cards),
      el('div.row', { style: 'margin-top:14px; flex-wrap:wrap; gap:8px' },
        el('button.btn.secondary', { onclick: onBack }, 'Back'),
        theaterOnly
          ? el('button.btn', { onclick: () => onTheater?.(selectedId) }, 'Enter Theater')
          : el('button.btn', { onclick: () => onSelect(selectedId) }, 'Create Room'),
        theaterOnly ? null : theaterBtn,
      ),
    ],
  );
}
