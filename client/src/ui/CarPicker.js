import { el } from './dom.js';
import { CAR_CATALOG, STAT_LABELS, getCarDef } from '../game/carCatalog.js';
import { getSelectedCarId, setSelectedCarId } from '../game/carPreferences.js';

function statBars(stats) {
  return el('div.car-stats', {},
    ...STAT_LABELS.map(({ key, label }) =>
      el('div.stat-row', {},
        el('span.stat-label', {}, label),
        el('div.stat-bar', {},
          el('div.stat-fill', { style: `width:${stats[key]}%` }),
        ),
      )
    ),
  );
}

/**
 * Car picker grid — reusable in menu and lobby.
 * @param {{ onSelect?: (carId: string) => void, compact?: boolean, carIds?: string[] }} props
 */
export function CarPicker({ onSelect, compact = false, carIds = null }) {
  const grid = el('div.car-grid' + (compact ? '.compact' : ''));
  const detail = compact ? null : el('div.car-detail');
  const allowedCars = carIds?.length
    ? CAR_CATALOG.filter((car) => carIds.includes(car.id))
    : CAR_CATALOG;

  function render(selectedId) {
    const selected = allowedCars.find((car) => car.id === selectedId) ?? allowedCars[0] ?? getCarDef(selectedId);
    if (selected?.id !== selectedId) setSelectedCarId(selected.id);
    grid.replaceChildren(...allowedCars.map((car) =>
      el('div.car-card' + (car.id === selectedId ? '.selected' : ''), {
        onclick: () => {
          setSelectedCarId(car.id);
          render(car.id);
          onSelect?.(car.id);
        },
      },
        el('img.car-thumb', { src: car.preview, alt: car.name, loading: 'lazy' }),
        el('div.car-name', {}, car.name),
      )
    ));
    if (detail) {
      detail.replaceChildren(
        el('div.car-detail-name', {}, selected.name),
        statBars(selected.stats),
      );
    }
  }

  render(getSelectedCarId());
  const node = compact ? grid : el('div', {}, grid, detail);
  return { node, refresh: () => render(getSelectedCarId()) };
}
