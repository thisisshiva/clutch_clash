import { roomManager } from '../rooms/RoomManager.js';

/**
 * WebRTC signaling relay. Peers in the same room exchange offers/answers/ICE
 * candidates through the server; audio itself flows P2P.
 */
export function registerVoiceHandlers(io, socket) {
  socket.on('voice:signal', (payload) => {
    const room = roomManager.getRoomOfSocket(socket.id);
    if (!room || !payload?.to) return;
    // Only relay between members of the same room.
    if (!room.players.has(payload.to)) return;
    io.to(payload.to).emit('voice:signal', {
      from: socket.id,
      data: payload.data,
    });
  });

  socket.on('voice:join', () => {
    const room = roomManager.getRoomOfSocket(socket.id);
    if (!room) return;
    // Tell existing voice peers a new peer arrived; the newcomer initiates
    // offers to everyone already in voice.
    socket.to(room.code).emit('voice:peerJoined', { id: socket.id });
  });

  socket.on('voice:leave', () => {
    const room = roomManager.getRoomOfSocket(socket.id);
    if (!room) return;
    socket.to(room.code).emit('voice:peerLeft', { id: socket.id });
  });
}
