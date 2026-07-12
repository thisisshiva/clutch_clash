# Clutch Clash

Multiplayer 3D F1-style track racing game — Three.js + Node.js + Socket.io + WebRTC proximity voice chat.

## Features

- 3 tracks: Sprint Circuit (3 checkpoints), Grand Loop (5), Endurance Ring (10)
- Checkpoint respawn — press `R` to respawn at the last checkpoint
- Room-based multiplayer — friends join with a 6-character code (max 8 players)
- Server-authoritative race logic — countdown, checkpoint order validation, laps, finish order
- Proximity voice chat — nearby cars sound louder, distant ones quieter (WebRTC + `THREE.PositionalAudio`)
- Procedural engine sounds (positional)
- Supabase auth (email/password) + guest mode + friends system

## Setup

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3000

### Testing on multiple devices (same WiFi)

1. Run `npm run dev`
2. Find your PC's LAN IP (`ipconfig` → IPv4 Address)
3. On the other device, open: `http://<LAN-IP>:5173`
4. Create a room on one device, enter the code on the other to join

> **Voice chat note:** Microphone access is only granted on `localhost` or HTTPS.
> To test voice over LAN, use `npm run dev:https` and open
> `https://<LAN-IP>:5173` (you'll need to accept the self-signed certificate warning).

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / Reverse |
| A / D | Steer |
| Space | Handbrake (drift) |
| R | Respawn at last checkpoint |

## Supabase Setup (optional — for login + friends)

1. Create a free project at [supabase.com](https://supabase.com)
2. Paste [supabase/schema.sql](supabase/schema.sql) into the SQL Editor and run it
3. Copy the URL and anon key from Project Settings → API
4. Create `client/.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. Create `server/.env` (for socket JWT verification):
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   ```
6. Restart the dev servers

Without Supabase the game runs fully in **guest mode** — only login/friends are disabled.

## Architecture

```
server/src/
├── index.js              # Express + Socket.io bootstrap + 20Hz snapshot tick
├── config/env.js
├── auth/verifySupabase.js    # socket JWT middleware
├── rooms/RoomManager.js      # Singleton room registry
├── rooms/Room.js             # per-room state
├── game/RaceController.js    # countdown, checkpoint validation, finish order
├── game/tracks.js            # track definitions (single source of truth)
└── sockets/                  # lobby / race / voice-signaling handlers

client/src/
├── main.js               # app controller + screen routing
├── core/                 # Engine (renderer/scene/loop), Input
├── game/                 # CarFactory, CarPhysics, TrackBuilder,
│                         # CheckpointSystem, RaceSession, RemotePlayers
├── net/                  # SocketClient (singleton), StateSync (interpolation)
├── voice/                # VoiceManager (WebRTC mesh), SpatialAudio
├── auth/                 # Supabase client, auth + friends services
├── tracks/               # track data loader
└── ui/                   # screens (Login, Menu, MapSelect, Lobby, HUD, Results, Friends)
```
