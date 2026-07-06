import { roomManager } from '../rooms/RoomManager.js';
import { ROOM_STATUS } from '../rooms/Room.js';
import { broadcastRoom } from './lobbyHandlers.js';

export function registerRaceHandlers(io, socket) {
  socket.on('race:start', () => {
    const room = roomManager.getRoomOfSocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== ROOM_STATUS.LOBBY && room.status !== ROOM_STATUS.FINISHED) return;

    room.startRace((event, payload) => io.to(room.code).emit(event, payload));
    broadcastRoom(io, room);
    // Send each player their assigned spawn slot.
    for (const player of room.players.values()) {
      io.to(player.id).emit('race:spawn', {
        slot: player.progress.spawnSlot,
        position: player.state.p,
        heading: player.state.r,
      });
    }
  });

  // High-frequency position updates. Stored on the player; broadcast happens
  // on the room tick (see index.js) to keep payload count bounded.
  socket.on('player:state', (state) => {
    const room = roomManager.getRoomOfSocket(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    if (!Array.isArray(state?.p) || state.p.length !== 3) return;
    player.state = {
      p: [Number(state.p[0]) || 0, Number(state.p[1]) || 0, Number(state.p[2]) || 0],
      r: Number(state.r) || 0,
      s: Number(state.s) || 0,
    };
  });

  socket.on('race:checkpoint', (payload, cb) => {
    const room = roomManager.getRoomOfSocket(socket.id);
    if (!room?.race) return;
    const result = room.race.handleCheckpoint(socket.id, Number(payload?.index));
    if (result) cb?.(result);
    if (result?.ok) broadcastRoom(io, room);
  });
}
