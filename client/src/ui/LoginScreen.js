import { el } from './dom.js';
import { authService } from '../auth/authService.js';
import { isSupabaseEnabled } from '../auth/supabaseClient.js';

/**
 * Login / signup / guest entry screen.
 * @param {{ onDone: () => void }} callbacks
 */
export function LoginScreen({ onDone }) {
  const error = el('div.error-msg');
  let mode = 'guest'; // 'guest' | 'signin' | 'signup'

  const nameInput = el('input', {
    type: 'text', placeholder: 'Apna racer naam likho',
    maxLength: 20, value: authService.guestName,
  });
  const emailInput = el('input', { type: 'email', placeholder: 'email@example.com' });
  const passInput = el('input', { type: 'password', placeholder: 'Password (min 6 chars)' });
  const userInput = el('input', { type: 'text', placeholder: 'Unique username', maxLength: 20 });

  const guestFields = el('div.stack', {},
    el('div.field', {}, el('label', {}, 'Racer Name'), nameInput),
  );
  const signinFields = el('div.stack', { style: 'display:none' },
    el('div.field', {}, el('label', {}, 'Email'), emailInput),
    el('div.field', {}, el('label', {}, 'Password'), passInput),
  );
  const signupExtra = el('div.field', { style: 'display:none' },
    el('label', {}, 'Username'), userInput,
  );

  const submitBtn = el('button.btn', { onclick: submit }, 'Race Shuru Karo');

  const tabs = ['guest', 'signin', 'signup'].map((m) =>
    el('div.tab', {
      onclick: () => setMode(m),
      dataset: { mode: m },
    }, m === 'guest' ? 'Guest' : m === 'signin' ? 'Login' : 'Sign Up')
  );

  function setMode(m) {
    mode = m;
    error.textContent = '';
    for (const t of tabs) t.classList.toggle('active', t.dataset.mode === m);
    guestFields.style.display = m === 'guest' ? '' : 'none';
    signinFields.style.display = m === 'guest' ? 'none' : '';
    signupExtra.style.display = m === 'signup' ? '' : 'none';
    submitBtn.textContent = m === 'guest' ? 'Race Shuru Karo' : m === 'signin' ? 'Login' : 'Create Account';
  }

  async function submit() {
    error.textContent = '';
    try {
      submitBtn.disabled = true;
      if (mode === 'guest') {
        const name = nameInput.value.trim();
        if (!name) throw new Error('Naam to likho pehle!');
        authService.playAsGuest(name);
      } else if (mode === 'signin') {
        await authService.signIn(emailInput.value.trim(), passInput.value);
      } else {
        const username = userInput.value.trim();
        if (username.length < 3) throw new Error('Username kam se kam 3 characters ka ho');
        await authService.signUp(emailInput.value.trim(), passInput.value, username);
      }
      onDone();
    } catch (e) {
      error.textContent = e.message;
    } finally {
      submitBtn.disabled = false;
    }
  }

  setMode('guest');

  const authNote = isSupabaseEnabled
    ? null
    : el('div.hint', {}, 'Login/Signup ke liye Supabase configure karna hoga (.env) - abhi Guest mode chalega.');
  if (!isSupabaseEnabled) {
    tabs[1].style.display = 'none';
    tabs[2].style.display = 'none';
  }

  return el('div.screen', {},
    el('div.logo', {}, 'Clutch Clash'),
    el('div.tagline', {}, 'Multiplayer F1 Racing - Dosto ke saath full speed'),
    el('div.panel', { style: 'width:400px' },
      el('div.tabs', {}, tabs),
      guestFields,
      signinFields,
      signupExtra,
      error,
      submitBtn,
      authNote,
    ),
  );
}
