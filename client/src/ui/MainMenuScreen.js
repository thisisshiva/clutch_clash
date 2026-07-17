import { el, splitLayout } from './dom.js';
import { authService } from '../auth/authService.js';
import { CarPicker } from './CarPicker.js';
import { HOME_CAR_IDS } from '../game/carCatalog.js';

/**
 * @param {{
 *   onCreateRoom: () => void,
 *   onTheaterMode: () => void,
 *   onJoinRoom: (code: string) => Promise<string|null>,
 *   onFriends: () => void,
 *   onLogout: () => void,
 * }} callbacks
 */
export function MainMenuScreen({ onCreateRoom, onTheaterMode, onJoinRoom, onFriends, onLogout }) {
  const error = el('div.error-msg');
  const codeInput = el('input', {
    type: 'text', placeholder: 'ROOM CODE', maxLength: 6,
    style: 'text-transform:uppercase; letter-spacing:6px; text-align:center; font-family:Orbitron',
    onkeydown: (e) => { if (e.key === 'Enter') join(); },
  });

  async function join() {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
      error.textContent = 'Room code must be 6 characters';
      return;
    }
    error.textContent = '';
    const err = await onJoinRoom(code);
    if (err) error.textContent = err;
  }

  return splitLayout(
    [
      el('div.game-pane-label', {}, 'Live preview'),
      el('div.logo', {}, 'Slow Lane'),
      el('div.tagline', {}, `Welcome, ${authService.displayName}`),
      el('div.game-pane-meta', {}, 'Join a friend\'s room or create your own race.'),
      el('div.pane-section', {},
        el('h3', {}, 'Join Room'),
        codeInput,
        error,
        el('button.btn.secondary', { onclick: join }, 'Join Room'),
      ),
      el('div.pane-section.pane-actions', {},
        authService.isLoggedIn
          ? el('button.btn.secondary', { onclick: onFriends }, 'Friends')
          : null,
        el('button.btn.secondary', { onclick: onLogout },
          authService.isLoggedIn ? 'Logout' : 'Change Name'),
      ),
    ],
    [
      el('h2', {}, 'Garage'),
      CarPicker({ carIds: HOME_CAR_IDS }).node,
      el('button.btn', { style: 'margin-top:14px', onclick: onCreateRoom }, 'Create Room'),
      el('button.btn.secondary', { style: 'margin-top:10px', onclick: onTheaterMode }, 'Theater Mode'),
    ],
  );
}
