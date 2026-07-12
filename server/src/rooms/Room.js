import { getTrack, DEFAULT_TRACK_ID } from '../game/tracks.js';
import { RaceController } from '../game/RaceController.js';
import { normalizeCarId, CAR_IDS } from '../game/cars.js';
import { getCarStats } from '../game/carCatalog.js';
import { getTrackBarriers } from '../game/trackBarriers.js';
import { BotDriver } from '../game/BotDriver.js';
import { randomInt } from 'node:crypto';

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
    /** @type {Map<string, BotDriver>} */
    this.bots = new Map();
    this._needsBroadcast = false;
    this._botNamesUsed = new Set();
  }

  get track() {
    return getTrack(this.trackId);
  }

  get barriers() {
    return getTrackBarriers(this.track);
  }

  get isFull() {
    return this.players.size >= this.track.maxPlayers;
  }

  addBot() {
    if (this.isFull) return null;
    const id = `bot-${randomInt(0, 1_000_000)}`;
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    const color = CAR_COLORS.find((c) => !usedColors.has(c)) ?? CAR_COLORS[0];
    const carModel = CAR_IDS[randomInt(0, CAR_IDS.length)];
    const player = {
      id,
      name: BotDriver.randomName(this._botNamesUsed),
      userId: null,
      color,
      carModel: normalizeCarId(carModel),
      isBot: true,
      state: null,
      progress: null,
    };
    this.players.set(id, player);
    this.bots.set(id, new BotDriver(player, this.track));
    return player;
  }

  removeBot(botId) {
    const player = this.players.get(botId);
    if (!player?.isBot) return false;
    this.players.delete(botId);
    this.bots.delete(botId);
    this._botNamesUsed.delete(player.name);
    if (this.race) this.race.removePlayer(botId);
    return true;
  }

  updateBots(dt) {
    for (const bot of this.bots.values()) {
      bot.update(dt, this);
    }
  }

  addPlayer(socketId, name, userId, carModel) {
    const usedColors = new Set([...this.players.values()].map((p) => p.color));
    const color = CAR_COLORS.find((c) => !usedColors.has(c)) ?? CAR_COLORS[0];
    const player = {
      id: socketId,
      name,
      userId,
      color,
      carModel: normalizeCarId(carModel),
      state: null, // { p:[x,y,z], r:heading, s:speed }
      progress: null,
    };
    this.players.set(socketId, player);
    return player;
  }

  setPlayerCar(socketId, carModel) {
    const player = this.players.get(socketId);
    if (!player) return false;
    player.carModel = normalizeCarId(carModel);
    const bot = this.bots.get(socketId);
    if (bot) bot._syncCarStats();
    return true;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player?.isBot) this.bots.delete(socketId);
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
    const countdown = this.race.begin();
    this._resetBotsForRace();
    return countdown;
  }

  _resetBotsForRace() {
    const track = this.track;
    for (const [id, bot] of this.bots) {
      const player = this.players.get(id);
      if (player?.progress) bot.resetForRace(player.progress.spawnSlot, track);
    }
  }

  resetToLobby() {
    this.status = ROOM_STATUS.LOBBY;
    this.race = null;
    for (const p of this.players.values()) p.progress = null;
    for (const p of this.players.values()) {
      if (p.isBot) p.state = null;
    }
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
        carModel: p.carModel,
        isBot: Boolean(p.isBot),
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
