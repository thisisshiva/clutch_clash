import { getTrack, DEFAULT_TRACK_ID } from '../game/tracks.js';
import { RaceController } from '../game/RaceController.js';

export const ROOM_STATUS = {
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  RACING: 'racing',
  FINISHED: 'finished',
};

const CAR_COLORS = [
  0xe10600, 0x0090ff, 0xffb800, 0x00d26a,
  0xb14aed, 0xff6b35, 0x00c2d1, 0xf5f5f5,
];

/** Holds the live state of one game room: players, track choice, race. */
export class Room {
  constructor(code, hostSocketId) {
    this.code = code;
    this.hostId = hostSocketId;
    this.trackId = DEFAULT_TRACK_ID;
    this.status = ROOM_STATUS.LOBBY;
    /** @type {Map<string, object>} socketId -> player */
    this.players = new Map();
    this.race = null;
  }

  get track() {
    return getTrack(this.trackId);
  }

  get isFull() {
    return this.players.size >= this.track.maxPlayers;
  }

  addPlayer(socketId, name, userId) {
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    const color = CAR_COLORS.find((c) => !usedColors.has(c)) ?? CAR_COLORS[0];
    const player = {
      id: socketId,
      name,
      userId,
      color,
      state: null, // { p:[x,y,z], r:heading, s:speed }
      progress: null,
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.race) this.race.removePlayer(socketId);
    if (this.hostId === socketId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
    }
  }

  setTrack(trackId) {
    if (this.status !== ROOM_STATUS.LOBBY) return false;
    if (!getTrack(trackId)) return false;
    this.trackId = trackId;
    return true;
  }

  startRace(onEvent) {
    this.race = new RaceController(this, onEvent);
    this.race.begin();
  }

  resetToLobby() {
    this.status = ROOM_STATUS.LOBBY;
    this.race = null;
    for (const p of this.players.values()) p.progress = null;
  }

  /** Lobby/summary info sent on every room:update. */
  toJSON() {
    return {
      code: this.code,
      hostId: this.hostId,
      trackId: this.trackId,
      status: this.status,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        progress: p.progress
          ? { lap: p.progress.lap, nextCheckpoint: p.progress.nextCheckpoint, finished: p.progress.finished }
          : null,
      })),
    };
  }

  /** Compact position snapshot broadcast at tick rate. */
  snapshot() {
    const players = {};
    for (const [id, p] of this.players) {
      if (p.state) players[id] = p.state;
    }
    return { t: Date.now(), players };
  }
}
