import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 2567);
const wss = new WebSocketServer({ port });
const rooms = new Map();

function randomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function send(ws, type, payload = {}) {
  if (ws.readyState === ws.OPEN) {
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
  }

  room.players.forEach((entry, index) => {
    entry.slot = index;
  });

  announceLobby(room);
}

let nextPlayerId = 1;

wss.on("connection", (ws) => {
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

console.log(`RTS multiplayer server listening on ws://localhost:${port}`);
