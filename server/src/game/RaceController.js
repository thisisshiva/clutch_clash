import { ROOM_STATUS } from '../rooms/Room.js';
import { getCarStats } from './carCatalog.js';

const COUNTDOWN_MS = 3000;
const RACE_TIMEOUT_MS = 10 * 60 * 1000; // safety: end race after 10 min
// How far from the checkpoint gate a reported position may be and still count.
const CHECKPOINT_TOLERANCE_FACTOR = 1.6;

/**
 * Server-authoritative race logic for one room: countdown, checkpoint order
 * validation, lap counting and finish order. Emits events via the injected
 * `onEvent(event, payload)` callback (wired to the room's socket broadcast).
 */
export class RaceController {
  constructor(room, onEvent) {
    this.room = room;
    this.onEvent = onEvent;
    this.startTime = 0;
    this.finishCounter = 0;
    this.timers = [];
  }

  begin() {
    const { room } = this;
    room.status = ROOM_STATUS.COUNTDOWN;
    const track = room.track;

    let slot = 0;
    for (const player of room.players.values()) {
      const spawn = track.spawnPoints[slot % track.spawnPoints.length];
      player.progress = {
        nextCheckpoint: 0,
        lap: 1,
        finished: false,
        finishTime: null,
        place: null,
        spawnSlot: slot,
      };
      player.state = {
        p: [...spawn.position],
        r: spawn.heading,
        s: 0,
        h: getCarStats(player.carModel).health,
      };
      slot++;
    }

    const startAt = Date.now() + COUNTDOWN_MS;

    this.timers.push(setTimeout(() => {
      room.status = ROOM_STATUS.RACING;
      this.startTime = Date.now();
      this.onEvent('race:started', { startTime: this.startTime });
    }, COUNTDOWN_MS));

    this.timers.push(setTimeout(() => this.endRace(), COUNTDOWN_MS + RACE_TIMEOUT_MS));

    return { startAt, countdownMs: COUNTDOWN_MS };
  }

  /**
   * Player claims to have crossed checkpoint `index`. Validate the order and
   * that their last reported position is actually near that gate.
   */
  handleCheckpoint(socketId, index) {
    const { room } = this;
    if (room.status !== ROOM_STATUS.RACING) return null;
    const player = room.players.get(socketId);
    if (!player?.progress || player.progress.finished) return null;

    const progress = player.progress;
    if (index !== progress.nextCheckpoint) {
      return { ok: false, expected: progress.nextCheckpoint };
    }

    const track = room.track;
    const gate = track.checkpoints[index];
    const pos = player.state?.p;
    if (!pos) return null;
    const dist = Math.hypot(pos[0] - gate.position[0], pos[2] - gate.position[2]);
    if (dist > track.roadWidth * CHECKPOINT_TOLERANCE_FACTOR) {
      return { ok: false, expected: progress.nextCheckpoint };
    }

    progress.nextCheckpoint = (index + 1) % track.checkpointCount;

    if (track.closed === false && index === track.checkpointCount - 1) {
      this.finishPlayer(player);
      return { ok: true, finished: true, lap: 1 };
    }

    // Crossing the start/finish gate (index 0) after the final checkpoint
    // completes a lap.
    if (progress.nextCheckpoint === 1 && index === 0) {
      // First crossing of gate 0 at race start is the initial pass; laps
      // advance only when the player has been around (lapProgress flag).
      if (progress.lapStarted) {
        progress.lap++;
        if (progress.lap > track.laps) {
          this.finishPlayer(player);
          return { ok: true, finished: true, lap: track.laps };
        }
      } else {
        progress.lapStarted = true;
      }
    }

    return { ok: true, lap: progress.lap, nextCheckpoint: progress.nextCheckpoint };
  }

  finishPlayer(player) {
    const progress = player.progress;
    progress.finished = true;
    progress.finishTime = Date.now() - this.startTime;
    progress.place = ++this.finishCounter;
    this.onEvent('race:playerFinished', {
      id: player.id,
      name: player.name,
      place: progress.place,
      timeMs: progress.finishTime,
    });
    const allDone = [...this.room.players.values()].every((p) => p.progress?.finished);
    if (allDone) this.endRace();
  }

  removePlayer(socketId) {
    if (this.room.status === ROOM_STATUS.RACING || this.room.status === ROOM_STATUS.COUNTDOWN) {
      const remaining = [...this.room.players.values()];
      if (remaining.length > 0 && remaining.every((p) => p.progress?.finished)) {
        this.endRace();
      }
    }
  }

  endRace() {
    if (this.room.status === ROOM_STATUS.FINISHED) return;
    this.room.status = ROOM_STATUS.FINISHED;
    this.dispose();
    const results = [...this.room.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        finished: Boolean(p.progress?.finished),
        place: p.progress?.place ?? null,
        timeMs: p.progress?.finishTime ?? null,
        lap: p.progress?.lap ?? 1,
      }))
      .sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) return a.place - b.place;
        return b.lap - a.lap;
      });
    this.onEvent('race:results', { results });
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
