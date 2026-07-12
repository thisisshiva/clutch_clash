import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { RaceSession } from './game/RaceSession.js';
import { RemotePlayers } from './game/RemotePlayers.js';
import { StateSync } from './net/StateSync.js';
import { socketClient } from './net/SocketClient.js';
import { VoiceManager } from './voice/VoiceManager.js';
import { loadTracks, getCachedTrack } from './tracks/trackDefinitions.js';
import { authService } from './auth/authService.js';
import { showScreen, clearScreen, toast, setRoomBadge, initRoomBadge } from './ui/dom.js';
import { LoginScreen } from './ui/LoginScreen.js';
import { MainMenuScreen } from './ui/MainMenuScreen.js';
import { MapSelectScreen } from './ui/MapSelectScreen.js';
import { LobbyScreen } from './ui/LobbyScreen.js';
import { HUD } from './ui/HUD.js';
import { createMinimap } from './ui/Minimap.js';
import { ResultsScreen } from './ui/ResultsScreen.js';
import { FriendsScreen } from './ui/FriendsScreen.js';
import { playTheaterIntro } from './ui/TheaterIntro.js';
import { TheaterMusic } from './voice/TheaterMusic.js';
import { getSelectedCarId } from './game/carPreferences.js';
import { preloadCars } from './game/CarFactory.js';

// ---------------------------------------------------------------------------
// App-level singletons
// ---------------------------------------------------------------------------
const engine = new Engine(document.getElementById('game-canvas'));
const input = new Input();
const stateSync = new StateSync();
const remotePlayers = new RemotePlayers(engine.scene, stateSync);
const theaterMusic = new TheaterMusic('/audio/bring-it-together.mp3', { volume: 0.18 });

let tracks = [];
let room = null;          // latest room:update payload
let session = null;       // active RaceSession
let lobby = null;         // { node, refresh }
let hud = null;
let minimap = null;
let resultsView = null;
let voice = null;
let voiceState = 'off';
let countdownTimer = null;
let theaterActive = false;
let theaterHudTimer = null;

// Slow orbit camera when no race is running (menu background vibes).
let menuAngle = 0;
engine.onUpdate((dt) => {
  if (session) {
    session.update(dt);
    remotePlayers.update(dt);
    voice?.update();
  } else {
    menuAngle += dt * 0.06;
    engine.camera.position.set(Math.sin(menuAngle) * 60, 24, Math.cos(menuAngle) * 60);
    engine.camera.lookAt(0, 0, 0);
  }
});
engine.start();

// ---------------------------------------------------------------------------
// Socket wiring
// ---------------------------------------------------------------------------
async function connectSocket() {
  if (socketClient.connected) return;
  const token = await authService.getToken();
  await socketClient.connect({ name: authService.displayName, token });

  socketClient.on('room:update', async (data) => {
    const prevStatus = room?.status;
    room = data;
    setRoomBadge(room.code);
    const sync = remotePlayers.syncPlayers(room.players, socketClient.id);
    if (room.status === 'lobby') {
      await sync;
    } else {
      sync.catch((err) => console.error('Remote player sync failed', err));
    }
    lobby?.refresh();
    updateStandings();
    // Rematch: race finished -> host reset to lobby.
    if (prevStatus === 'finished' && room.status === 'lobby') showLobby();
  });

  socketClient.on('race:countdown', onRaceCountdown);
  socketClient.on('race:spawn', (spawn) => {
    session?.setSpawn(spawn.position, spawn.heading);
  });
  socketClient.on('race:started', () => {
    hud?.showCountdown('GO!');
    setTimeout(() => hud?.showCountdown(null), 900);
    session?.enableControls();
  });
  socketClient.on('race:playerFinished', ({ id, name, place }) => {
    toast(`${id === socketClient.id ? 'You' : name} finished P${place}! 🏁`);
  });
  socketClient.on('race:results', ({ results }) => showResults(results));

  socketClient.on('state:snapshot', (snapshot) => stateSync.ingest(snapshot));

  socketClient.socket.on('disconnect', () => {
    if (room) {
      cleanupRoom();
      toast('Lost connection to the server');
      showMenu();
    }
  });
}

// ---------------------------------------------------------------------------
// Race lifecycle
// ---------------------------------------------------------------------------
function resolveTrackDef(trackId) {
  return tracks.find((t) => t.id === trackId) ?? getCachedTrack(trackId);
}

function startCountdownTimer(startAt) {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const remaining = Math.ceil((startAt - Date.now()) / 1000);
    if (remaining > 0) {
      hud?.showCountdown(String(remaining));
    } else {
      clearInterval(countdownTimer);
    }
  }, 100);
}

