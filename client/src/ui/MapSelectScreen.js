import { el, splitLayout } from './dom.js';

function isTheaterTrack(track) {
  return track?.kind === '2d'
    || track?.id === 'road-to-heaven'
    || track?.id === 'road-to-heaven-snow'
    || track?.id === 'north-path'
    || track?.id === 'chapmans-peak'
    || track?.id === 'black-hole'
    || track?.id === 'road-to-endless'
    || track?.id === 'mt-fuji-dawn'
    || track?.id === 'mt-fuji-day'
    || track?.id === 'mt-fuji-night'
    || track?.id === 'mt-fuji-autumn';
}

function trackKind(track) {
  return track?.kind === '2d' ? '2d' : '3d';
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
  const baseList = theaterOnly ? tracks.filter(isTheaterTrack) : tracks;
  let activeKind = baseList.some((t) => trackKind(t) === '2d') && !baseList.some((t) => trackKind(t) === '3d')
    ? '2d'
    : '3d';
  if (theaterOnly && baseList.some((t) => trackKind(t) === '2d')) {
    // Prefer 3d theater list when both exist; user can switch tabs.
    activeKind = baseList.some((t) => trackKind(t) === '3d') ? '3d' : '2d';
  }

  let selectedId = null;
  const previewName = el('div.logo', { style: 'font-size:clamp(28px,4vw,44px)' });
  const previewMeta = el('div.game-pane-meta');
  const theaterBtn = el('button.btn.secondary', {
    onclick: () => onTheater?.(selectedId),
  }, 'Theater Mode');
  const grid = el('div.track-grid');
  const tab3d = el('button.btn.small.secondary', {}, '3D Tracks');
  const tab2d = el('button.btn.small.secondary', {}, '2D Roads');
  const tabs = el('div.row', { style: 'margin-bottom:12px; flex-wrap:wrap; gap:8px; justify-content:center' },
    tab3d,
    tab2d,
  );

  function visibleList() {
    return baseList.filter((t) => trackKind(t) === activeKind);
  }

  function updatePreview(track) {
    previewName.textContent = track?.name ?? 'Select Track';
    previewMeta.textContent = track
      ? `${track.description} · ${track.checkpointCount} CP · ${track.laps} laps · ${track.length}m`
      : '';
    const showTheater = !!onTheater && isTheaterTrack(track);
    theaterBtn.style.display = showTheater || theaterOnly ? '' : 'none';
  }

  function renderCards() {
    const list = visibleList();
    grid.replaceChildren();
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
    for (const card of cards) grid.appendChild(card);

    if (!list.some((t) => t.id === selectedId)) {
      selectedId = list[0]?.id ?? null;
    }
    for (const c of cards) c.classList.toggle('selected', c.dataset.id === selectedId);
    updatePreview(list.find((t) => t.id === selectedId) ?? null);

    tab3d.className = activeKind === '3d' ? 'btn small' : 'btn small secondary';
    tab2d.className = activeKind === '2d' ? 'btn small' : 'btn small secondary';
  }

  tab3d.onclick = () => {
    activeKind = '3d';
    renderCards();
  };
  tab2d.onclick = () => {
    activeKind = '2d';
    renderCards();
  };

  renderCards();

  return splitLayout(
    [
      el('div.game-pane-label', {}, theaterOnly ? 'Theater preview' : 'Track preview'),
      previewName,
      previewMeta,
    ],
    [
      el('h2', {}, theaterOnly ? 'Theater Mode' : 'Choose Track'),
      tabs,
      grid,
      el('div.row', { style: 'margin-top:14px; flex-wrap:wrap; gap:8px' },
        el('button.btn.secondary', { onclick: onBack }, 'Back'),
        theaterOnly
          ? el('button.btn', { onclick: () => onTheater?.(selectedId) }, 'Enter Theater')
          : el('button.btn', {
            onclick: () => {
              if (selectedId) onSelect(selectedId);
            },
          }, 'Create Room'),
        theaterOnly ? null : theaterBtn,
      ),
    ],
  );
}
