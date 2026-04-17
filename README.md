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
- Node.js WebSocket server via `ws`

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

## Multiplayer

Multiplayer is server-backed. Run the Vite client and the Node server together on your machine:

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
