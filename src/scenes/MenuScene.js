import Phaser from "phaser";
import { FACTION_DEFS, FACTION_ORDER } from "../game/factions.js";
import { NetClient } from "../network/Client.js";
import { loginWithCustomId, updateUserTitleDisplayName } from "../network/PlayFabClient.js";

const ENV = import.meta?.env ?? {};
const DEFAULT_PUBLIC_WS_URL = "wss://rts-api.132-243-24-25.sslip.io:8443";

function isLoopbackUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create() {
    this.netClient = null;
    this.selectedFaction = "kingdom";
    this.playerName = `Commander ${Phaser.Math.Between(10, 99)}`;
    this.playFabIdentity = null;
    this.lobbyState = null;
    this.isLobbyHost = false;
    this.isPublicSite = window.location.hostname.includes("github.io");
    this.connectionPromise = null;
    this.serverUrl = this.resolveServerUrl();

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

    this.titleText = this.add.text(54, 42, "Ironfront", { fontFamily: "Georgia", fontSize: "54px", color: "#f3dfb6" });
    this.subtitleText = this.add.text(56, 106, "Four factions. Solo skirmish or WebSocket multiplayer.", {
      fontSize: "18px",
      color: "#b9b1a4"
    });
    this.publicHintText = this.add.text(
      56,
      736,
      this.isPublicSite
        ? "Public site: multiplayer uses the built-in backend URL from the build config."
        : "Local build: start the Node websocket server before using multiplayer.",
      { fontSize: "15px", color: "#aa9f8f", wordWrap: { width: 780 } }
    );

    this.profileText = this.add.text(56, 138, "Profile: local guest", {
      fontSize: "17px",
      color: "#d8cbaa"
    });

    this.createMultiplayerPanel(width, height);
    this.statusText = this.add.text(56, height - 52, "", { fontSize: "18px", color: "#f8d07a" });
    this.createFactionCards();
    this.createActionButtons();
    this.createProfileControls();
    this.createHtmlInputs();
    this.events.once("shutdown", () => this.destroyHtmlInputs());
    this.playIntro();
    this.initializeIdentity();
  }

  playIntro() {
    const staged = [
      this.titleText,
      this.subtitleText,
      this.profileText,
      this.publicHintText,
      ...this.factionCards.flatMap((card) => [card.panel, card.title, card.motto, card.stats]),
      this.lobbyRoomText,
      this.lobbyPlayersText,
      this.startMatchButton.startBox,
      this.startMatchButton.startText,
      this.serverLabel,
      this.serverUrlText,
      this.renameButton.box,
      this.renameButton.text
    ];
    staged.forEach((item, index) => {
      item.setAlpha(0);
      item.y += 10;
      this.tweens.add({
        targets: item,
        alpha: 1,
        y: item.y - 10,
        duration: 320,
        delay: 40 + index * 18,
        ease: "Cubic.easeOut"
      });
    });
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

  createMultiplayerPanel(width, height) {
    this.add.rectangle(width - 372, 92, 320, 420, 0x171411, 0.9).setOrigin(0).setStrokeStyle(2, 0x6f5c45, 0.95);
    this.add.text(width - 350, 112, "Multiplayer Lobby", {
      fontFamily: "Georgia",
      fontSize: "28px",
      color: "#f0dfb8"
    });
    this.add.text(width - 350, 150, "Name", { fontSize: "15px", color: "#b9b1a4" });
    this.add.text(width - 350, 216, "Room Code", { fontSize: "15px", color: "#b9b1a4" });
    this.serverLabel = this.add.text(width - 350, 282, "Game Server", { fontSize: "15px", color: "#b9b1a4" });

    this.serverUrlText = this.add.text(width - 350, 312, this.getServerStatusText(), {
      fontSize: "14px",
      color: "#aa9f8f",
      wordWrap: { width: 260 }
    });
    this.lobbyRoomText = this.add.text(width - 350, 392, "Room: none", { fontSize: "18px", color: "#f4efe2" });
    this.lobbyPlayersText = this.add.text(width - 350, 424, "Players:\n-", {
      fontSize: "16px",
      color: "#dfd9cf",
      lineSpacing: 7,
      wordWrap: { width: 260 }
    });

    const startBox = this.add.rectangle(width - 350, 526, 260, 42, 0x2c241a, 0.96).setOrigin(0).setStrokeStyle(2, 0x8f7750, 0.95);
    const startText = this.add.text(width - 220, 547, "Start Match", { fontSize: "19px", color: "#f4efe2" }).setOrigin(0.5);
    startBox.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      if (this.isLobbyHost && this.netClient?.connected) {
        this.netClient.send("start_match");
      }
    });
    this.startMatchButton = { startBox, startText };
    this.setStartButtonEnabled(false);
  }

  createHtmlInputs() {
    const makeInput = (placeholder, value) => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.placeholder = placeholder;
      input.style.position = "fixed";
      input.style.zIndex = "20";
      input.style.background = "#1b1713";
      input.style.color = "#f4efe2";
      input.style.border = "2px solid #8f7750";
      input.style.borderRadius = "8px";
      input.style.padding = "10px 12px";
      input.style.font = '16px "Trebuchet MS", sans-serif';
      input.style.outline = "none";
      document.body.appendChild(input);
      return input;
    };

    this.nameInput = makeInput("Commander name", this.playerName);
    this.roomInput = makeInput("ABCDE", "");
    this.roomInput.maxLength = 5;
    this.roomInput.addEventListener("input", () => {
      this.roomInput.value = this.roomInput.value.toUpperCase();
    });

    const positionInputs = () => {
      const width = this.scale.width;
      this.nameInput.style.left = `${width - 350}px`;
      this.nameInput.style.top = "176px";
      this.nameInput.style.width = "236px";
      this.roomInput.style.left = `${width - 350}px`;
      this.roomInput.style.top = "242px";
      this.roomInput.style.width = "236px";
    };

    positionInputs();
    this.scale.on("resize", positionInputs);
    this.htmlInputsPositioner = positionInputs;
  }

  destroyHtmlInputs() {
    this.nameInput?.remove();
    this.roomInput?.remove();
    if (this.htmlInputsPositioner) {
      this.scale.off("resize", this.htmlInputsPositioner);
    }
  }

  createProfileControls() {
    const box = this.add.rectangle(430, 132, 190, 38, 0x231c17, 0.96).setOrigin(0).setStrokeStyle(2, 0x8f7750, 0.95);
    const text = this.add.text(525, 151, "Rename Profile", { fontSize: "17px", color: "#f4efe2" }).setOrigin(0.5);
    box.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.renameProfile());
    this.renameButton = { box, text };
  }

  async renameProfile() {
    const nextName = this.nameInput?.value.trim();
    if (!nextName) {
      return;
    }
    if (nextName.length < 3 || nextName.length > 25) {
      this.statusText.setText("Name must be 3 to 25 characters.");
      return;
    }

    if (!this.playFabIdentity?.enabled) {
      this.playerName = nextName;
      this.nameInput.value = this.playerName;
      this.profileText.setText(`Profile: ${this.playerName}  |  local guest`);
      this.statusText.setText("Local profile renamed.");
      return;
    }

    this.statusText.setText("Updating PlayFab display name...");
    try {
      const result = await updateUserTitleDisplayName(this.playFabIdentity.sessionTicket, nextName);
      this.playerName = result.DisplayName || nextName;
      this.playFabIdentity.displayName = this.playerName;
      this.nameInput.value = this.playerName;
      this.profileText.setText(`Profile: ${this.playerName}  |  PlayFab ${this.playFabIdentity.playFabId}`);
      this.statusText.setText("PlayFab profile updated.");
    } catch (error) {
      this.statusText.setText("Could not update PlayFab display name.");
      console.error(error);
    }
  }

  resolveServerUrl() {
    const configured = (ENV.VITE_MULTIPLAYER_WS_URL ?? "").trim();
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const currentPort = window.location.port ? `:${window.location.port}` : "";
    const isVitePreview = ["5173", "4173"].includes(window.location.port);
    const fallbackPort = isVitePreview ? ":2567" : currentPort;
    const fallbackLocal = `${protocol}://${window.location.hostname || "localhost"}${fallbackPort}`;
    const candidate = configured || (this.isPublicSite ? DEFAULT_PUBLIC_WS_URL : fallbackLocal);
    if (this.isPublicSite && candidate && isLoopbackUrl(candidate)) {
      return DEFAULT_PUBLIC_WS_URL;
    }
    return candidate;
  }

  getServerStatusText() {
    return this.serverUrl ? `Server: ${this.serverUrl}` : "Server: missing VITE_MULTIPLAYER_WS_URL";
  }

  validateServerUrl(url) {
    if (!url) {
      return this.isPublicSite ? "Public backend URL is not configured." : "Backend URL is not configured.";
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return "WS URL is invalid.";
    }

    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return "WS URL must start with ws:// or wss://";
    }
    if (this.isPublicSite && parsed.protocol !== "wss:") {
      return "Public site requires secure wss:// URL.";
    }
    if (this.isPublicSite && isLoopbackUrl(url)) {
      return "localhost is not reachable from GitHub Pages clients.";
    }
    return null;
  }

  async prepareNetwork() {
    if (this.netClient?.connected) {
      return this.netClient;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const validationError = this.validateServerUrl(this.serverUrl);
    if (validationError) {
      throw new Error(validationError);
    }
    this.serverUrlText.setText(this.getServerStatusText());

    this.statusText.setText(`Connecting to ${this.serverUrl} ...`);

    this.connectionPromise = (async () => {
      const client = new NetClient(this.serverUrl);
      const message = await client.connect(6500);
      this.netClient = client;
      this.connectedPlayerId = message.playerId;
      this.registerLobbyHandlers(client);
      return client;
    })();

    try {
      return await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  registerLobbyHandlers(client) {
    if (client.lobbyHandlersBound) {
      return;
    }
    client.lobbyHandlersBound = true;

    client.on("room_created", (message) => {
      this.isLobbyHost = true;
      this.roomInput.value = message.roomCode;
      this.lobbyRoomText.setText(`Room: ${message.roomCode}`);
      this.statusText.setText(`Room ${message.roomCode} created. Waiting for players.`);
      this.setStartButtonEnabled(false);
    });
    client.on("room_joined", (message) => {
      this.isLobbyHost = false;
      this.roomInput.value = message.roomCode;
      this.lobbyRoomText.setText(`Room: ${message.roomCode}`);
      this.statusText.setText(`Joined room ${message.roomCode}. Waiting for host.`);
      this.setStartButtonEnabled(false);
    });
    client.on("lobby_update", (message) => {
      this.lobbyState = message;
      this.lobbyRoomText.setText(`Room: ${message.roomCode}`);
      this.lobbyPlayersText.setText(
        `Players:\n${message.players
          .map((player) => `${player.isHost ? "[Host]" : "[Guest]"} ${player.name} - ${FACTION_DEFS[player.faction].name}`)
          .join("\n")}`
      );
      const canStart = this.isLobbyHost && message.players.length >= 2;
      this.setStartButtonEnabled(canStart);
      this.statusText.setText(
        canStart ? `Room ${message.roomCode} ready. Start when you want.` : `Room ${message.roomCode} | Players ${message.players.length}/4`
      );
    });
    client.on("match_started", (message) => {
      this.launchMultiplayerGame(client, message);
    });
    client.on("error_message", (message) => {
      this.statusText.setText(message.message);
    });
    client.on("socket_error", (message) => {
      this.statusText.setText(message.message);
    });
    client.on("closed", () => {
      this.netClient = null;
      this.isLobbyHost = false;
      this.setStartButtonEnabled(false);
      if (!this.scene.isActive("game")) {
        this.statusText.setText("Disconnected from multiplayer server.");
      }
    });
  }

  setStartButtonEnabled(enabled) {
    this.startMatchButton.startBox.setFillStyle(enabled ? 0x3a2d1f : 0x221c16, 0.96);
    this.startMatchButton.startText.setColor(enabled ? "#fff1d1" : "#968976");
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
      this.playerName = this.nameInput?.value.trim() || this.playerName;
      client.send("create_room", { name: this.playerName, faction: this.selectedFaction });
    } catch (error) {
      this.statusText.setText(error.message || "Could not connect to multiplayer backend.");
      console.error(error);
    }
  }

  async joinMultiplayer() {
    const roomCode = this.roomInput?.value.trim().toUpperCase();
    if (!roomCode) {
      this.statusText.setText("Enter a room code first.");
      return;
    }

    try {
      const client = await this.prepareNetwork();
      this.playerName = this.nameInput?.value.trim() || this.playerName;
      client.send("join_room", { roomCode, name: this.playerName, faction: this.selectedFaction });
    } catch (error) {
      this.statusText.setText(error.message || "Could not connect to multiplayer backend.");
      console.error(error);
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
