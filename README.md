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
- `VITE_MULTIPLAYER_WS_URL` to the fixed multiplayer backend URL that should be built into the client

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

For public deployments the client no longer allows changing the backend URL in-game.
Set `VITE_MULTIPLAYER_WS_URL` before `npm run build`.

Default public backend for this repo:

```bash
wss://rts-api.132-243-24-25.sslip.io:8443
```

Example:

```bash
VITE_MULTIPLAYER_WS_URL=wss://rts-api.132-243-24-25.sslip.io:8443 npm run build
```

## GitHub Pages + VPS

This repo is now set up for the correct public layout:

- GitHub Pages serves the frontend
- VPS serves only the backend
- the client uses one fixed built-in `wss://...` backend URL
- players cannot change the backend inside the game

Pages builds already fall back to the public backend above.
If you want to override it later, set these GitHub repository variables:

- `Settings -> Secrets and variables -> Actions -> Variables`
- `VITE_MULTIPLAYER_WS_URL = wss://your-backend-domain:8443`
- `VITE_PLAYFAB_TITLE_ID = your_playfab_title_id`

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
$env:PUBLIC_WS_URL="wss://rts-api.132-243-24-25.sslip.io:8443"
npm start
```

What this process does:

- serves `dist/` over HTTP
- accepts WebSocket connections on the same port
- stores rooms in memory only
- uses very little CPU/RAM because it is not a dedicated game simulation server

Important:

- if your frontend is on `https://...`, the built-in multiplayer URL must be `wss://...`
- open TCP port `2567` in the VPS firewall/security group
- for long-running hosting use PM2, systemd, or another process manager

Example VPS production layout:

- Caddy config template: `server/Caddyfile.example`
- systemd service template: `server/browrts.service.example`

Use them like this on the VPS:

```bash
cp /root/BrowRts/server/Caddyfile.example /etc/caddy/Caddyfile
cp /root/BrowRts/server/browrts.service.example /etc/systemd/system/browrts.service
```

Then replace `rts-api.example.com` in both files with your real backend domain and run:

```bash
systemctl daemon-reload
systemctl enable --now browrts
systemctl restart caddy
```

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

If you want online multiplayer on the public site, deploy `server/server.js` on a real Node host and build the client with `VITE_MULTIPLAYER_WS_URL=wss://your-backend-domain`.

Cheap/free options for relay host:

- Render Web Service (free tier)
- Railway
- Fly.io

After deploying, rebuild and redeploy the client so the fixed `wss://...` backend URL is baked into the bundle.

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
