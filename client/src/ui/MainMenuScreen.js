import { el } from './dom.js';
import { authService } from '../auth/authService.js';

/**
 * @param {{
 *   onCreateRoom: () => void,
 *   onJoinRoom: (code: string) => Promise<string|null>,
 *   onFriends: () => void,
 *   onLogout: () => void,
 * }} callbacks
 */
export function MainMenuScreen({ onCreateRoom, onJoinRoom, onFriends, onLogout }) {
  const error = el('div.error-msg');
  const codeInput = el('input', {
    type: 'text', placeholder: 'ROOM CODE', maxLength: 6,
    style: 'text-transform:uppercase; letter-spacing:6px; text-align:center; font-family:Orbitron',
    onkeydown: (e) => { if (e.key === 'Enter') join(); },
  });

  async function join() {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 6) {
      error.textContent = '6 character ka code chahiye';
      return;
    }
    error.textContent = '';
    const err = await onJoinRoom(code);
    if (err) error.textContent = err;
  }

  return el('div.screen', {},
    el('div.logo', {}, 'Clutch Clash'),
    el('div.tagline', {}, `Welcome, ${authService.displayName}`),
    el('div.panel', { style: 'width:400px' },
      el('div.stack', {},
        el('button.btn', { onclick: onCreateRoom }, 'Room Banao'),
        el('h3', {}, 'Ya Room Join Karo'),
        codeInput,
        error,
        el('button.btn.secondary', { onclick: join }, 'Join Room'),
        authService.isLoggedIn
          ? el('button.btn.secondary', { onclick: onFriends }, 'Friends')
          : null,
        el('button.btn.secondary', { onclick: onLogout },
          authService.isLoggedIn ? 'Logout' : 'Naam Badlo'),
      ),
    ),
  );
}