async function onRaceCountdown({ startAt }) {
  resultsView?.cancel?.();
  resultsView = null;

  const trackDef = resolveTrackDef(room?.trackId);
  if (!trackDef) {
    toast('Track data missing — refresh and try again');
    return;
  }
  const me = room?.players?.find((p) => p.id === socketClient.id);

  disposeSession();
  stateSync.clear();
  showHud(trackDef);
  hud?.showLoading(true);
  startCountdownTimer(startAt);

  try {
    await startRaceSession(trackDef, me);
    remotePlayers.syncPlayers(room?.players ?? [], socketClient.id)
      .catch((err) => console.error('Remote player sync failed', err));
  } catch (err) {
    console.error('Race start failed', err);
    toast('Failed to load race — try again');
    clearInterval(countdownTimer);
    disposeSession();
    hud = null;
    minimap = null;
    showLobby();
    return;
  }

  hud?.showLoading(false);
}

async function startRaceSession(trackDef, me) {
  if (!trackDef?.controlPoints) {
    throw new Error('Invalid track definition');
  }
  session = await RaceSession.create(
    engine,
    input,
    trackDef,
    me?.carModel,
    stateSync,
    () => room?.players ?? [],
  );
  session.onCheckpointPass = async (index) => {
    const res = await socketClient.request('race:checkpoint', { index });
    if (!res) return;
    if (res.ok) {
      session.applyServerProgress(res);
      updateHudRace();
      if (res.finished) toast('Race complete! 🏆');
    } else if (typeof res.expected === 'number') {
      session.checkpoints.nextIndex = res.expected;
    }
  };
  session.onHealthDepleted = () => toast('Car wrecked! Respawning...');
  session.onCameraChange = (label) => toast(`Camera: ${label}`);

  updateHudRace();
}

function updateHudRace() {
  if (!hud || !session) return;
  hud.setRace(session.lap, session.totalLaps, session.cpDone, session.trackDef.checkpointCount);
}

function updateStandings() {
  if (!hud || !room || room.status === 'lobby') return;
  const sorted = [...room.players].sort((a, b) => {
    const pa = a.progress ?? { finished: false, lap: 0, nextCheckpoint: 0 };
    const pb = b.progress ?? { finished: false, lap: 0, nextCheckpoint: 0 };
    if (pa.finished !== pb.finished) return pa.finished ? -1 : 1;
    if (pa.lap !== pb.lap) return pb.lap - pa.lap;
    return pb.nextCheckpoint - pa.nextCheckpoint;
  });
  hud.setStandings(sorted.map((p) => ({ name: p.name, finished: p.progress?.finished })));
}

function disposeSession() {
  if (!session) return;
  session.dispose();
  session = null;
}

function exitTheater() {
  theaterActive = false;
  clearInterval(theaterHudTimer);
  theaterHudTimer = null;
  theaterMusic.stop();
  disposeSession();
  hud = null;
  minimap = null;
  setRoomBadge(null);
  showMenu();
}

