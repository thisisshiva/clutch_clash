import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import { createAuthMiddleware } from './auth/verifySupabase.js';
import { roomManager } from './rooms/RoomManager.js';
import { getTrackList, getAllTracks } from './game/tracks.js';
import { registerLobbyHandlers } from './sockets/lobbyHandlers.js';
import { registerRaceHandlers } from './sockets/raceHandlers.js';
import { registerVoiceHandlers } from './sockets/voiceHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

// --- REST API -------------------------------------------------------------
app.get('/api/tracks', (_req, res) => res.json(getTrackList()));
app.get('/api/tracks/full', (_req, res) => res.json(getAllTracks()));
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, rooms: roomManager.rooms.size })
);

// Serve built client in production (client/dist).
const distDir = path.resolve(__dirname, '../../client/dist');
app.use(express.static(distDir));

// --- Socket.io ------------------------------------------------------------
io.use(createAuthMiddleware());

io.on('connection', (socket) => {
  registerLobbyHandlers(io, socket);
  registerRaceHandlers(io, socket);
  registerVoiceHandlers(io, socket);
});

// Room snapshot tick: broadcast player positions at 20Hz per active room.
const TICK_MS = 50;
setInterval(() => {
  for (const room of roomManager.rooms.values()) {
    if (room.players.size < 2) continue;
    io.to(room.code).volatile.emit('state:snapshot', room.snapshot());
  }
}, TICK_MS);

server.listen(env.port, () => {
  console.log(`[clutch-clash] server listening on http://localhost:${env.port}`);
});
