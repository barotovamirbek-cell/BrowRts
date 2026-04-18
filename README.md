# Ironfront RTS

Fantasy RTS on Phaser with four factions and optional WebSocket multiplayer.

## Features

- 4 factions: `Kingdom`, `Wildkin`, `Dusk Legion`, `Ember Court`
- faction selection menu before match start
- solo skirmish with AI opponents
- multiplayer lobby flow: host room / join room
- resource gathering, building, unit training, combat
- minimap
- RTS controls with drag selection and right-click orders

## Stack

- Phaser 3
- Vite
- lightweight Node.js HTTP + WebSocket server via `ws`

## Art Assets

- Kenney `tiny-dungeon` (CC0)
- Kenney `tiny-battle` (CC0)
- local copy and license files: `public/assets/kenney`

## Run

Install dependencies:

```bash
npm install
```

Configure environment:

```bash
copy .env.example .env
```

Then set:

- `VITE_PLAYFAB_TITLE_ID` to your PlayFab title id
- `VITE_MULTIPLAYER_WS_URL` if your WebSocket server is not local

Client only:

```bash
npm run dev
```

Multiplayer server:

```bash
npm run dev:server
```

Production build:

```bash
npm run build
```

Production server:

```bash
npm start
```

## Multiplayer

Multiplayer is relay-based. The VPS does not simulate the whole match. The host player's browser runs the game state, and the Node server only keeps lobby state and relays `input` / `state` messages.

That keeps resource usage low and works well on a weak VPS. The tradeoff is that if the host player disconnects, the match is interrupted.

Run the Vite client and the Node server together on your machine:

1. `npm run dev:server`
2. `npm run dev`
3. Open the game in two browser windows
4. In one window choose `Host Multiplayer`
5. In the second choose `Join Multiplayer` and enter the room code

Default local server address:

- client: `http://127.0.0.1:5173/`
- WebSocket server: `ws://localhost:2567`

On public deployments you can set server URL directly in menu:

- field: `Server WS URL`
- button: `Apply Server URL`
- requirement on `https` site: use `wss://...` (not `ws://...`)
- example: `wss://your-rts-server.onrender.com`

If the game client is opened from the same server that hosts the backend, the menu now auto-detects that server URL.

## VPS Deploy

Build locally or on the VPS:

```bash
npm install
npm run build
```

Run the single lightweight server process:

```bash
$env:HOST="0.0.0.0"
$env:PORT="2567"
$env:PUBLIC_WS_URL="ws://132.243.24.25:2567"
npm start
```

What this process does:

- serves `dist/` over HTTP
- accepts WebSocket connections on the same port
- stores rooms in memory only
- uses very little CPU/RAM because it is not a dedicated game simulation server

Then open:

- `http://132.243.24.25:2567/` if you serve the client from the VPS directly
- or set `ws://132.243.24.25:2567` in the in-game `Server WS URL` field if the client is hosted elsewhere

Important:

- if your frontend is on `https://...`, browsers will block plain `ws://...`; use `wss://...` behind a reverse proxy
- open TCP port `2567` in the VPS firewall/security group
- for long-running hosting use PM2, systemd, or another process manager

## Controls

- `LMB`: select unit or building
- `LMB drag`: selection box
- `Shift + LMB`: add to selection
- `RMB`: move / attack / gather / set rally point
- `W A S D` or screen edges: move camera
- mouse wheel: zoom
- `B`: build mode with selected worker
- `X`: stop selected units
- `H`: center camera on your town hall

## GitHub Pages

Static deployment is available from `docs/`, but GitHub Pages only hosts the client build.

Important:

- solo mode works on Pages
- multiplayer does not work on plain GitHub Pages by itself
- multiplayer needs a separately running WebSocket server

If you want online multiplayer on the public site, deploy `server/server.js` on a real Node host and point the client to that WebSocket URL.

Cheap/free options for relay host:

- Render Web Service (free tier)
- Railway
- Fly.io

After deploying, paste your `wss://...` endpoint into `Server WS URL` in menu.

## Black Screen / 404 Fix

If browser console shows `main.js 404` on GitHub Pages:

1. Open `Settings -> Pages`.
2. Source must be `GitHub Actions` (not raw branch static publish).
3. Use workflow `.github/workflows/deploy-pages.yml` (it builds Vite and deploys `dist`).
4. Push latest commit and wait for successful `Deploy GitHub Pages` run.

## PlayFab

The client now supports PlayFab sign-in using the official client endpoint:

- `Client/LoginWithCustomID`

This gives the game a persistent player identity layer. It is useful for:

- profile identity
- future cloud save / stats
- future lobby and matchmaking migration

Important:

- your PlayFab `Title ID` is safe to expose in the client
- your PlayFab `Secret Key` must never be put in the browser