async function startTheaterMode(trackId) {
  const base = resolveTrackDef(trackId);
  if (!base?.controlPoints) {
    toast('Track data missing — refresh and try again');
    return;
  }

  theaterActive = true;
  clearInterval(countdownTimer);
  clearInterval(theaterHudTimer);
  resultsView?.cancel?.();
  resultsView = null;
  disposeSession();
  remotePlayers.clear();
  stateSync.clear();
  room = null;
  lobby = null;
  setRoomBadge(null);

  const trackDef = { ...base, theaterMode: true };
  showHud(trackDef, { theater: true });
  hud?.showLoading(true);

  try {
    session = await RaceSession.create(
      engine,
      input,
      trackDef,
      'range-rover',
      stateSync,
      () => [],
      { theaterMode: true },
    );
    session.onTheaterExit = exitTheater;
  } catch (err) {
    console.error('Theater start failed', err);
    toast('Failed to load theater — try again');
    exitTheater();
    return;
  }

  hud?.showLoading(false);
  session.startTheaterDrive();
  theaterMusic.start();
  const introWords = String(base.name || 'Theater')
    .replace(/[·•|/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toUpperCase());
  await playTheaterIntro(introWords.length ? introWords : ['THEATER']);
  if (!theaterActive || !session) return;
}

function cleanupRoom() {
  clearInterval(countdownTimer);
  clearInterval(theaterHudTimer);
  theaterActive = false;
  theaterMusic.stop(true);
  disposeSession();
  voice?.stop();
  voiceState = 'off';
  remotePlayers.clear();
  stateSync.clear();
  room = null;
  lobby = null;
  hud = null;
  minimap = null;
  resultsView?.cancel?.();
  resultsView = null;
  setRoomBadge(null);
}

async function toggleVoice() {
  if (!voice) {
    voice = new VoiceManager(engine.listener, (peerId) => remotePlayers.getCar(peerId));
  }
  if (voiceState === 'off') {
    const ok = await voice.start();
    voiceState = ok ? 'on' : 'denied';
    if (!ok) toast('Microphone access denied - check browser permissions');
  } else if (voiceState === 'on') {
    voice.setMuted(true);
    voiceState = 'muted';
  } else if (voiceState === 'muted') {
    voice.setMuted(false);
    voiceState = 'on';
  }
  hud?.setVoiceState(voiceState);
  return voiceState === 'on';
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function showLogin() {
  showScreen(LoginScreen({ onDone: showMenu }));
}

async function showMenu() {
  showScreen(MainMenuScreen({
    onCreateRoom: showMapSelect,
    onTheaterMode: showTheaterSelect,
    onJoinRoom: async (code) => {
      const res = await socketClient.request('room:join', {
        code,
        carModel: getSelectedCarId(),
      });
      if (!res.ok) return res.error;
      room = res.room;
      setRoomBadge(room.code);
      showLobby();
      return null;
    },
    onFriends: () => showScreen(FriendsScreen({ onBack: showMenu })),
    onLogout: async () => {
      await authService.signOut();
      showLogin();
    },
  }));

  try {
    await connectSocket();
  } catch {
    toast('Cannot reach the server - is it running?');
  }
}

function showTheaterSelect() {
  showScreen(MapSelectScreen({
    tracks,
    theaterOnly: true,
    onBack: showMenu,
    onSelect: () => {},
    onTheater: (trackId) => startTheaterMode(trackId),
  }));
}

function showMapSelect() {
  showScreen(MapSelectScreen({
    tracks,
    onBack: showMenu,
    onTheater: (trackId) => startTheaterMode(trackId),
    onSelect: async (trackId) => {
      const res = await socketClient.request('room:create', {
        trackId,
        carModel: getSelectedCarId(),
      });
      if (!res.ok) {
        toast(res.error || 'Failed to create room');
        return;
      }
      room = res.room;
      setRoomBadge(room.code);
      showLobby();
    },
  }));
}

function showLobby() {
  disposeSession();
  resultsView?.cancel?.();
  resultsView = null;
  hud = null;
  minimap = null;
  setRoomBadge(room?.code ?? null);
  lobby = LobbyScreen({
    tracks,
    getRoom: () => room,
    localId: () => socketClient.id,
    onSetTrack: (trackId) => socketClient.emit('room:setTrack', { trackId }),
    onSelectCar: async (carId) => {
      const res = await socketClient.request('room:selectCar', { carModel: carId });
      if (!res?.ok) toast(res?.error || 'Could not change car');
    },
    onAddBot: async () => {
      const res = await socketClient.request('room:addBot', {});
      if (!res?.ok) toast(res?.error || 'Could not add bot');
    },
    onRemoveBot: async (id) => {
      const res = await socketClient.request('room:removeBot', { id });
      if (!res?.ok) toast(res?.error || 'Could not remove bot');
    },
    onStart: () => socketClient.emit('race:start'),
    onLeave: leaveRoom,
  });
  showScreen(lobby.node);
}

function showHud(trackDef, { theater = false } = {}) {
  lobby = null;
  clearInterval(theaterHudTimer);
  theaterHudTimer = null;
  minimap = (!theater && trackDef) ? createMinimap(trackDef) : null;
  hud = HUD({
    onToggleVoice: toggleVoice,
    onLeave: theater ? exitTheater : leaveRoom,
    minimap: minimap ?? undefined,
  });
  hud.setVoiceState(voiceState);
  if (theater) hud.setTheaterMode(true);
  showScreen(hud.node);
  if (!theater) updateStandings();

  if (theater) return;

  const speedTimer = setInterval(() => {
    if (!session || !hud) return clearInterval(speedTimer);
    hud.setSpeed(session.physics.speedKmh);
    hud.setHealth(session.physics.healthRatio);
    hud.setBoost(session.physics.boostRatio, session.physics.boostCooldownRatio);

    if (minimap) {
      const opponents = (room?.players ?? [])
        .filter((p) => p.id !== socketClient.id)
        .map((p) => {
          const s = stateSync.sample(p.id);
          if (!s) return null;
          return { x: s.p[0], z: s.p[2], color: p.color };
        })
        .filter(Boolean);
      minimap.update({
        x: session.physics.position.x,
        z: session.physics.position.z,
        heading: session.physics.heading,
      }, opponents);
    }
  }, 100);
}

function showResults(results) {
  clearInterval(countdownTimer);
  disposeSession();
  hud = null;
  minimap = null;
  resultsView?.cancel?.();
  resultsView = ResultsScreen({
    results,
    isHost: room?.hostId === socketClient.id,
    onRematchNow: () => socketClient.emit('race:start'),
    onBackToLobby: () => {
      resultsView?.cancel?.();
      socketClient.emit('room:backToLobby');
    },
    onLeave: leaveRoom,
  });
  showScreen(resultsView.node);
}

function leaveRoom() {
  socketClient.emit('room:leave');
  cleanupRoom();
  showMenu();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  clearScreen();
  initRoomBadge();
  try {
    tracks = await loadTracks();
    preloadCars().catch(() => toast('Some car models failed to load'));
  } catch {
    toast('Could not load track data - start the server and refresh');
  }
  await authService.restoreSession();
  showLogin();
})();
