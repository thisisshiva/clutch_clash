import { el } from './dom.js';

/**
 * In-race HUD: speed, lap/checkpoint counters, live standings, voice toggle.
 * @param {{ onToggleVoice: () => Promise<boolean>, onLeave: () => void }} props
 * @returns {{ node, setSpeed, setRace, setStandings, showCountdown, setVoiceState }}
 */
export function HUD({ onToggleVoice, onLeave }) {
  const speedVal = el('div.val', {}, '0');
  const lapEl = el('span');
  const cpEl = el('span');
  const standingsEl = el('div.hud-standings');
  const countdownEl = el('div.countdown', { style: 'display:none' });

  const voiceBtn = el('button.btn.secondary.small', {
    onclick: async () => {
      voiceBtn.disabled = true;
      await onToggleVoice();
      voiceBtn.disabled = false;
    },
  }, 'Voice: Off');

  const node = el('div.hud', {},
    el('div.hud-race', {}, el('span', {}, 'Lap ', lapEl), el('span', {}, 'CP ', cpEl)),
    standingsEl,
    el('div.hud-controls', {},
      voiceBtn,
      el('button.btn.secondary.small', { onclick: onLeave }, 'Leave'),
    ),
    el('div.hud-speed', {}, speedVal, el('div.unit', {}, 'KM/H')),
    countdownEl,
    el('div.hud-hint', {}, 'W/S: accelerate · A/D: steer · Space: handbrake · R: respawn'),
  );

  return {
    node,
    setSpeed(kmh) {
      speedVal.textContent = String(kmh);
    },
    setRace(lap, totalLaps, cpDone, cpTotal) {
      lapEl.innerHTML = `<b>${lap}</b>/${totalLaps}`;
      cpEl.innerHTML = `<b>${cpDone}</b>/${cpTotal}`;
    },
    setStandings(rows) {
      standingsEl.replaceChildren(...rows.map((r, i) =>
        el('div', {},
          el('span.pos', {}, `${i + 1}.`),
          el('span', {}, r.name + (r.finished ? ' 🏁' : '')),
        )
      ));
    },
    showCountdown(text) {
      if (text == null) {
        countdownEl.style.display = 'none';
      } else {
        countdownEl.style.display = '';
        countdownEl.textContent = text;
      }
    },
    setVoiceState(state) {
      // state: 'off' | 'on' | 'muted' | 'denied'
      const labels = { off: 'Voice: Off', on: 'Voice: On', muted: 'Muted', denied: 'Mic blocked' };
      voiceBtn.textContent = labels[state] ?? 'Voice';
      voiceBtn.disabled = state === 'denied';
    },
  };
}
