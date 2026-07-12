import { el } from './dom.js';

/**
 * In-race HUD: speed, lap/checkpoint counters, live standings, voice toggle.
 * @param {{
 *   onToggleVoice: () => Promise<boolean>,
 *   onLeave: () => void,
 *   minimap?: { node: HTMLElement },
 * }} props
 */
export function HUD({ onToggleVoice, onLeave, minimap }) {
  const speedVal = el('div.val', {}, '0');
  const lapEl = el('span');
  const cpEl = el('span');
  const standingsEl = el('div.hud-standings');
  const countdownEl = el('div.countdown', { style: 'display:none' });
  const loadingEl = el('div.hud-loading', { style: 'display:none' }, 'Loading race…');
  const healthFill = el('div.hud-bar-fill.health');
  const boostFill = el('div.hud-bar-fill.boost');

  const voiceBtn = el('button.btn.secondary.small', {
    onclick: async () => {
      voiceBtn.disabled = true;
      await onToggleVoice();
      voiceBtn.disabled = false;
    },
  }, 'Voice: Off');

  const node = el('div.hud', {},
    minimap?.node ?? null,
    el('div.hud-race', {}, el('span', {}, 'Lap ', lapEl), el('span', {}, 'CP ', cpEl)),
    el('div.hud-bars', {},
      el('div.hud-bar-row', {},
        el('span.hud-bar-label', {}, 'HP'),
        el('div.hud-bar', {}, healthFill),
      ),
      el('div.hud-bar-row', {},
        el('span.hud-bar-label', {}, 'NOS'),
        el('div.hud-bar', {}, boostFill),
      ),
    ),
    standingsEl,
    el('div.hud-controls', {},
      voiceBtn,
      el('button.btn.secondary.small', { onclick: onLeave }, 'Leave'),
    ),
    el('div.hud-speed', {}, speedVal, el('div.unit', {}, 'KM/H')),
    loadingEl,
    countdownEl,
    el('div.hud-hint', {}, 'W/S: drive · A/D: steer · Space: handbrake · Shift: boost · R: respawn · C: cycle camera'),
  );

  return {
    node,
    setSpeed(kmh) {
      speedVal.textContent = String(kmh);
    },
    setRace(lap, totalLaps, cpDone, cpTotal) {
      lapEl.textContent = '';
      lapEl.append(el('b', {}, String(lap)), `/${totalLaps}`);
      cpEl.textContent = '';
      cpEl.append(el('b', {}, String(cpDone)), `/${cpTotal}`);
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
    showLoading(visible) {
      loadingEl.style.display = visible ? '' : 'none';
    },
    setVoiceState(state) {
      const labels = { off: 'Voice: Off', on: 'Voice: On', muted: 'Muted', denied: 'Mic blocked' };
      voiceBtn.textContent = labels[state] ?? 'Voice';
      voiceBtn.disabled = state === 'denied';
    },
    setHealth(ratio) {
      healthFill.style.width = `${Math.round(ratio * 100)}%`;
    },
    setBoost(activeRatio, cooldownRatio) {
      if (activeRatio > 0) {
        boostFill.style.width = `${Math.round(activeRatio * 100)}%`;
        boostFill.classList.add('active');
        boostFill.classList.remove('cooldown');
      } else if (cooldownRatio > 0) {
        boostFill.style.width = `${Math.round((1 - cooldownRatio) * 100)}%`;
        boostFill.classList.add('cooldown');
        boostFill.classList.remove('active');
      } else {
        boostFill.style.width = '100%';
        boostFill.classList.remove('active', 'cooldown');
      }
    },
  };
}
