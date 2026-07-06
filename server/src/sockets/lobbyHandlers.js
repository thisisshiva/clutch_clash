import { roomManager } from '../rooms/RoomManager.js';
import { ROOM_STATUS } from '../rooms/Room.js';

function broadcastRoom(io, room) {
  io.to(room.code).emit('room:update', room.toJSON());
}

function leaveCurrentRoom(io, socket) {
  const prev = roomManager.getRoomOfSocket(socket.id);
  if (!prev) return;
  socket.leave(prev.code);
  const room = roomManager.unbindSocket(socket.id);
  socket.to(prev.code).emit('voice:peerLeft', { id: socket.id });
  if (room) broadcastRoom(io, room);
}

export function registerLobbyHandlers(io, socket) {
  socket.on('room:create', (payload, cb) => {
    leaveCurrentRoom(io, socket);
    const room = roomManager.createRoom(socket.id);
    if (payload?.trackId) room.setTrack(payload.trackId);
    room.addPlayer(socket.id, socket.data.name, socket.data.userId);
    roomManager.bindSocket(socket.id, room.code);
    socket.join(room.code);
    cb?.({ ok: true, room: room.toJSON() });
  });

  socket.on('room:join', (payload, cb) => {
    const room = roomManager.getRoom(payload?.code);
    if (!room) return cb?.({ ok: false, error: 'Room not found. Check the code.' });
    if (room.status !== ROOM_STATUS.LOBBY) {
      return cb?.({ ok: false, error: 'A race is already in progress in this room.' });
    }
    if (room.isFull) return cb?.({ ok: false, error: 'Room is full.' });

    leaveCurrentRoom(io, socket);
    room.addPlayer(socket.id, socket.data.name, socket.data.userId);
    roomManager.bindSocket(socket.id, room.code);
    socket.join(room.code);
    broadcastRoom(io, room);
    cb?.({ ok: true, room: room.toJSON() });
  });

  socket.on('room:setTrack', (payload) => {
    const room = roomManager.getRoomOfSocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.setTrack(payload?.trackId)) broadcastRoom(io, room);
  });

  socket.on('room:leave', () => {
    leaveCurrentRoom(io, socket);
  });

  socket.on('room:backToLobby', () => {
    const room = roomManager.getRoomOfSocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    if (room.status !== ROOM_STATUS.FINISHED) return;
    room.resetToLobby();
    broadcastRoom(io, room);
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(io, socket);
  });
}

export { broadcastRoom };
