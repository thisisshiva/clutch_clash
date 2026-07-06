import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { RaceSession } from './game/RaceSession.js';
import { RemotePlayers } from './game/RemotePlayers.js';
import { StateSync } from './net/StateSync.js';
import { socketClient } from './net/SocketClient.js';
import { VoiceManager } from './voice/VoiceManager.js';
import { loadTracks } from './tracks/trackDefinitions.js';
import { authService } from './auth/authService.js';
import { showScreen, clearScreen, toast } from './ui/dom.js';
import { LoginScreen } from './ui/LoginScreen.js';
import { MainMenuScreen } from './ui/MainMenuScreen.js';
import { MapSelectScreen } from './ui/MapSelectScreen.js';
import { LobbyScreen } from './ui/LobbyScreen.js';
import { HUD } from './ui/HUD.js';
import { ResultsScreen } from './ui/ResultsScreen.js';
import { FriendsScreen } from './ui/FriendsScreen.js';

// ---------------------------------------------------------------------------
// App-level singletons
// ---------------------------------------------------------------------------
const engine = new Engine(document.getElementById('game-canvas'));
const input = new Input();
const stateSync = new StateSync();
const remotePlayers = new RemotePlayers(engine.scene, stateSync);

let tracks = [];
let room = null;          // latest room:update payload
let session = null;       // active RaceSession
let lobby = null;         // { node, refresh }
let hud = null;
let voice = null;
let voiceState = 'off';
let countdownTimer = null;

// Slow orbit camera when no race is running (menu background vibes).
let menuAngle = 0;
engine.onUpdate((dt) => {
  if (session) {
    session.update(dt);
    remotePlayers.update();
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

  socketClient.on('room:update', (data) => {
    const prevStatus = room?.status;
    room = data;
    remotePlayers.syncPlayers(room.players, socketClient.id);
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
    toast(`${id === socketClient.id ? 'Tum' : name} P${place} pe finish! 🏁`);
  });
  socketClient.on('race:results', ({ results }) => showResults(results));

  socketClient.on('state:snapshot', (snapshot) => stateSync.ingest(snapshot));

  socketClient.socket.on('disconnect', () => {
    if (room) {
      cleanupRoom();
      toast('Server se connection toot gaya');
      showMenu();
    }
  });
}

// ---------------------------------------------------------------------------
// Race lifecycle
// ---------------------------------------------------------------------------
function onRaceCountdown({ startAt }) {
  const trackDef = tracks.find((t) => t.id === room.trackId);
  const me = room.players.find((p) => p.id === socketClient.id);

  disposeSession();
  session = new RaceSession(engine, input, trackDef, me?.color ?? 0xe10600);
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

  showHud();
  updateHudRace();

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

function cleanupRoom() {
  clearInterval(countdownTimer);
  disposeSession();
  voice?.stop();
  voiceState = 'off';
  remotePlayers.clear();
  stateSync.clear();
  room = null;
  lobby = null;
  hud = null;
}

async function toggleVoice() {
  if (!voice) {
    voice = new VoiceManager(engine.listener, (peerId) => remotePlayers.getCar(peerId));
  }
  if (voiceState === 'off') {
    const ok = await voice.start();
    voiceState = ok ? 'on' : 'denied';
    if (!ok) toast('Mic access nahi mila - browser permission check karo');
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
  showScreen(LoginScreen({ onDone: () => showMenu() }));
}

async function showMenu() {
  try {
    await connectSocket();
  } catch {
    toast('Server nahi mil raha - kya server chalu hai?');
  }
  showScreen(MainMenuScreen({
    onCreateRoom: showMapSelect,
    onJoinRoom: async (code) => {
      const res = await socketClient.request('room:join', { code });
      if (!res.ok) return res.error;
      room = res.room;
      showLobby();
      return null;
    },
    onFriends: () => showScreen(FriendsScreen({ onBack: showMenu })),
    onLogout: async () => {
      await authService.signOut();
      showLogin();
    },
  }));
}

function showMapSelect() {
  showScreen(MapSelectScreen({
    tracks,
    onBack: showMenu,
    onSelect: async (trackId) => {
      const res = await socketClient.request('room:create', { trackId });
      if (!res.ok) {
        toast(res.error || 'Room create nahi hua');
        return;
      }
      room = res.room;
      showLobby();
    },
  }));
}

function showLobby() {
  disposeSession();
  hud = null;
  lobby = LobbyScreen({
    tracks,
    getRoom: () => room,
    localId: () => socketClient.id,
    onSetTrack: (trackId) => socketClient.emit('room:setTrack', { trackId }),
    onStart: () => socketClient.emit('race:start'),
    onLeave: leaveRoom,
  });
  showScreen(lobby.node);
}

function showHud() {
  lobby = null;
  hud = HUD({ onToggleVoice: toggleVoice, onLeave: leaveRoom });
  hud.setVoiceState(voiceState);
  showScreen(hud.node);
  updateStandings();

  // Speed readout at ~10Hz.
  const speedTimer = setInterval(() => {
    if (!session || !hud) return clearInterval(speedTimer);
    hud.setSpeed(session.physics.speedKmh);
  }, 100);
}

function showResults(results) {
  clearInterval(countdownTimer);
  disposeSession();
  hud = null;
  showScreen(ResultsScreen({
    results,
    isHost: room?.hostId === socketClient.id,
    onBackToLobby: () => socketClient.emit('room:backToLobby'),
    onLeave: leaveRoom,
  }));
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
  try {
    tracks = await loadTracks();
  } catch {
    toast('Server se track data nahi mila - server start karke refresh karo');
  }
  await authService.restoreSession();
  showLogin();
})();
