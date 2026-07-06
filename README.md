# Clutch Clash

Multiplayer 3D F1-style track racing game — Three.js + Node.js + Socket.io + WebRTC proximity voice chat.

## Features

- 3 tracks: Sprint Circuit (3 checkpoints), Grand Loop (5), Endurance Ring (10)
- Checkpoint respawn — `R` dabao aur last checkpoint pe wapas aa jao
- Room-based multiplayer — 6-character code se dost join karte hain (max 8 players)
- Server-authoritative race logic — countdown, checkpoint order validation, laps, finish order
- Proximity voice chat — paas wali car ki aawaz tez, door wali dheemi (WebRTC + `THREE.PositionalAudio`)
- Procedural engine sounds (positional)
- Supabase auth (email/password) + guest mode + friends system

## Setup

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3000

### Multiple devices se test karna (same WiFi)

1. `npm run dev` chalao
2. Apne PC ka LAN IP nikalo (`ipconfig` → IPv4 Address)
3. Doosre device pe kholo: `http://<LAN-IP>:5173`
4. Ek device pe room banao, doosre pe code daal ke join karo

> **Voice chat note:** Mic access sirf `localhost` ya HTTPS pe milta hai.
> LAN pe voice test karne ke liye `npm run dev:https` use karo aur
> `https://<LAN-IP>:5173` kholo (self-signed certificate warning accept karni hogi).

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / Reverse |
| A / D | Steer |
| Space | Handbrake (drift) |
| R | Respawn at last checkpoint |

## Supabase Setup (optional — login + friends ke liye)

1. [supabase.com](https://supabase.com) pe free project banao
2. SQL Editor me [supabase/schema.sql](supabase/schema.sql) paste karke run karo
3. Project Settings → API se URL aur anon key copy karo
4. `client/.env` banao:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. `server/.env` banao (socket JWT verification ke liye):
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   ```
6. Dev servers restart karo

Bina Supabase ke game **guest mode** me fully chalta hai — sirf login/friends disabled rahenge.

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
