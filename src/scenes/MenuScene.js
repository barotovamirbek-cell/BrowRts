import Phaser from "phaser";
import { FACTION_DEFS, FACTION_ORDER } from "../game/factions.js";
import { NetClient } from "../network/Client.js";
import { loginWithCustomId, updateUserTitleDisplayName } from "../network/PlayFabClient.js";

const ENV = import.meta?.env ?? {};
const DEFAULT_PUBLIC_WS_URL = "wss://rts-api.132-243-24-25.sslip.io:8443";
const TEAM_SEQUENCE = [1, 2, 3, 4];
const TEAM_LABELS = {
  1: "Команда 1",
  2: "Команда 2",
  3: "Команда 3",
  4: "Команда 4"
};

function isLoopbackUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}

function makeBotName(faction) {
  return `Бот ${FACTION_DEFS[faction]?.name ?? "RTS"}`;
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create() {
    this.netClient = null;
    this.playerName = `Командир ${Phaser.Math.Between(10, 99)}`;
    this.playFabIdentity = null;
    this.lobbyState = null;
    this.connectionPromise = null;
    this.connectedPlayerId = null;
    this.isLobbyHost = false;
    this.isPublicSite = window.location.hostname.includes("github.io");
    this.serverUrl = this.resolveServerUrl();
    this.localSlots = this.buildDefaultSlots();
    this.selectedFaction = this.localSlots[0].faction;

    this.drawBackdrop();
    this.createHeader();
    this.createFactionCards();
    this.createCommandPanel();
    this.createSlotsPanel();
    this.createStatusBar();
    this.createHtmlInputs();
    this.events.once("shutdown", () => this.destroyHtmlInputs());
    this.events.once("destroy", () => this.destroyHtmlInputs());
    this.bindMenuResize();
    this.bindVisibilityRecovery();

    this.syncLocalPlayerSlot();
    this.refreshFactionCards();
    this.refreshSlotRows();
    this.updateLobbySummary();
    this.refreshActionButtons();
    this.initializeIdentity();
  }

  drawBackdrop() {
    const { width, height } = this.scale;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x120b08, 0x1f160f, 0x26190f, 0x0f0f13, 1);
    bg.fillRect(0, 0, width, height);

    for (let i = 0; i < 24; i += 1) {
      bg.fillStyle(i % 2 === 0 ? 0xdec58b : 0x4a6e4b, 0.035);
      bg.fillCircle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.Between(30, 120)
      );
    }

    this.add.rectangle(width / 2, 72, width - 70, 96, 0x130d0a, 0.88).setStrokeStyle(2, 0x7c643f, 0.9);
    this.add.rectangle(22, 148, 404, height - 226, 0x120d0b, 0.88).setOrigin(0).setStrokeStyle(2, 0x695237, 0.92);
    this.add.rectangle(446, 148, width - 468, 176, 0x120d0b, 0.84).setOrigin(0).setStrokeStyle(2, 0x695237, 0.92);
    this.add.rectangle(446, 344, width - 468, height - 422, 0x120d0b, 0.9).setOrigin(0).setStrokeStyle(2, 0x695237, 0.92);
  }

  createHeader() {
    this.titleText = this.add.text(54, 34, "Железный Рубеж", {
      fontFamily: "Georgia",
      fontSize: "54px",
      color: "#f4dfb1"
    });
    this.subtitleText = this.add.text(58, 94, "Лобби, команды, боты и быстрый старт матча в духе классических RTS.", {
      fontSize: "18px",
      color: "#c4b291"
    });
  }

  createFactionCards() {
    this.factionCards = [];
    FACTION_ORDER.forEach((key, index) => {
      const faction = FACTION_DEFS[key];
      const x = 468 + index * 208;
      const y = 170;
      const panel = this.add.rectangle(x, y, 184, 128, faction.color, 0.16).setOrigin(0).setStrokeStyle(2, faction.color, 0.96);
      const title = this.add.text(x + 14, y + 12, faction.name, {
        fontFamily: "Georgia",
        fontSize: "26px",
        color: faction.ui
      });
      const hero = this.add.text(x + 14, y + 48, faction.heroName, {
        fontSize: "15px",
        color: "#efe3cb"
      });
      const motto = this.add.text(x + 14, y + 72, faction.motto, {
        fontSize: "13px",
        color: "#c6b7a0",
        wordWrap: { width: 154 }
      });
      panel.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.selectFaction(key));
      this.factionCards.push({ key, panel, title, hero, motto });
    });
  }

  createCommandPanel() {
    const left = 42;
    let top = 170;

    this.profileText = this.add.text(left, top, "Профиль: локальный игрок", {
      fontSize: "17px",
      color: "#eadbb9",
      wordWrap: { width: 340 }
    });
    top += 36;

    this.add.text(left, top, "Имя командира", { fontSize: "15px", color: "#bca98a" });
    top += 70;
    this.add.text(left, top, "Код комнаты", { fontSize: "15px", color: "#bca98a" });
    top += 72;

    this.serverText = this.add.text(left, top, this.getServerStatusText(), {
      fontSize: "14px",
      color: "#9f9685",
      wordWrap: { width: 340 }
    });
    top += 76;

    this.roomText = this.add.text(left, top, "Комната: локальная схватка", {
      fontFamily: "Georgia",
      fontSize: "24px",
      color: "#f4e8c8"
    });
    top += 38;

    this.lobbySummary = this.add.text(left, top, "", {
      fontSize: "15px",
      color: "#d5c7b0",
      wordWrap: { width: 340 }
    });
    top += 100;
    top = Math.min(top, this.scale.height - 292);

    this.buttons = {
      rename: this.createWideButton(left, top, 340, "Переименовать профиль", () => this.renameProfile()),
      skirmish: this.createWideButton(left, top + 56, 340, "Начать схватку", () => this.startSingleplayer()),
      host: this.createWideButton(left, top + 112, 340, "Создать лобби", () => this.hostMultiplayer()),
      join: this.createWideButton(left, top + 168, 340, "Войти по коду", () => this.joinMultiplayer())
    };

    this.startMatchButton = this.createWideButton(left, top + 236, 340, "Старт матча", () => {
      if (!this.netClient?.connected) {
        this.statusText.setText("Нет соединения с сервером.");
        return;
      }
      this.netClient.send("start_match");
    });
    this.setStartButtonEnabled(false);
  }

  createSlotsPanel() {
    this.slotsTitle = this.add.text(468, 362, "Состав игроков", {
      fontFamily: "Georgia",
      fontSize: "32px",
      color: "#f4dfb1"
    });

    this.slotHeaders = {
      slot: this.add.text(472, 400, "Слот", { fontSize: "14px", color: "#bca98a" }),
      player: this.add.text(554, 400, "Игрок", { fontSize: "14px", color: "#bca98a" }),
      control: this.add.text(844, 400, "Управление", { fontSize: "14px", color: "#bca98a" }),
      faction: this.add.text(1042, 400, "Раса", { fontSize: "14px", color: "#bca98a" }),
      team: this.add.text(1220, 400, "Команда", { fontSize: "14px", color: "#bca98a" })
    };

    this.slotRows = [];
    for (let index = 0; index < 4; index += 1) {
      const y = 438 + index * 92;
      const bg = this.add.rectangle(468, y, this.scale.width - 512, 74, 0x19110d, 0.92).setOrigin(0).setStrokeStyle(1, 0x5d4932, 0.9);
      const slotLabel = this.add.text(486, y + 24, `#${index + 1}`, { fontSize: "24px", color: "#f4dfb1" });
      const name = this.add.text(554, y + 16, "", { fontSize: "20px", color: "#efe3cb", wordWrap: { width: 250 } }).setLineSpacing(-6);
      const state = this.add.text(554, y + 43, "", { fontSize: "13px", color: "#bca98a", wordWrap: { width: 260 } }).setLineSpacing(-4);
      const controlButton = this.createMiniButton(828, y + 16, 170, "Управление", () => this.cycleSlotController(index));
      const factionButton = this.createMiniButton(1020, y + 16, 156, "Раса", () => this.cycleSlotFaction(index));
      const teamButton = this.createMiniButton(1202, y + 16, 156, "Команда", () => this.cycleSlotTeam(index));
      this.slotRows.push({ bg, slotLabel, name, state, controlButton, factionButton, teamButton });
    }
  }

  createStatusBar() {
    this.statusText = this.add.text(34, this.scale.height - 42, "", {
      fontSize: "18px",
      color: "#f4c970",
      wordWrap: { width: this.scale.width - 60 }
    });
  }

  createWideButton(x, y, width, label, handler) {
    const bg = this.add.rectangle(x, y, width, 42, 0x241a13, 0.96).setOrigin(0).setStrokeStyle(2, 0x8c7149, 0.95);
    const text = this.add.text(x + width / 2, y + 21, label, {
      fontSize: "18px",
      color: "#f4efe2",
      align: "center",
      wordWrap: { width: width - 24, useAdvancedWrap: true }
    }).setOrigin(0.5).setLineSpacing(-4);
    bg.setInteractive({ useHandCursor: true }).on("pointerdown", handler);
    return { bg, text };
  }

  setWideButtonEnabled(button, enabled) {
    button.bg.setFillStyle(enabled ? 0x241a13 : 0x171210, 0.96);
    button.text.setColor(enabled ? "#f4efe2" : "#8c8374");
    if (button.bg.input) {
      button.bg.input.enabled = enabled;
      button.bg.input.cursor = enabled ? "pointer" : "default";
    }
  }

  createMiniButton(x, y, width, label, handler) {
    const bg = this.add.rectangle(x, y, width, 38, 0x241a13, 0.96).setOrigin(0).setStrokeStyle(1, 0x826845, 0.95);
    const text = this.add.text(x + width / 2, y + 19, label, {
      fontSize: "15px",
      color: "#f4efe2",
      align: "center",
      wordWrap: { width: width - 18, useAdvancedWrap: true }
    }).setOrigin(0.5).setLineSpacing(-4);
    bg.setInteractive({ useHandCursor: true }).on("pointerdown", handler);
    return { bg, text };
  }

  setButtonBounds(button, x, y, width, height) {
    button.bg.setPosition(x, y).setSize(width, height).setDisplaySize(width, height);
    if (button.bg.input?.hitArea?.setTo) {
      button.bg.input.hitArea.setTo(0, 0, width, height);
    }
    button.text
      .setPosition(x + width / 2, y + height / 2)
      .setWordWrapWidth(width - 18, true);
  }

  layoutSlotsPanel(width) {
    const panelLeft = 468;
    const panelRight = width - 28;
    const compact = width < 1420;
    const veryCompact = width < 1260;
    const controlWidth = veryCompact ? 142 : compact ? 154 : 170;
    const factionWidth = veryCompact ? 130 : compact ? 142 : 156;
    const teamWidth = veryCompact ? 120 : compact ? 132 : 156;
    const gap = veryCompact ? 10 : 18;
    const teamX = panelRight - teamWidth - 10;
    const factionX = teamX - gap - factionWidth;
    const controlX = factionX - gap - controlWidth;
    const nameX = 554;
    const nameWidth = Math.max(140, controlX - nameX - 20);
    const rowWidth = Math.max(560, panelRight - panelLeft - 10);
    const rowHeight = veryCompact ? 82 : 74;

    this.slotsTitle.setFontSize(compact ? 28 : 32);
    this.slotHeaders.slot.setPosition(472, 400).setFontSize(veryCompact ? 12 : 14);
    this.slotHeaders.player.setPosition(554, 400).setFontSize(veryCompact ? 12 : 14);
    this.slotHeaders.control.setPosition(controlX, 400).setFontSize(veryCompact ? 12 : 14);
    this.slotHeaders.faction.setPosition(factionX, 400).setFontSize(veryCompact ? 12 : 14);
    this.slotHeaders.team.setPosition(teamX, 400).setFontSize(veryCompact ? 12 : 14);

    this.slotRows.forEach((row, index) => {
      const y = 438 + index * 92;
      row.bg.setPosition(panelLeft, y).setSize(rowWidth, rowHeight).setDisplaySize(rowWidth, rowHeight);
      row.slotLabel.setPosition(486, y + (veryCompact ? 26 : 24)).setFontSize(veryCompact ? 20 : 24);
      row.name
        .setPosition(nameX, y + 14)
        .setFontSize(veryCompact ? 15 : compact ? 17 : 20)
        .setWordWrapWidth(nameWidth, true);
      row.state
        .setPosition(nameX, y + (veryCompact ? 46 : 43))
        .setFontSize(veryCompact ? 11 : compact ? 12 : 13)
        .setWordWrapWidth(nameWidth, true);
      this.setButtonBounds(row.controlButton, controlX, y + 16, controlWidth, 38);
      this.setButtonBounds(row.factionButton, factionX, y + 16, factionWidth, 38);
      this.setButtonBounds(row.teamButton, teamX, y + 16, teamWidth, 38);
    });
  }

  createHtmlInputs() {
    const makeInput = (placeholder, value) => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.placeholder = placeholder;
      input.style.position = "fixed";
      input.style.zIndex = "20";
      input.style.background = "#1b1511";
      input.style.color = "#f4efe2";
      input.style.border = "2px solid #8f7750";
      input.style.borderRadius = "8px";
      input.style.padding = "10px 12px";
      input.style.font = '16px "Trebuchet MS", sans-serif';
      input.style.outline = "none";
      document.body.appendChild(input);
      return input;
    };

    this.nameInput = makeInput("Имя командира", this.playerName);
    this.roomInput = makeInput("ABCDE", "");
    this.roomInput.maxLength = 5;
    this.roomInput.addEventListener("input", () => {
      this.roomInput.value = this.roomInput.value.toUpperCase();
    });

    const positionInputs = () => {
      this.nameInput.style.left = "42px";
      this.nameInput.style.top = "240px";
      this.nameInput.style.width = "312px";
      this.roomInput.style.left = "42px";
      this.roomInput.style.top = "312px";
      this.roomInput.style.width = "312px";
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

  bindMenuResize() {
    this.handleMenuResize = (gameSize) => {
      const width = gameSize.width;
      const height = gameSize.height;
      const compact = width < 1360;
      this.titleText.setFontSize(width < 1200 ? 42 : 54);
      this.subtitleText.setFontSize(width < 1200 ? 16 : 18).setWordWrapWidth(Math.max(420, width - 120), true);
      this.profileText.setFontSize(compact ? 16 : 17).setWordWrapWidth(340, true).setLineSpacing(-4);
      this.serverText.setFontSize(compact ? 13 : 14).setWordWrapWidth(340, true).setLineSpacing(-4);
      this.roomText.setFontSize(compact ? 20 : 24);
      this.lobbySummary.setFontSize(compact ? 14 : 15).setWordWrapWidth(340, true).setLineSpacing(-4);
      this.statusText.setPosition(34, height - 42).setWordWrapWidth(width - 60, true).setFontSize(compact ? 16 : 18);
      Object.values(this.buttons).forEach((button) => {
        button.text.setFontSize(compact ? 16 : 18).setWordWrapWidth(316, true);
      });
      this.startMatchButton.text.setFontSize(compact ? 16 : 18).setWordWrapWidth(316, true);
      this.layoutSlotsPanel(width);
      this.slotRows.forEach((row) => {
        row.controlButton.text.setFontSize(compact ? 12 : 15);
        row.factionButton.text.setFontSize(compact ? 12 : 15);
        row.teamButton.text.setFontSize(compact ? 12 : 15);
      });
    };
    this.scale.on("resize", this.handleMenuResize);
    this.handleMenuResize(this.scale.gameSize);
    this.events.once("shutdown", () => {
      if (this.handleMenuResize) {
        this.scale.off("resize", this.handleMenuResize);
        this.handleMenuResize = null;
      }
    });
  }

  bindVisibilityRecovery() {
    this.handleMenuVisibilityChange = () => this.resetMenuInputState();
    this.handleMenuWindowBlur = () => this.resetMenuInputState();
    this.handleMenuWindowFocus = () => this.resetMenuInputState();
    document.addEventListener("visibilitychange", this.handleMenuVisibilityChange);
    window.addEventListener("blur", this.handleMenuWindowBlur);
    window.addEventListener("focus", this.handleMenuWindowFocus);
    this.events.once("shutdown", () => this.unbindVisibilityRecovery());
    this.events.once("destroy", () => this.unbindVisibilityRecovery());
  }

  unbindVisibilityRecovery() {
    if (this.handleMenuVisibilityChange) {
      document.removeEventListener("visibilitychange", this.handleMenuVisibilityChange);
      this.handleMenuVisibilityChange = null;
    }
    if (this.handleMenuWindowBlur) {
      window.removeEventListener("blur", this.handleMenuWindowBlur);
      this.handleMenuWindowBlur = null;
    }
    if (this.handleMenuWindowFocus) {
      window.removeEventListener("focus", this.handleMenuWindowFocus);
      this.handleMenuWindowFocus = null;
    }
  }

  resetMenuInputState() {
    this.input?.keyboard?.resetKeys?.();
    const pointers = this.input?.manager?.pointers ?? [];
    pointers.forEach((pointer) => pointer?.reset?.());
    this.input?.activePointer?.reset?.();
  }

  buildDefaultSlots() {
    return [
      { slot: 0, controller: "human", faction: "kingdom", team: 1, name: this.playerName, connected: true, playerId: "local-player", isHost: true },
      { slot: 1, controller: "human", faction: "wildkin", team: 2, name: "Открытый слот", connected: false, playerId: null, isHost: false },
      { slot: 2, controller: "bot", faction: "dusk", team: 2, name: makeBotName("dusk"), connected: false, playerId: null, isHost: false },
      { slot: 3, controller: "open", faction: "ember", team: 2, name: "Пустой слот", connected: false, playerId: null, isHost: false }
    ];
  }

  syncLocalPlayerSlot() {
    this.localSlots[0].name = this.playerName;
    this.localSlots[0].faction = this.selectedFaction;
    this.localSlots[0].controller = "human";
    this.localSlots[0].connected = true;
  }

  normalizeLobbySlots(message) {
    if (Array.isArray(message.slots) && message.slots.length) {
      return message.slots.map((slot, index) => ({
        slot: slot.slot ?? index,
        controller: slot.controller ?? (slot.playerId ? "human" : "open"),
        faction: slot.faction ?? this.localSlots[index]?.faction ?? "kingdom",
        team: slot.team ?? this.localSlots[index]?.team ?? (index === 0 ? 1 : 2),
        name: slot.name ?? this.localSlots[index]?.name ?? "Слот",
        connected: slot.connected ?? Boolean(slot.playerId),
        playerId: slot.playerId ?? null,
        isHost: Boolean(slot.isHost)
      }));
    }

    const fallback = this.localSlots.map((slot) => ({
      ...slot,
      connected: false,
      playerId: null,
      isHost: false
    }));

    (message.players ?? []).forEach((player, index) => {
      const slotIndex = player.slot ?? index;
      const base = fallback[slotIndex] ?? fallback[index];
      if (!base) {
        return;
      }
      base.controller = "human";
      base.connected = true;
      base.playerId = player.id;
      base.name = player.name;
      base.faction = player.faction ?? base.faction;
      base.isHost = Boolean(player.isHost);
    });

    return fallback;
  }

  getDisplayedSlots() {
    return this.lobbyState?.slots?.length ? this.lobbyState.slots : this.localSlots;
  }

  getSlotControllerLabel(controller, slot, isSingleLocal = false) {
    if (slot.slot === 0 && !this.lobbyState) {
      return "Вы";
    }
    if (controller === "human") {
      return slot.connected ? "Игрок" : isSingleLocal ? "Союзник" : "Открыт";
    }
    if (controller === "bot") {
      return "Бот";
    }
    return "Пусто";
  }

  canEditSlot(slotIndex) {
    if (this.lobbyState) {
      return this.isLobbyHost;
    }
    return true;
  }

  cycleSlotController(slotIndex) {
    if (!this.canEditSlot(slotIndex) || slotIndex === 0) {
      return;
    }

    const slot = this.localSlots[slotIndex];
    const order = ["bot", "human", "open"];
    slot.controller = order[(order.indexOf(slot.controller) + 1) % order.length];

    if (slot.controller === "bot") {
      slot.name = makeBotName(slot.faction);
      slot.connected = false;
      slot.playerId = null;
    } else if (slot.controller === "human") {
      slot.name = "Открытый слот";
      slot.connected = false;
      slot.playerId = null;
    } else {
      slot.name = "Пустой слот";
      slot.connected = false;
      slot.playerId = null;
    }

    this.pushSlotUpdate(slotIndex);
    this.refreshSlotRows();
    this.updateLobbySummary();
  }

  cycleSlotFaction(slotIndex) {
    if (!this.canEditSlot(slotIndex)) {
      return;
    }

    const slot = this.localSlots[slotIndex];
    const currentIndex = FACTION_ORDER.indexOf(slot.faction);
    slot.faction = FACTION_ORDER[(currentIndex + 1) % FACTION_ORDER.length];

    if (slotIndex === 0) {
      this.selectedFaction = slot.faction;
      this.refreshFactionCards();
    }

    if (!slot.playerId && slot.controller === "bot") {
      slot.name = makeBotName(slot.faction);
    }

    this.pushSlotUpdate(slotIndex);
    this.refreshSlotRows();
  }

  cycleSlotTeam(slotIndex) {
    if (!this.canEditSlot(slotIndex)) {
      return;
    }

    const slot = this.localSlots[slotIndex];
    const currentIndex = TEAM_SEQUENCE.indexOf(slot.team);
    slot.team = TEAM_SEQUENCE[(currentIndex + 1) % TEAM_SEQUENCE.length];
    this.pushSlotUpdate(slotIndex);
    this.refreshSlotRows();
    this.updateLobbySummary();
  }

  pushSlotUpdate(slotIndex) {
    if (!this.isLobbyHost || !this.netClient?.connected) {
      return;
    }
    const slot = this.localSlots[slotIndex];
    this.netClient.send("update_slot", {
      slot: slotIndex,
      patch: {
        controller: slot.controller,
        faction: slot.faction,
        team: slot.team,
        name: slot.controller === "bot" ? slot.name : undefined
      }
    });
  }

  refreshSlotRows() {
    const displayedSlots = this.getDisplayedSlots();
    this.slotRows.forEach((row, index) => {
      const slot = displayedSlots[index];
      if (!slot) {
        return;
      }

      const faction = FACTION_DEFS[slot.faction] ?? FACTION_DEFS.kingdom;
      const editable = this.canEditSlot(index);
      const stateLabel = slot.connected ? "в сети" : slot.controller === "bot" ? "автоигра" : "ожидание";
      const roleLabel = slot.isHost ? "хост" : this.getSlotControllerLabel(slot.controller, slot, !this.lobbyState).toLowerCase();
      row.bg.setFillStyle(index % 2 === 0 ? 0x19110d : 0x17100d, 0.95).setStrokeStyle(1, faction.color, 0.65);
      row.name.setText(slot.name);
      row.state.setText(`${roleLabel} • ${stateLabel}`);
      row.controlButton.text.setText(this.getSlotControllerLabel(slot.controller, slot, !this.lobbyState)).setColor(editable || index === 0 ? "#f4efe2" : "#8e8578");
      row.factionButton.text.setText(faction.name).setColor(editable ? faction.ui : "#8e8578");
      row.teamButton.text.setText(TEAM_LABELS[slot.team] ?? `Команда ${slot.team}`).setColor(editable ? "#f4efe2" : "#8e8578");
      row.controlButton.bg.setFillStyle(editable && index !== 0 ? 0x241a13 : 0x1c1714, 0.96);
      row.factionButton.bg.setFillStyle(editable ? 0x241a13 : 0x1c1714, 0.96);
      row.teamButton.bg.setFillStyle(editable ? 0x241a13 : 0x1c1714, 0.96);
    });
  }

  updateLobbySummary() {
    const slots = this.getDisplayedSlots();
    const active = slots.filter((slot) => slot.controller === "bot" || (slot.controller === "human" && (slot.connected || !this.lobbyState))).length;
    const teams = [...new Set(slots.filter((slot) => slot.controller !== "open").map((slot) => slot.team))];
    this.lobbySummary.setText([
      `Активные слоты: ${active}/4`,
      `Комнатный код: ${this.lobbyState?.roomCode ?? "не создан"}`,
      `Команд в лобби: ${teams.length}`
    ].join("\n"));
    const hasRoom = Boolean(this.lobbyState?.roomCode || this.roomInput?.value?.trim());
    this.setStartButtonEnabled(Boolean(this.isLobbyHost && hasRoom));
  }

  setStartButtonEnabled(enabled) {
    this.startMatchButton.bg.setFillStyle(enabled ? 0x3a2c1c : 0x201812, 0.96);
    this.startMatchButton.text.setColor(enabled ? "#fff0cf" : "#8f8474");
    if (this.startMatchButton.bg.input) {
      this.startMatchButton.bg.input.enabled = true;
      this.startMatchButton.bg.input.cursor = "pointer";
    }
  }

  refreshActionButtons() {
    const inLobby = Boolean(this.lobbyState);
    this.setWideButtonEnabled(this.buttons.skirmish, !inLobby);
    this.setWideButtonEnabled(this.buttons.host, !inLobby);
    this.setWideButtonEnabled(this.buttons.join, !inLobby);
  }

  selectFaction(factionKey) {
    this.selectedFaction = factionKey;
    this.localSlots[0].faction = factionKey;
    this.pushSlotUpdate(0);
    this.refreshFactionCards();
    this.refreshSlotRows();
  }

  refreshFactionCards() {
    this.factionCards.forEach((card) => {
      const active = card.key === this.selectedFaction;
      card.panel.setFillStyle(FACTION_DEFS[card.key].color, active ? 0.34 : 0.16);
      card.panel.setStrokeStyle(active ? 4 : 2, active ? 0xf4ead1 : FACTION_DEFS[card.key].color, 0.96);
    });
  }

  async initializeIdentity() {
    this.statusText.setText("Авторизация...");
    try {
      this.playFabIdentity = await loginWithCustomId(this.playerName);
      this.playerName = this.playFabIdentity.displayName || this.playerName;
      this.nameInput.value = this.playerName;
      this.syncLocalPlayerSlot();
      this.profileText.setText(
        this.playFabIdentity.enabled
          ? `Профиль: ${this.playerName}  |  PlayFab ${this.playFabIdentity.playFabId}`
          : `Профиль: ${this.playerName}  |  без PlayFab`
      );
      this.statusText.setText(this.playFabIdentity.enabled ? "PlayFab подключён." : "Профиль готов. Сетевая игра доступна без PlayFab.");
      this.refreshSlotRows();
    } catch (error) {
      this.profileText.setText("Профиль: игрок  |  вход PlayFab не удался");
      this.statusText.setText("PlayFab недоступен. Сетевая игра всё равно может работать.");
      console.error(error);
    }
  }

  async renameProfile() {
    const nextName = this.nameInput?.value.trim();
    if (!nextName) {
      return;
    }
    if (nextName.length < 3 || nextName.length > 25) {
      this.statusText.setText("Имя должно быть длиной от 3 до 25 символов.");
      return;
    }

    if (!this.playFabIdentity?.enabled) {
      this.playerName = nextName;
      this.syncLocalPlayerSlot();
      this.profileText.setText(`Профиль: ${this.playerName}  |  без PlayFab`);
      this.statusText.setText("Профиль переименован.");
      this.refreshSlotRows();
      return;
    }

    this.statusText.setText("Обновляю имя в PlayFab...");
    try {
      const result = await updateUserTitleDisplayName(this.playFabIdentity.sessionTicket, nextName);
      this.playerName = result.DisplayName || nextName;
      this.playFabIdentity.displayName = this.playerName;
      this.nameInput.value = this.playerName;
      this.syncLocalPlayerSlot();
      this.profileText.setText(`Профиль: ${this.playerName}  |  PlayFab ${this.playFabIdentity.playFabId}`);
      this.statusText.setText("Имя профиля обновлено.");
      this.refreshSlotRows();
    } catch (error) {
      this.statusText.setText("Не удалось обновить имя в PlayFab.");
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
    return this.serverUrl ? `Сервер: ${this.serverUrl}` : "Сервер не настроен";
  }

  validateServerUrl(url) {
    if (!url) {
      return this.isPublicSite ? "Для публичной сборки нужен адрес websocket-сервера." : "Адрес websocket-сервера не задан.";
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return "Некорректный WS URL.";
    }

    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return "Адрес должен начинаться с ws:// или wss://";
    }
    if (this.isPublicSite && parsed.protocol !== "wss:") {
      return "Публичной версии нужен защищённый wss:// адрес.";
    }
    if (this.isPublicSite && isLoopbackUrl(url)) {
      return "localhost недоступен для внешних клиентов.";
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

    this.serverText.setText(this.getServerStatusText());
    this.statusText.setText(`Подключение к ${this.serverUrl} ...`);

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
      this.connectedPlayerId = message.playerId ?? this.connectedPlayerId;
      this.roomInput.value = message.roomCode;
      this.roomText.setText(`Комната: ${message.roomCode}`);
      this.statusText.setText(`Лобби ${message.roomCode} создано.`);
      this.setStartButtonEnabled(true);
      this.refreshActionButtons();
    });

    client.on("room_joined", (message) => {
      this.isLobbyHost = false;
      this.connectedPlayerId = message.playerId ?? this.connectedPlayerId;
      this.roomInput.value = message.roomCode;
      this.roomText.setText(`Комната: ${message.roomCode}`);
      this.statusText.setText(`Подключение к комнате ${message.roomCode} выполнено.`);
      this.setStartButtonEnabled(false);
      this.refreshActionButtons();
    });

    client.on("lobby_update", (message) => {
      const normalizedSlots = this.normalizeLobbySlots(message);
      this.localSlots = normalizedSlots.map((slot) => ({ ...slot }));
      this.lobbyState = {
        ...message,
        slots: normalizedSlots
      };
      const serverSaysHost = message.hostId === this.connectedPlayerId
        || Boolean(message.players?.find((player) => player.id === this.connectedPlayerId)?.isHost);
      this.isLobbyHost = this.isLobbyHost || serverSaysHost;
      this.roomText.setText(`Комната: ${message.roomCode}`);
      this.refreshSlotRows();
      this.updateLobbySummary();
      this.refreshActionButtons();
      this.statusText.setText(
        this.isLobbyHost ? "Лобби готово. Настрой слоты и запускай матч." : "Ожидание старта матча от хоста."
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
      this.lobbyState = null;
      this.isLobbyHost = false;
      this.refreshActionButtons();
      this.roomText.setText("Комната: локальная схватка");
      this.statusText.setText("Соединение с сервером разорвано.");
      this.refreshSlotRows();
      this.updateLobbySummary();
    });
  }

  collectRoomSlotsPayload() {
    return this.localSlots.map((slot, index) => ({
      slot: index,
      controller: index === 0 ? "human" : slot.controller,
      faction: slot.faction,
      team: slot.team,
      name: slot.controller === "bot" ? slot.name : undefined
    }));
  }

  buildSingleplayerRoster() {
    const roster = [
      {
        playerId: "local-player",
        faction: this.localSlots[0].faction,
        slot: 0,
        team: this.localSlots[0].team,
        isHuman: true,
        isHost: true,
        name: this.playerName
      }
    ];

    this.localSlots.slice(1).forEach((slot, index) => {
      if (slot.controller === "open") {
        return;
      }
      roster.push({
        playerId: `ai-${index + 1}`,
        faction: slot.faction,
        slot: index + 1,
        team: slot.team,
        isHuman: false,
        isHost: false,
        name: slot.controller === "bot" ? slot.name : makeBotName(slot.faction)
      });
    });

    if (roster.length < 2) {
      roster.push({
        playerId: "ai-fallback",
        faction: "wildkin",
        slot: 1,
        team: 2,
        isHuman: false,
        isHost: false,
        name: makeBotName("wildkin")
      });
    }

    return roster.slice(0, 4);
  }

  startSingleplayer() {
    if (this.lobbyState) {
      this.statusText.setText("Сначала выйди из сетевого лобби или дождись старта матча хостом.");
      return;
    }
    this.playerName = this.nameInput?.value.trim() || this.playerName;
    this.syncLocalPlayerSlot();
    this.scene.start("game", {
      mode: "singleplayer",
      localPlayerId: "local-player",
      selectedFaction: this.selectedFaction,
      roster: this.buildSingleplayerRoster()
    });
  }

  async hostMultiplayer() {
    try {
      const client = await this.prepareNetwork();
      this.playerName = this.nameInput?.value.trim() || this.playerName;
      this.syncLocalPlayerSlot();
      client.send("create_room", {
        name: this.playerName,
        faction: this.selectedFaction,
        team: this.localSlots[0].team,
        slots: this.collectRoomSlotsPayload()
      });
    } catch (error) {
      this.statusText.setText(error.message || "Не удалось подключиться к серверу.");
      console.error(error);
    }
  }

  async joinMultiplayer() {
    const roomCode = this.roomInput?.value.trim().toUpperCase();
    if (!roomCode) {
      this.statusText.setText("Сначала введи код комнаты.");
      return;
    }

    try {
      const client = await this.prepareNetwork();
      this.playerName = this.nameInput?.value.trim() || this.playerName;
      client.send("join_room", {
        roomCode,
        name: this.playerName,
        faction: this.selectedFaction,
        team: this.localSlots[0].team
      });
    } catch (error) {
      this.statusText.setText(error.message || "Не удалось подключиться к серверу.");
      console.error(error);
    }
  }

  launchMultiplayerGame(client, message) {
    this.scene.start("game", {
      mode: "multiplayer",
      netClient: client,
      localPlayerId: this.connectedPlayerId,
      hostId: message.hostId,
      roster: message.slots
    });
  }
}
