import Phaser from "phaser";
import { FACTION_DEFS, FACTION_ORDER } from "../game/factions.js";
import { NetClient } from "../network/Client.js";
import { loginWithCustomId, updateUserTitleDisplayName } from "../network/PlayFabClient.js";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create() {
    this.netClient = null;
    this.pendingLobby = null;
    this.selectedFaction = "kingdom";
    this.playerName = `Commander ${Phaser.Math.Between(10, 99)}`;
    this.serverUrl =
      import.meta.env.VITE_MULTIPLAYER_WS_URL ||
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname || "localhost"}:2567`;
    this.playFabIdentity = null;

    const { width, height } = this.scale;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0f1218, 0x161f22, 0x231512, 0x131010, 1);
    bg.fillRect(0, 0, width, height);
    for (let i = 0; i < 22; i += 1) {
      bg.fillStyle(0xffffff, 0.03);
      bg.fillCircle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.Between(30, 120)
      );
    }

    this.add.text(54, 42, "Ironfront", { fontFamily: "Georgia", fontSize: "54px", color: "#f3dfb6" });
    this.add.text(56, 106, "Four factions. Solo skirmish or WebSocket multiplayer.", {
      fontSize: "18px",
      color: "#b9b1a4"
    });

    this.profileText = this.add.text(56, 138, "Profile: local guest", {
      fontSize: "17px",
      color: "#d8cbaa"
    });

    this.statusText = this.add.text(56, height - 52, "", { fontSize: "18px", color: "#f8d07a" });
    this.createFactionCards();
    this.createActionButtons();
    this.createProfileControls();
    this.initializeIdentity();
  }

  async initializeIdentity() {
    this.statusText.setText("Signing in...");
    try {
      this.playFabIdentity = await loginWithCustomId(this.playerName);
      this.playerName = this.playFabIdentity.displayName || this.playerName;
      this.profileText.setText(
        this.playFabIdentity.enabled
          ? `Profile: ${this.playerName}  |  PlayFab ${this.playFabIdentity.playFabId}`
          : `Profile: local guest  |  set VITE_PLAYFAB_TITLE_ID to enable PlayFab`
      );
      this.statusText.setText(this.playFabIdentity.enabled ? "PlayFab connected." : "PlayFab disabled. Running local profile.");
    } catch (error) {
      this.profileText.setText("Profile: local guest  |  PlayFab login failed");
      this.statusText.setText("PlayFab login failed. Continuing with local profile.");
      console.error(error);
    }
  }

  createFactionCards() {
    this.factionCards = [];
    FACTION_ORDER.forEach((key, index) => {
      const faction = FACTION_DEFS[key];
      const x = 64 + index * 250;
      const y = 180;
      const panel = this.add.rectangle(x, y, 220, 260, faction.color, 0.16).setOrigin(0).setStrokeStyle(2, faction.color, 0.9);
      const title = this.add.text(x + 18, y + 18, faction.name, {
        fontFamily: "Georgia",
        fontSize: "28px",
        color: faction.ui
      });
      const motto = this.add.text(x + 18, y + 58, faction.motto, {
        fontSize: "16px",
        color: "#dfd9cf",
        wordWrap: { width: 180 }
      });
      const stats = this.add.text(
        x + 18,
        y + 122,
        [
          `Harvest x${faction.modifiers.gatherRate.toFixed(2)}`,
          `Move x${faction.modifiers.moveSpeed.toFixed(2)}`,
          `Melee x${faction.modifiers.meleeDamage.toFixed(2)}`,
          `Ranged x${faction.modifiers.rangedDamage.toFixed(2)}`
        ].join("\n"),
        { fontSize: "15px", color: "#f0ede6", lineSpacing: 7 }
      );
      panel.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        this.selectedFaction = key;
        this.refreshFactionCards();
      });
      this.factionCards.push({ key, panel, title, motto, stats });
    });

    this.refreshFactionCards();
  }

  refreshFactionCards() {
    this.factionCards.forEach((card) => {
      const active = card.key === this.selectedFaction;
      card.panel.setFillStyle(FACTION_DEFS[card.key].color, active ? 0.28 : 0.16);
      card.panel.setStrokeStyle(active ? 4 : 2, active ? 0xf5efdf : FACTION_DEFS[card.key].color, 0.95);
    });
  }

  createActionButtons() {
    const actions = [
      { label: "Solo Skirmish", y: 500, handler: () => this.startSingleplayer() },
      { label: "Host Multiplayer", y: 560, handler: () => this.hostMultiplayer() },
      { label: "Join Multiplayer", y: 620, handler: () => this.joinMultiplayer() }
    ];

    actions.forEach((action) => {
      const box = this.add.rectangle(74, action.y, 300, 46, 0x201914, 0.96).setOrigin(0).setStrokeStyle(2, 0x8f7750, 0.95);
      const text = this.add.text(224, action.y + 23, action.label, { fontSize: "20px", color: "#f4efe2" }).setOrigin(0.5);
      box.setInteractive({ useHandCursor: true }).on("pointerdown", action.handler);
    });
  }

  createProfileControls() {
    const box = this.add.rectangle(430, 132, 190, 38, 0x231c17, 0.96).setOrigin(0).setStrokeStyle(2, 0x8f7750, 0.95);
    const text = this.add.text(525, 151, "Rename Profile", { fontSize: "17px", color: "#f4efe2" }).setOrigin(0.5);
    box.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.renameProfile());
    this.renameButton = { box, text };
  }

  async renameProfile() {
    const nextName = window.prompt("New commander name?", this.playerName)?.trim();
    if (!nextName) {
      return;
    }
    if (nextName.length < 3 || nextName.length > 25) {
      this.statusText.setText("Name must be 3 to 25 characters.");
      return;
    }

    if (!this.playFabIdentity?.enabled) {
      this.playerName = nextName;
      this.profileText.setText(`Profile: ${this.playerName}  |  local guest`);
      this.statusText.setText("Local profile renamed.");
      return;
    }

    this.statusText.setText("Updating PlayFab display name...");
    try {
      const result = await updateUserTitleDisplayName(this.playFabIdentity.sessionTicket, nextName);
      this.playerName = result.DisplayName || nextName;
      this.playFabIdentity.displayName = this.playerName;
      this.profileText.setText(`Profile: ${this.playerName}  |  PlayFab ${this.playFabIdentity.playFabId}`);
      this.statusText.setText("PlayFab profile updated.");
    } catch (error) {
      this.statusText.setText("Could not update PlayFab display name.");
      console.error(error);
    }
  }

  async prepareNetwork() {
    if (this.netClient?.connected) {
      return this.netClient;
    }
    this.statusText.setText("Connecting to multiplayer server...");
    const client = new NetClient(this.serverUrl);
    const message = await client.connect();
    this.netClient = client;
    this.connectedPlayerId = message.playerId;
    return client;
  }

  startSingleplayer() {
    this.scene.start("game", {
      mode: "singleplayer",
      localPlayerId: "local-player",
      selectedFaction: this.selectedFaction,
      roster: [
        { playerId: "local-player", faction: this.selectedFaction, slot: 0, isHuman: true, name: this.playerName },
        { playerId: "ai-1", faction: "wildkin", slot: 1, isHuman: false, name: "Wildkin AI" },
        { playerId: "ai-2", faction: "dusk", slot: 2, isHuman: false, name: "Dusk AI" },
        { playerId: "ai-3", faction: "ember", slot: 3, isHuman: false, name: "Ember AI" }
      ]
    });
  }

  async hostMultiplayer() {
    try {
      const client = await this.prepareNetwork();
      client.on("room_created", (message) => {
        this.statusText.setText(`Room ${message.roomCode} created. Share it, then press ENTER to start.`);
      });
      client.on("lobby_update", (message) => {
        this.pendingLobby = message;
        this.statusText.setText(`Room ${message.roomCode} | Players ${message.players.length}/4 | ENTER to start`);
      });
      client.on("match_started", (message) => {
        this.launchMultiplayerGame(client, message);
      });
      client.send("create_room", { name: this.playerName, faction: this.selectedFaction });
      this.input.keyboard.once("keydown-ENTER", () => client.send("start_match"));
    } catch {
      this.statusText.setText("Could not connect to multiplayer server.");
    }
  }

  async joinMultiplayer() {
    const roomCode = window.prompt("Room code?")?.trim().toUpperCase();
    if (!roomCode) {
      return;
    }

    try {
      const client = await this.prepareNetwork();
      client.on("room_joined", (message) => {
        this.statusText.setText(`Joined room ${message.roomCode}. Waiting for host...`);
      });
      client.on("lobby_update", (message) => {
        this.statusText.setText(`Room ${message.roomCode} | Players ${message.players.length}/4 | waiting for host`);
      });
      client.on("match_started", (message) => {
        this.launchMultiplayerGame(client, message);
      });
      client.on("error_message", (message) => {
        this.statusText.setText(message.message);
      });
      client.send("join_room", { roomCode, name: this.playerName, faction: this.selectedFaction });
    } catch {
      this.statusText.setText("Could not connect to multiplayer server.");
    }
  }

  launchMultiplayerGame(client, message) {
    this.scene.start("game", {
      mode: "multiplayer",
      netClient: client,
      localPlayerId: this.connectedPlayerId,
      hostId: message.hostId,
      roster: message.slots.map((slot, index) => ({
        ...slot,
        isHuman: true,
        slot: index
      }))
    });
  }
}
