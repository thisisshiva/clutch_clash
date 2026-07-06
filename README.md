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

