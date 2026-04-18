import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 2567);
const publicWsUrl = process.env.PUBLIC_WS_URL || "";
const rooms = new Map();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function randomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function send(ws, type, payload = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcast(room, type, payload = {}) {
  room.players.forEach((player) => send(player.ws, type, payload));
}

function getPublicPlayers(room) {
  return room.players.map((player) => ({
    id: player.id,
    name: player.name,
    faction: player.faction,
    slot: player.slot,
    isHost: player.id === room.hostId
  }));
}

function announceLobby(room) {
  broadcast(room, "lobby_update", {
    roomCode: room.code,
    players: getPublicPlayers(room)
  });
}

function createRoom(hostPlayer) {
  let code = randomCode();
  while (rooms.has(code)) {
    code = randomCode();
  }

  const room = {
    code,
    hostId: hostPlayer.id,
    players: [hostPlayer],
    started: false
  };

  rooms.set(code, room);
  hostPlayer.roomCode = code;
  hostPlayer.slot = 0;
  return room;
}

function removePlayer(player) {
  if (!player.roomCode || !rooms.has(player.roomCode)) {
    return;
  }

  const room = rooms.get(player.roomCode);
  room.players = room.players.filter((entry) => entry.id !== player.id);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === player.id) {
    room.hostId = room.players[0].id;
    room.started = false;
    broadcast(room, "error_message", { message: "Host disconnected. Lobby reset." });
  }

  room.players.forEach((entry, index) => {
    entry.slot = index;
  });

  announceLobby(room);
}

async function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

async function handleHttp(req, res) {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((sum, room) => sum + room.players.length, 0) }));
    return;
  }

  if (!existsSync(distDir)) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("RTS server is running. Build the client to serve static files from this process.");
    return;
  }

  const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const targetPath = path.normalize(path.join(distDir, safePath));

  if (!targetPath.startsWith(distDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(targetPath);
    if (fileStat.isFile()) {
      await serveFile(targetPath, res);
      return;
    }
  } catch {
    // fall through to SPA fallback
  }

  await serveFile(path.join(distDir, "index.html"), res);
}

const server = createServer((req, res) => {
  handleHttp(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Internal server error");
  });
});

const wss = new WebSocketServer({ server });

let nextPlayerId = 1;

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  const player = {
    id: `p${nextPlayerId++}`,
    ws,
    name: `Player ${nextPlayerId - 1}`,
    faction: "kingdom",
    roomCode: null,
    slot: null
  };

  send(ws, "connected", { playerId: player.id });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "create_room") {
      player.name = message.name || player.name;
      player.faction = message.faction || player.faction;
      const room = createRoom(player);
      send(ws, "room_created", { roomCode: room.code, playerId: player.id, slot: 0 });
      announceLobby(room);
      return;
    }

    if (message.type === "join_room") {
      const room = rooms.get((message.roomCode || "").toUpperCase());
      if (!room) {
        send(ws, "error_message", { message: "Room not found." });
        return;
      }
      if (room.started) {
        send(ws, "error_message", { message: "Match already started." });
        return;
      }
      if (room.players.length >= 4) {
        send(ws, "error_message", { message: "Room is full." });
        return;
      }

      player.name = message.name || player.name;
      player.faction = message.faction || player.faction;
      player.roomCode = room.code;
      player.slot = room.players.length;
      room.players.push(player);
      send(ws, "room_joined", { roomCode: room.code, playerId: player.id, slot: player.slot });
      announceLobby(room);
      return;
    }

    if (!player.roomCode || !rooms.has(player.roomCode)) {
      return;
    }

    const room = rooms.get(player.roomCode);

    if (message.type === "start_match" && player.id === room.hostId) {
      room.started = true;
      const slots = room.players.map((entry) => ({
        playerId: entry.id,
        name: entry.name,
        faction: entry.faction,
        slot: entry.slot,
        isHost: entry.id === room.hostId
      }));
      broadcast(room, "match_started", {
        roomCode: room.code,
        hostId: room.hostId,
        slots
      });
      return;
    }

    if (message.type === "input") {
      const host = room.players.find((entry) => entry.id === room.hostId);
      if (host) {
        send(host.ws, "input", {
          fromPlayerId: player.id,
          commands: message.commands ?? []
        });
      }
      return;
    }

    if (message.type === "request_state") {
      const host = room.players.find((entry) => entry.id === room.hostId);
      if (host) {
        send(host.ws, "request_state", {
          fromPlayerId: player.id
        });
      }
      return;
    }

    if (message.type === "state" && player.id === room.hostId) {
      room.players.forEach((entry) => {
        if (entry.id !== player.id) {
          send(entry.ws, "state", message.payload ?? {});
        }
      });
    }
  });

  ws.on("close", () => {
    removePlayer(player);
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

server.listen(port, host, () => {
  const httpUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
  const wsUrl = publicWsUrl || `ws://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
  console.log(`Ironfront server listening on ${httpUrl}`);
  console.log(`WebSocket endpoint: ${wsUrl}`);
  if (existsSync(distDir)) {
    console.log(`Serving static client from ${distDir}`);
  }
});
