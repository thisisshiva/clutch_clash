/** Tiny DOM helper: el('div.panel', {onclick}, children...) */
export function el(spec, props = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key in node) {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

const root = () => document.getElementById('ui-root');

export function showScreen(node) {
  root().replaceChildren(node);
}

export function clearScreen() {
  root().replaceChildren();
}

export function addOverlay(node) {
  root().append(node);
  return () => node.remove();
}

export function toast(message) {
  const node = el('div.toast', {}, message);
  root().append(node);
  setTimeout(() => node.remove(), 2400);
}

let roomBadgeEl = null;

export function initRoomBadge() {
  roomBadgeEl = document.getElementById('room-badge');
}

export function setRoomBadge(code) {
  if (!roomBadgeEl) roomBadgeEl = document.getElementById('room-badge');
  if (!roomBadgeEl) return;
  if (!code) {
    roomBadgeEl.classList.add('hidden');
    roomBadgeEl.textContent = '';
    return;
  }
  roomBadgeEl.classList.remove('hidden');
  roomBadgeEl.textContent = code;
}

export function formatTime(ms) {
  if (ms == null) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor(ms % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(t).padStart(3, '0')}`;
}

/** Two-pane card: game preview left, config panel right (inside centered .screen). */
export function splitLayout(gameChildren, configChildren) {
  const preview = el('div.dual-pane-preview');
  for (const child of [gameChildren].flat()) {
    if (child != null) preview.append(child);
  }
  const config = el('div.dual-pane-config', {}, ...configChildren);
  return el('div.screen', {}, el('div.dual-pane', {}, preview, config));
}
