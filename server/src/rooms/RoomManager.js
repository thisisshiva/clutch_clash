import { Room } from './Room.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I

/** Singleton registry of all active rooms. */
class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} code -> Room */
    this.rooms = new Map();
    /** @type {Map<string, string>} socketId -> room code */
    this.socketRoom = new Map();
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: 6 }, () =>
        CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId) {
    const room = new Room(this.generateCode(), hostSocketId);
    this.rooms.set(room.code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(String(code || '').toUpperCase()) || null;
  }

  getRoomOfSocket(socketId) {
    const code = this.socketRoom.get(socketId);
    return code ? this.rooms.get(code) || null : null;
  }

  bindSocket(socketId, code) {
    this.socketRoom.set(socketId, code);
  }

  /** Removes the socket from its room. Returns the room (or null). */
  unbindSocket(socketId) {
    const room = this.getRoomOfSocket(socketId);
    this.socketRoom.delete(socketId);
    if (!room) return null;
    room.removePlayer(socketId);
    if (room.players.size === 0) {
      if (room.race) room.race.dispose();
      this.rooms.delete(room.code);
      return null;
    }
    return room;
  }
}

export const roomManager = new RoomManager();
