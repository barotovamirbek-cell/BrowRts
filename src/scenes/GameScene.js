import Phaser from "phaser";
import { BUILDING_DEFS, MAP_HEIGHT, MAP_WIDTH, RESOURCE_TYPES, UNIT_DEFS } from "../game/defs.js";
import { FACTION_DEFS, FACTION_ORDER } from "../game/factions.js";
import { clamp, distance, distanceSq, formatCost, makeSelectionRect, pointInRect } from "../game/utils.js";

const SPAWNS = [
  { x: 340, y: 1560 },
  { x: 2820, y: 620 },
  { x: 420, y: 520 },
  { x: 2820, y: 1600 }
];

const UNIT_VISUALS = {
  worker: { idle: [106], move: [106, 107], attack: [107], scale: 2.2 },
  swordsman: { idle: [107], move: [107, 106], attack: [161], scale: 2.2 },
  archer: { idle: [178], move: [178, 179], attack: [179], scale: 2.2 }
};

const FACTION_BUILDING_BASE = {
  kingdom: 8,
  wildkin: 26,
  dusk: 44,
  ember: 62
};

const BUILDING_FRAME_OFFSETS = {
  townhall: 1,
  farm: 6,
  barracks: 4,
  tower: 5
};

const RESOURCE_VISUALS = {
  wood: { frame: 112, scale: 2.3, shadowScale: [1.05, 0.82] },
  gold: { frame: 5, scale: 2.3, shadowScale: [1.25, 0.85] }
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  init(data) {
    this.mode = data.mode ?? "singleplayer";
    this.netClient = data.netClient ?? null;
    this.hostId = data.hostId ?? data.localPlayerId;
    this.localPlayerId = data.localPlayerId;
    this.isHost = this.mode === "singleplayer" || this.localPlayerId === this.hostId;
    this.roster = this.normalizeRoster(data.roster ?? [], data.selectedFaction ?? "kingdom");
  }

  normalizeRoster(roster, selectedFaction) {
    const entries = roster.map((entry, index) => ({
      playerId: entry.playerId,
      faction: entry.faction,
      slot: entry.slot ?? index,
      isHuman: entry.isHuman ?? true,
      isHost: entry.isHost ?? false,
      name: entry.name ?? entry.playerId
    }));

    const usedFactions = new Set(entries.map((entry) => entry.faction));
    let aiIndex = 1;
    for (const faction of FACTION_ORDER) {
      if (entries.length >= 4) {
        break;
      }
      if (usedFactions.has(faction)) {
        continue;
      }
      entries.push({
        playerId: `ai-${aiIndex++}`,
        faction,
        slot: entries.length,
        isHuman: false,
        isHost: false,
        name: `${FACTION_DEFS[faction].name} AI`
      });
    }

    if (!entries.some((entry) => entry.playerId === this.localPlayerId)) {
      entries[0].playerId = this.localPlayerId;
      entries[0].faction = selectedFaction;
      entries[0].isHuman = true;
    }

    return entries.slice(0, 4);
  }

  getUnitFrames(unitType, factionKey) {
    const unitVisual = UNIT_VISUALS[unitType] ?? UNIT_VISUALS.worker;
    return {
      idle: [...unitVisual.idle],
      move: [...unitVisual.move],
      attack: [...unitVisual.attack],
      scale: unitVisual.scale
    };
  }

  getBuildingFrame(buildingType, factionKey) {
    const base = FACTION_BUILDING_BASE[factionKey] ?? FACTION_BUILDING_BASE.kingdom;
    return base + (BUILDING_FRAME_OFFSETS[buildingType] ?? 0);
  }

  create() {
    this.state = {
      players: {},
      units: [],
      buildings: [],
      resourcesNodes: [],
      selected: [],
      nextId: 1,
      buildMode: null,
      placingGhost: null,
      result: null,
      message: "",
      messageUntil: 0,
      ai: {},
      snapshotSeen: false,
      matchStartedAt: this.time.now
    };

    this.roster.forEach((entry) => {
      this.state.players[entry.playerId] = {
        ...entry,
        factionDef: FACTION_DEFS[entry.faction],
        resources: { gold: 320, wood: 260, supplyUsed: 0, supplyCap: 0 }
      };
      this.state.ai[entry.playerId] = {
        nextDecisionAt: Phaser.Math.Between(900, 2200),
        nextAttackAt: this.time.now + Phaser.Math.Between(90000, 125000),
        attackWave: 0
      };
    });

    this.input.mouse.disableContextMenu();
    this.createMap();
    this.createUI();
    this.setupInput();
    this.bindResize();
    this.setupNetworking();
    this.createScreenPulse();

    if (this.isHost) {
      this.createWorldState();
      this.showMessage("Expand, train and break the rival factions.");
    } else {
      this.showMessage("Waiting for host snapshots...");
    }
  }

  setupNetworking() {
    if (!this.netClient) {
      return;
    }

    this.netClient.on("input", (message) => {
      if (!this.isHost) {
        return;
      }
      this.applyRemoteCommands(message.fromPlayerId, message.commands ?? []);
    });

    this.netClient.on("state", (message) => {
      if (this.isHost) {
        return;
      }
      this.applySnapshot(message);
    });
  }

  createMap() {
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    const baseTint = this.add.graphics();
    baseTint.fillGradientStyle(0x689d63, 0x75ab6b, 0x4e7e52, 0x5b8b57, 1);
    baseTint.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    const grassBase = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, "tinyBattleTiles", 0).setOrigin(0).setAlpha(0.55);
    grassBase.tileScaleX = 2;
    grassBase.tileScaleY = 2;

    const grassNoise = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, "tinyBattleTiles", 1).setOrigin(0).setAlpha(0.18);
    grassNoise.tileScaleX = 2;
    grassNoise.tileScaleY = 2;

    const mossBand = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, "tinyBattleTiles", 2).setOrigin(0).setAlpha(0.08);
    mossBand.tileScaleX = 2;
    mossBand.tileScaleY = 2;

    const vignette = this.add.graphics();
    vignette.fillStyle(0x1a140f, 0.14);
    vignette.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    vignette.fillStyle(0x2d5935, 0.1);
    for (let i = 0; i < 120; i += 1) {
      vignette.fillCircle(
        Phaser.Math.Between(0, MAP_WIDTH),
        Phaser.Math.Between(0, MAP_HEIGHT),
        Phaser.Math.Between(20, 70)
      );
    }

    const river = this.add.graphics();
    river.fillStyle(0x2f6f78, 0.28);
    river.fillPoints(
      [
        new Phaser.Geom.Point(460, 0),
        new Phaser.Geom.Point(620, 160),
        new Phaser.Geom.Point(760, 380),
        new Phaser.Geom.Point(780, 710),
        new Phaser.Geom.Point(740, 980),
        new Phaser.Geom.Point(800, 1320),
        new Phaser.Geom.Point(900, 1740),
        new Phaser.Geom.Point(1010, 2200),
        new Phaser.Geom.Point(1290, 2200),
        new Phaser.Geom.Point(1180, 1750),
        new Phaser.Geom.Point(1070, 1320),
        new Phaser.Geom.Point(1000, 940),
        new Phaser.Geom.Point(1060, 600),
        new Phaser.Geom.Point(980, 280),
        new Phaser.Geom.Point(810, 0)
      ],
      true
    );

    this.overlayLayer = this.add.container();
    this.resourceLayer = this.add.container();
    this.buildingLayer = this.add.container();
    this.unitLayer = this.add.container();
    this.fxLayer = this.add.container();

    const flora = this.add.graphics();
    for (let i = 0; i < 180; i += 1) {
      flora.fillStyle(
        Phaser.Display.Color.GetColor(
          Phaser.Math.Between(56, 92),
          Phaser.Math.Between(90, 138),
          Phaser.Math.Between(48, 80)
        ),
        Phaser.Math.FloatBetween(0.08, 0.18)
      );
      flora.fillEllipse(
        Phaser.Math.Between(0, MAP_WIDTH),
        Phaser.Math.Between(0, MAP_HEIGHT),
        Phaser.Math.Between(14, 40),
        Phaser.Math.Between(10, 28)
      );
    }
    this.overlayLayer.add(flora);

    this.selectionGraphics = this.add.graphics().setScrollFactor(0);
    this.commandMarker = this.add.graphics();
  }

  createScreenPulse() {
    this.uiPulse = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 0).setOrigin(0).setScrollFactor(0);
    this.scale.on("resize", (gameSize) => {
      this.uiPulse.setSize(gameSize.width, gameSize.height);
    });
  }

  createWorldState() {
    this.roster.forEach((entry, index) => {
      const spawn = SPAWNS[index];
      this.spawnStartingBase(entry.playerId, spawn.x, spawn.y, index);
    });

    [
      ["gold", 750, 1260, 1800],
      ["gold", 1120, 1480, 1800],
      ["gold", 2440, 860, 1800],
      ["gold", 2740, 620, 1800],
      ["gold", 680, 560, 1800],
      ["gold", 1490, 1080, 2200],
      ["gold", 2430, 1530, 1800],
      ["wood", 490, 1220, 2600],
      ["wood", 1010, 1710, 2600],
      ["wood", 2450, 1010, 2600],
      ["wood", 2960, 840, 2600],
      ["wood", 330, 310, 2600],
      ["wood", 1660, 420, 2600],
      ["wood", 1860, 1830, 2600]
    ].forEach(([type, x, y, amount]) => this.spawnResource(type, x, y, amount));
  }

  spawnStartingBase(ownerId, x, y, slotIndex) {
    const sign = slotIndex % 2 === 0 ? 1 : -1;
    this.spawnBuilding(ownerId, "townhall", x, y, true);
    this.spawnBuilding(ownerId, "farm", x + sign * 130, y - 100, true);
    this.spawnBuilding(ownerId, "barracks", x + sign * 108, y + 108, true);
    this.spawnUnit(ownerId, "worker", x + sign * 80, y - 42);
    this.spawnUnit(ownerId, "worker", x + sign * 100, y + 18);
    this.spawnUnit(ownerId, "worker", x + sign * 54, y + 74);
    this.spawnUnit(ownerId, "swordsman", x + sign * 28, y - 110);
    this.spawnUnit(ownerId, "archer", x - sign * 20, y - 138);
  }

  createUI() {
    const width = this.scale.width;
    const height = this.scale.height;
    const faction = this.state.players[this.localPlayerId]?.factionDef ?? FACTION_DEFS.kingdom;

    this.ui = {
      topBar: this.add.rectangle(0, 0, width, 54, 0x120f0d, 0.94).setOrigin(0).setScrollFactor(0),
      bottomBar: this.add.rectangle(0, height - 160, width, 160, 0x120f0d, 0.96).setOrigin(0).setScrollFactor(0),
      topAccent: this.add.rectangle(0, 54, width, 2, faction.color, 0.85).setOrigin(0).setScrollFactor(0),
      bottomAccent: this.add.rectangle(0, height - 160, width, 2, faction.color, 0.85).setOrigin(0).setScrollFactor(0),
      title: this.add.text(16, 12, "Ironfront", { fontFamily: "Georgia", fontSize: "26px", color: faction.ui }).setScrollFactor(0),
      stats: this.add.text(186, 14, "", { fontSize: "18px", color: "#f4f2e8" }).setScrollFactor(0),
      status: this.add.text(width - 18, 15, "", { fontSize: "18px", color: "#f0c97a" }).setOrigin(1, 0).setScrollFactor(0),
      selection: this.add.text(20, height - 142, "", { fontSize: "20px", color: "#f4f2e8", wordWrap: { width: 320 } }).setScrollFactor(0),
      details: this.add.text(20, height - 98, "", { fontSize: "15px", color: "#bdb5a4", wordWrap: { width: 360 } }).setScrollFactor(0),
      roster: this.add.text(width - 20, 70, "", { fontSize: "15px", color: "#ddd3c8", align: "right" }).setOrigin(1, 0).setScrollFactor(0),
      hint: this.add.text(width - 20, height - 136, "LMB select  RMB order  B build  X stop  H home", {
        fontSize: "15px",
        color: "#bdb5a4",
        align: "right"
      }).setOrigin(1, 0).setScrollFactor(0),
      minimapFrame: this.add.rectangle(width - 208, height - 146, 188, 128, 0x1f1916, 0.92).setOrigin(0).setStrokeStyle(2, 0x79674f, 0.95).setScrollFactor(0),
      minimapHitbox: this.add.rectangle(width - 208, height - 146, 188, 128, 0x000000, 0.001).setOrigin(0).setScrollFactor(0),
      result: this.add.text(width / 2, 80, "", {
        fontFamily: "Georgia",
        fontSize: "42px",
        color: "#fff0c8",
        stroke: "#000000",
        strokeThickness: 4
      }).setOrigin(0.5, 0).setVisible(false).setScrollFactor(0),
      buttons: []
    };

    this.minimap = this.add.graphics().setScrollFactor(0);
    this.ui.minimapHitbox
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (pointer) => this.handleMinimapNavigation(pointer))
      .on("pointermove", (pointer) => {
        if (pointer.isDown) {
          this.handleMinimapNavigation(pointer);
        }
      });
    this.buildCommandButtons();
  }

  buildCommandButtons() {
    this.ui.buttons.forEach((button) => button.container.destroy());
    this.ui.buttons = [];
    const defs = [
      { key: "build-farm", label: "Farm", type: "build", value: "farm" },
      { key: "build-barracks", label: "Barracks", type: "build", value: "barracks" },
      { key: "build-tower", label: "Tower", type: "build", value: "tower" },
      { key: "train-worker", label: "Worker", type: "train", value: "worker" },
      { key: "train-swordsman", label: "Swordsman", type: "train", value: "swordsman" },
      { key: "train-archer", label: "Archer", type: "train", value: "archer" },
      { key: "cancel", label: "Cancel", type: "cancel", value: null }
    ];

    defs.forEach((def, index) => {
      const x = 390 + (index % 4) * 148;
      const y = this.scale.height - 136 + Math.floor(index / 4) * 58;
      const bg = this.add.rectangle(x, y, 132, 42, 0x2a241e, 0.95).setStrokeStyle(2, 0x7d6f5c, 0.9);
      const text = this.add.text(x, y, def.label, { fontSize: "16px", color: "#f4f2e6", align: "center" }).setOrigin(0.5);
      const container = this.add.container(0, 0, [bg, text]).setVisible(false).setScrollFactor(0);
      bg.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.handleCommandButton(def));
      this.ui.buttons.push({ ...def, container, bg, text });
    });
  }

  bindResize() {
    this.scale.on("resize", (gameSize) => {
      const width = gameSize.width;
      const height = gameSize.height;
      this.ui.topBar.setSize(width, 54);
      this.ui.bottomBar.setPosition(0, height - 160).setSize(width, 160);
      this.ui.topAccent.setSize(width, 2);
      this.ui.bottomAccent.setPosition(0, height - 160).setSize(width, 2);
      this.ui.status.setPosition(width - 18, 15);
      this.ui.selection.setPosition(20, height - 142);
      this.ui.details.setPosition(20, height - 98);
      this.ui.roster.setPosition(width - 20, 70);
      this.ui.hint.setPosition(width - 20, height - 136);
      this.ui.minimapFrame.setPosition(width - 208, height - 146);
      this.ui.minimapHitbox.setPosition(width - 208, height - 146);
      this.ui.result.setPosition(width / 2, 80);
      this.buildCommandButtons();
    });
  }

  isPointerOverMinimap(pointer) {
    const frame = this.ui.minimapFrame;
    return pointer.x >= frame.x && pointer.x <= frame.x + frame.width && pointer.y >= frame.y && pointer.y <= frame.y + frame.height;
  }

  handleMinimapNavigation(pointer) {
    const frame = this.ui.minimapFrame;
    const inset = 6;
    const width = frame.width - inset * 2;
    const height = frame.height - inset * 2;
    const localX = clamp(pointer.x - frame.x - inset, 0, width);
    const localY = clamp(pointer.y - frame.y - inset, 0, height);
    const worldX = (localX / width) * MAP_WIDTH;
    const worldY = (localY / height) * MAP_HEIGHT;
    const cam = this.cameras.main;
    cam.centerOn(worldX, worldY);
    cam.scrollX = clamp(cam.scrollX, 0, MAP_WIDTH - cam.width / cam.zoom);
    cam.scrollY = clamp(cam.scrollY, 0, MAP_HEIGHT - cam.height / cam.zoom);
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      build: Phaser.Input.Keyboard.KeyCodes.B,
      stop: Phaser.Input.Keyboard.KeyCodes.X,
      home: Phaser.Input.Keyboard.KeyCodes.H
    });

    this.dragSelect = { active: false, start: new Phaser.Math.Vector2(), end: new Phaser.Math.Vector2() };

    this.input.on("pointerdown", (pointer) => {
      if (this.isPointerOverMinimap(pointer)) {
        return;
      }

      if (pointer.leftButtonDown()) {
        const worldPoint = pointer.positionToCamera(this.cameras.main);
        if (this.state.buildMode) {
          this.tryPlaceBuilding(worldPoint);
          return;
        }
        this.dragSelect.active = true;
        this.dragSelect.start.set(worldPoint.x, worldPoint.y);
        this.dragSelect.end.set(worldPoint.x, worldPoint.y);
      }

      if (pointer.rightButtonDown()) {
        this.handleRightClick(pointer.positionToCamera(this.cameras.main));
      }
    });

    this.input.on("pointermove", (pointer) => {
      const worldPoint = pointer.positionToCamera(this.cameras.main);
      if (this.dragSelect.active) {
        this.dragSelect.end.set(worldPoint.x, worldPoint.y);
      }
      if (this.state.placingGhost) {
        this.state.placingGhost.setPosition(worldPoint.x, worldPoint.y);
      }
    });

    this.input.on("pointerup", (pointer) => {
      if (!this.dragSelect.active) {
        return;
      }
      this.dragSelect.active = false;
      const rect = makeSelectionRect(this.dragSelect.start, this.dragSelect.end);
      const withShift = Boolean(pointer.event?.shiftKey);
      if (rect.width < 10 && rect.height < 10) {
        this.handleSingleSelection(pointer.positionToCamera(this.cameras.main), withShift);
      } else {
        this.selectInRect(rect, withShift);
      }
      this.selectionGraphics.clear();
    });

    this.input.on("wheel", (_pointer, _gos, _dx, dy) => {
      this.cameras.main.zoom = clamp(this.cameras.main.zoom - dy * 0.001, 0.7, 1.35);
    });
  }

  spawnResource(type, x, y, amount) {
    const visual = RESOURCE_VISUALS[type] ?? RESOURCE_VISUALS.wood;
    const shadow = this.add
      .image(x, y + 20, "shadow-oval")
      .setScale(visual.shadowScale[0], visual.shadowScale[1])
      .setAlpha(0.22)
      .setTint(0x000000);
    const sprite = this.add.image(x, y, "tinyBattleTiles", visual.frame).setScale(visual.scale);
    this.resourceLayer.add([shadow, sprite]);
    const node = { id: this.state.nextId++, kind: "resource", type, x, y, amount, sprite, shadow, radius: type === "gold" ? 30 : 26 };
    sprite.setData("entity", node);
    this.state.resourcesNodes.push(node);
    return node;
  }

  spawnUnit(ownerId, type, x, y, fixedId = null) {
    const owner = this.state.players[ownerId];
    const faction = owner.factionDef;
    const def = UNIT_DEFS[type];
    const frames = this.getUnitFrames(type, faction.key);
    const shadow = this.add.image(x, y + 14, "shadow-oval").setScale(0.62).setAlpha(0.26).setTint(0x000000);
    const sprite = this.add.image(x, y, "tinyBattleTiles", frames.idle[0]).setScale(frames.scale);
    const marker = this.add.circle(x, y - 16, 3, faction.color, 0.95).setStrokeStyle(1, 0x1a140f, 0.95);
    const hpBg = this.add.rectangle(x, y - 18, 30, 4, 0x000000, 0.6);
    const hpFill = this.add.rectangle(x - 15, y - 18, 30, 4, 0x6dd66d, 1).setOrigin(0, 0.5);
    const selection = this.add.circle(x, y, def.radius + 6).setStrokeStyle(2, 0xf4f1d0, 0.95).setVisible(false);
    this.unitLayer.add([shadow, selection, sprite, marker, hpBg, hpFill]);

    const entity = {
      id: fixedId ?? this.state.nextId++,
      kind: "unit",
      ownerId,
      type,
      def,
      x,
      y,
      hp: def.maxHp,
      shadow,
      sprite,
      marker,
      hpBg,
      hpFill,
      selection,
      state: "idle",
      moveTarget: null,
      attackTarget: null,
      resourceTarget: null,
      buildTarget: null,
      lastAttackAt: 0,
      carry: null,
      faction,
      visualPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      frames,
      animIndex: 0,
      animTime: 0,
      prevX: x,
      prevY: y
    };

    sprite.setData("entity", entity);
    this.state.units.push(entity);
    this.updateSupply(ownerId);
    return entity;
  }

  spawnBuilding(ownerId, type, x, y, completed, fixedId = null) {
    const owner = this.state.players[ownerId];
    const faction = owner.factionDef;
    const def = BUILDING_DEFS[type];
    const frame = this.getBuildingFrame(type, faction.key);
    const shadow = this.add.image(x, y + def.size * 0.34, "shadow-oval").setScale(def.size / 44, 1.05).setAlpha(0.22).setTint(0x000000);
    const spriteScale = Math.max(3, Math.round(def.size / 16));
    const sprite = this.add.image(x, y, "tinyBattleTiles", frame).setScale(spriteScale);
    const banner = this.add.rectangle(x, y - def.size * 0.35, Math.max(8, def.size * 0.22), Math.max(8, def.size * 0.18), faction.color, 0.95).setStrokeStyle(1, 0x18120e, 0.95);
    const hpBg = this.add.rectangle(x, y - def.size / 2 - 10, def.size, 6, 0x000000, 0.66);
    const hpFill = this.add.rectangle(x - def.size / 2, y - def.size / 2 - 10, def.size, 6, 0x6dd66d, 1).setOrigin(0, 0.5);
    const selection = this.add.rectangle(x, y, def.size + 10, def.size + 10).setStrokeStyle(2, 0xf4f1d0, 0.95).setVisible(false);
    const label = this.add.text(x, y + def.size * 0.48, completed ? "" : "Building...", {
      fontSize: "12px",
      color: "#f4efe2"
    }).setOrigin(0.5);
    this.buildingLayer.add([shadow, selection, sprite, banner, label, hpBg, hpFill]);

    const entity = {
      id: fixedId ?? this.state.nextId++,
      kind: "building",
      ownerId,
      type,
      def,
      x,
      y,
      hp: completed ? def.maxHp : Math.ceil(def.maxHp * 0.25),
      shadow,
      sprite,
      banner,
      hpBg,
      hpFill,
      selection,
      label,
      queue: [],
      buildProgress: completed ? def.buildTime : 0,
      completed,
      rallyPoint: { x: x + 100, y: y + 30 },
      lastAttackAt: 0,
      faction
    };

    if (!completed) {
      sprite.setAlpha(0.58);
      label.setAlpha(0.72);
    } else {
      label.setVisible(false);
    }

    sprite.setData("entity", entity);
    this.state.buildings.push(entity);
    this.updateSupply(ownerId);
    return entity;
  }

  update(_time, delta) {
    const now = this.time.now;
    const dt = delta / 1000;
    this.handleCamera(dt);
    this.updateSelectionBox();
    this.updateGhostPlacement();

    if (this.isHost) {
      this.updateUnits(dt, now);
      this.updateBuildings(delta, now);
      this.updateAI(now);
      this.cleanupDestroyed();
      if (this.mode === "multiplayer" && now % 150 < 20) {
        this.broadcastSnapshot();
      }
      this.checkEndConditions();
    }

    this.updateUI(now);
    this.drawMinimap();
  }

  handleCamera(dt) {
    const cam = this.cameras.main;
    const speed = 620 / cam.zoom;
    const pointer = this.input.activePointer;
    const edge = 24;
    if (this.keys.left.isDown || pointer.x < edge) cam.scrollX -= speed * dt;
    if (this.keys.right.isDown || pointer.x > this.scale.width - edge) cam.scrollX += speed * dt;
    if (this.keys.up.isDown || pointer.y < edge) cam.scrollY -= speed * dt;
    if (this.keys.down.isDown || pointer.y > this.scale.height - edge) cam.scrollY += speed * dt;
    cam.scrollX = clamp(cam.scrollX, 0, MAP_WIDTH - cam.width / cam.zoom);
    cam.scrollY = clamp(cam.scrollY, 0, MAP_HEIGHT - cam.height / cam.zoom);

    if (Phaser.Input.Keyboard.JustDown(this.keys.build)) {
      if (this.state.selected.some((entity) => entity.kind === "unit" && entity.type === "worker")) {
        this.enterBuildMode("farm");
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.stop)) {
      const unitIds = this.state.selected.filter((entity) => entity.kind === "unit").map((entity) => entity.id);
      this.issueCommands([{ kind: "stop", unitIds }]);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.home)) {
      const townhall = this.state.buildings.find((entry) => entry.ownerId === this.localPlayerId && entry.type === "townhall");
      if (townhall) {
        cam.centerOn(townhall.x, townhall.y);
      }
    }
  }

  handleSingleSelection(worldPoint, additive) {
    const entity = this.getEntityAt(worldPoint);
    if (!additive) this.clearSelection();
    if (entity && entity.ownerId === this.localPlayerId) this.addToSelection(entity);
  }

  selectInRect(rect, additive) {
    if (!additive) this.clearSelection();
    this.state.units.filter((entry) => entry.ownerId === this.localPlayerId && pointInRect(entry, rect)).forEach((entry) => this.addToSelection(entry));
    if (this.state.selected.length === 0) {
      this.state.buildings.filter((entry) => entry.ownerId === this.localPlayerId && pointInRect(entry, rect)).forEach((entry) => this.addToSelection(entry));
    }
  }

  addToSelection(entity) {
    if (entity.kind === "resource" || this.state.selected.includes(entity)) return;
    entity.selection.setVisible(true);
    this.state.selected.push(entity);
  }

  clearSelection() {
    this.state.selected.forEach((entry) => entry.selection.setVisible(false));
    this.state.selected = [];
  }

  getEntityAt(worldPoint) {
    const hits = [
      ...this.state.units.filter((entry) => distanceSq(entry, worldPoint) <= (entry.def.radius + 4) ** 2),
      ...this.state.buildings.filter((entry) => {
        const half = entry.def.size * 0.6;
        return worldPoint.x >= entry.x - half && worldPoint.x <= entry.x + half && worldPoint.y >= entry.y - half && worldPoint.y <= entry.y + half;
      }),
      ...this.state.resourcesNodes.filter((entry) => distanceSq(entry, worldPoint) <= entry.radius ** 2)
    ];
    return hits[0] ?? null;
  }

  handleRightClick(worldPoint) {
    if (this.state.selected.length === 0) return;
    if (this.state.buildMode) {
      this.cancelBuildMode();
      return;
    }

    const target = this.getEntityAt(worldPoint);
    const selectedUnits = this.state.selected.filter((entry) => entry.kind === "unit");

    if (selectedUnits.length === 0) {
      const building = this.getSingleSelectedBuilding();
      if (building) {
        this.issueCommands([{ kind: "rally", buildingId: building.id, point: worldPoint }]);
      }
      return;
    }

    const formationColumns = Math.ceil(Math.sqrt(selectedUnits.length));
    const commands = selectedUnits.map((unit, index) => {
      const offsetX = (index % formationColumns) * 34;
      const offsetY = Math.floor(index / formationColumns) * 34;
      const point = { x: worldPoint.x + offsetX - formationColumns * 17, y: worldPoint.y + offsetY - 17 };
      if (target?.kind === "resource" && unit.type === "worker") {
        return { kind: "unit_command", unitIds: [unit.id], action: "gather", targetId: target.id };
      }
      if (target?.ownerId && target.ownerId !== unit.ownerId) {
        return { kind: "unit_command", unitIds: [unit.id], action: "attack", targetId: target.id };
      }
      if (target?.kind === "building" && target.ownerId === unit.ownerId && unit.type === "worker" && unit.carry) {
        return { kind: "unit_command", unitIds: [unit.id], action: "return", targetId: target.id };
      }
      return { kind: "unit_command", unitIds: [unit.id], action: "move", point };
    });

    this.issueCommands(commands);
    this.showCommandMarker(worldPoint.x, worldPoint.y, target?.ownerId && target.ownerId !== this.localPlayerId ? 0xd95959 : 0xf4f1d0);
  }

  issueCommands(commands) {
    const filtered = commands.filter(Boolean);
    if (filtered.length === 0) return;
    if (this.isHost) {
      this.applyRemoteCommands(this.localPlayerId, filtered);
    } else {
      this.netClient?.send("input", { commands: filtered });
    }
  }

  applyRemoteCommands(playerId, commands) {
    commands.forEach((command) => {
      if (command.kind === "unit_command") {
        command.unitIds.forEach((unitId) => {
          const unit = this.state.units.find((entry) => entry.id === unitId && entry.ownerId === playerId);
          if (!unit) return;
          if (command.action === "move") this.commandMove(unit, command.point);
          if (command.action === "attack") this.commandAttack(unit, this.getEntityById(command.targetId));
          if (command.action === "gather") this.commandGather(unit, this.getEntityById(command.targetId));
          if (command.action === "return") this.commandReturn(unit, this.getEntityById(command.targetId));
        });
      }
      if (command.kind === "stop") {
        command.unitIds.forEach((unitId) => {
          const unit = this.state.units.find((entry) => entry.id === unitId && entry.ownerId === playerId);
          if (!unit) return;
          unit.state = "idle";
          unit.moveTarget = null;
          unit.attackTarget = null;
          unit.resourceTarget = null;
          unit.buildTarget = null;
        });
      }
      if (command.kind === "rally") {
        const building = this.state.buildings.find((entry) => entry.id === command.buildingId && entry.ownerId === playerId);
        if (building) building.rallyPoint = command.point;
      }
      if (command.kind === "place_building") {
        const def = BUILDING_DEFS[command.buildingType];
        if (!def) return;
        const canPlace = this.canPlaceBuilding(command.buildingType, command.point.x, command.point.y);
        if (!canPlace.ok) {
          this.showPlayerMessage(playerId, `Cannot build here: ${canPlace.reason}`);
          return;
        }
        if (!this.payCost(playerId, def.cost)) {
          this.showPlayerMessage(playerId, "Not enough resources.");
          return;
        }
        const building = this.spawnBuilding(playerId, command.buildingType, command.point.x, command.point.y, false);
        command.workerIds.forEach((workerId, index) => {
          const worker = this.state.units.find((entry) => entry.id === workerId && entry.ownerId === playerId);
          if (!worker) return;
          worker.buildTarget = building;
          worker.state = "building";
          worker.moveTarget = { x: building.x + ((index % 2) * 26) - 13, y: building.y + Math.floor(index / 2) * 26 - 13 };
        });
      }
      if (command.kind === "train") {
        const building = this.state.buildings.find((entry) => entry.id === command.buildingId && entry.ownerId === playerId);
        if (!building) {
          this.showPlayerMessage(playerId, "Select your production building first.");
          return;
        }
        this.queueTraining(building, command.unitType, { silent: playerId !== this.localPlayerId });
      }
    });
  }

  commandMove(unit, point) {
    unit.state = "moving";
    unit.moveTarget = { x: point.x, y: point.y };
    unit.attackTarget = null;
    unit.resourceTarget = null;
    unit.buildTarget = null;
  }

  commandAttack(unit, target) {
    if (!target) return;
    unit.state = "attacking";
    unit.attackTarget = target;
  }

  commandGather(unit, resource) {
    if (!resource) return;
    unit.state = "gathering";
    unit.resourceTarget = resource;
    unit.attackTarget = null;
  }

  commandReturn(unit, building) {
    if (!building) return;
    unit.state = "returning";
    unit.resourceTarget = building;
  }

  updateUnits(dt, now) {
    this.state.units.forEach((unit) => {
      if (unit.dead) return;
      if (unit.state === "moving" && unit.moveTarget) {
        if (this.moveEntityTowards(unit, unit.moveTarget, this.getMoveSpeed(unit) * dt)) {
          unit.state = "idle";
          unit.moveTarget = null;
        }
      } else if (unit.state === "attacking") {
        this.updateCombatantAttack(unit, dt, now);
      } else if (unit.state === "gathering") {
        this.updateWorkerGather(unit, dt);
      } else if (unit.state === "returning") {
        this.updateWorkerReturn(unit, dt);
      } else if (unit.state === "building") {
        this.updateWorkerBuild(unit, dt);
      } else {
        this.autoAcquireTarget(unit);
      }

      const moveX = unit.x - unit.prevX;
      const moveY = unit.y - unit.prevY;
      const isMoving = Math.abs(moveX) + Math.abs(moveY) > 0.14;
      if (moveX < -0.08) unit.sprite.setFlipX(true);
      if (moveX > 0.08) unit.sprite.setFlipX(false);

      unit.animTime += dt * 1000;
      const animCadence = unit.state === "attacking" ? 110 : isMoving ? 150 : 240;
      if (unit.animTime >= animCadence) {
        unit.animTime = 0;
        unit.animIndex = (unit.animIndex + 1) % 2;
      }
      const frameSet =
        unit.state === "attacking"
          ? unit.frames.attack
          : isMoving || unit.state === "gathering" || unit.state === "returning" || unit.state === "building"
            ? unit.frames.move
            : unit.frames.idle;
      unit.sprite.setFrame(frameSet[unit.animIndex % frameSet.length]);

      const attackLift = unit.state === "attacking" ? Math.sin(now * 0.025 + unit.visualPhase) * 1.2 : 0;
      const bob = Math.sin(now * 0.006 + unit.visualPhase) * 1.8;
      unit.shadow.setPosition(unit.x, unit.y + 14).setAlpha(0.2 + Math.abs(bob) * 0.018).setDepth(unit.y - 20);
      unit.sprite.setPosition(unit.x, unit.y + bob - attackLift).setDepth(unit.y + 2);
      unit.marker.setPosition(unit.x, unit.y - 16 + bob).setDepth(unit.y + 4);
      unit.selection.setPosition(unit.x, unit.y).setDepth(unit.y - 2);
      unit.hpBg.setPosition(unit.x, unit.y - 22 + bob).setDepth(unit.y + 8);
      unit.hpFill.setPosition(unit.x - 15, unit.y - 22 + bob).setDisplaySize(30 * (unit.hp / unit.def.maxHp), 4).setDepth(unit.y + 9);

      unit.prevX = unit.x;
      unit.prevY = unit.y;
    });
  }

  updateCombatantAttack(attacker, dt, now) {
    const target = attacker.attackTarget;
    if (!target || target.dead) {
      attacker.attackTarget = null;
      attacker.state = "idle";
      return;
    }
    const range = attacker.def.range + (target.kind === "building" ? target.def.size / 2 : 0);
    if (distance(attacker, target) > range) {
      this.moveEntityTowards(attacker, target, this.getMoveSpeed(attacker) * dt);
      return;
    }
    if (now - attacker.lastAttackAt < attacker.def.attackCooldown) return;
    attacker.lastAttackAt = now;
    this.performAttack(attacker, target);
  }

  performAttack(attacker, target) {
    const isRanged = attacker.kind === "building" || attacker.type === "archer";
    if (!isRanged) {
      this.applyDamage(target, this.getDamage(attacker), attacker);
      return;
    }

    const projectileKey = attacker.kind === "building" ? "projectile" : "projectile-arrow";
    const startX = attacker.x;
    const startY = attacker.kind === "building" ? attacker.y - attacker.def.size * 0.22 : attacker.y - 4;
    const shot = this.add.image(startX, startY, projectileKey).setDepth(startY + 20);
    if (projectileKey === "projectile") {
      shot.setScale(1.2).setTint(0xffc27a);
    } else {
      shot.setScale(0.9).setTint(attacker.faction?.color ?? 0xf4efe2);
      shot.setRotation(Phaser.Math.Angle.Between(startX, startY, target.x, target.y));
    }
    this.fxLayer.add(shot);

    const travelMs = clamp((distance({ x: startX, y: startY }, target) / (attacker.def.projectileSpeed ?? 420)) * 1000, 110, 620);
    this.tweens.add({
      targets: shot,
      x: target.x,
      y: target.y - (target.kind === "building" ? target.def.size * 0.2 : 4),
      duration: travelMs,
      ease: "Linear",
      onComplete: () => {
        shot.destroy();
        if (!target.dead) {
          this.applyDamage(target, this.getDamage(attacker), attacker);
        }
      }
    });
  }

  updateWorkerGather(unit, dt) {
    const node = unit.resourceTarget;
    if (!node || node.dead || node.amount <= 0) {
      unit.state = "idle";
      unit.resourceTarget = null;
      return;
    }
    if (unit.carry && unit.carry.amount >= unit.def.carryLimit) {
      const drop = this.findNearestDropOff(unit.ownerId, unit);
      if (drop) this.commandReturn(unit, drop);
      return;
    }
    if (distance(unit, node) > node.radius + 10) {
      this.moveEntityTowards(unit, node, this.getMoveSpeed(unit) * dt);
      return;
    }
    unit.carry ??= { type: node.type, amount: 0 };
    const gathered = Math.min(node.amount, unit.def.harvestRate * this.getGatherRate(unit) * dt);
    node.amount -= gathered;
    unit.carry.amount += gathered;
    unit.carry.type = node.type;
    if (unit.carry.amount >= unit.def.carryLimit || node.amount <= 0) {
      const drop = this.findNearestDropOff(unit.ownerId, unit);
      if (drop) this.commandReturn(unit, drop);
    }
  }

  updateWorkerReturn(unit, dt) {
    const building = unit.resourceTarget;
    if (!building || building.dead || !unit.carry) {
      unit.state = "idle";
      unit.resourceTarget = null;
      return;
    }
    if (distance(unit, building) > building.def.size * 0.62) {
      this.moveEntityTowards(unit, building, this.getMoveSpeed(unit) * dt);
      return;
    }
    this.state.players[unit.ownerId].resources[unit.carry.type] += unit.carry.amount;
    const nextNode = this.findClosestResource(unit, unit.carry.type);
    unit.carry = null;
    if (nextNode) {
      this.commandGather(unit, nextNode);
    } else {
      unit.state = "idle";
    }
  }

  updateWorkerBuild(unit, dt) {
    const building = unit.buildTarget;
    if (!building || building.dead) {
      unit.state = "idle";
      unit.buildTarget = null;
      return;
    }
    if (distance(unit, building) > building.def.size * 0.62) {
      this.moveEntityTowards(unit, building, this.getMoveSpeed(unit) * dt);
      return;
    }
    if (building.completed) {
      unit.state = "idle";
      unit.buildTarget = null;
      return;
    }
    building.buildProgress += dt * 1000 * unit.faction.modifiers.buildSpeed;
    building.hp = clamp(building.hp + dt * (building.def.maxHp / (building.def.buildTime / 1000)), 0, building.def.maxHp);
    if (building.buildProgress >= building.def.buildTime) {
      building.completed = true;
      building.sprite.setAlpha(1);
      building.label.setVisible(false);
      building.hp = building.def.maxHp;
      unit.state = "idle";
      unit.buildTarget = null;
      this.updateSupply(building.ownerId);
    }
  }

  updateBuildings(delta, now) {
    this.state.buildings.forEach((building) => {
      if (building.dead) return;
      if (building.completed && building.queue.length) {
        building.queue[0].remaining -= delta;
        if (building.queue[0].remaining <= 0) {
          const queueItem = building.queue.shift();
          const unit = this.spawnUnit(building.ownerId, queueItem.type, building.x + 48, building.y + 18);
          this.commandMove(unit, building.rallyPoint);
          this.updateSupply(building.ownerId);
        }
      }
      if (building.completed && building.type === "tower") {
        const target = [...this.state.units, ...this.state.buildings]
          .filter((entry) => entry.ownerId !== building.ownerId && !entry.dead)
          .sort((a, b) => distanceSq(building, a) - distanceSq(building, b))[0];
        if (target && distance(building, target) <= building.def.range && now - building.lastAttackAt >= building.def.attackCooldown) {
          building.lastAttackAt = now;
          this.performAttack(building, target);
        }
      }
      building.sprite.setPosition(building.x, building.y).setDepth(building.y + 2);
      building.shadow.setPosition(building.x, building.y + building.def.size * 0.34).setDepth(building.y - 10);
      building.banner.setPosition(building.x, building.y - building.def.size * 0.35).setDepth(building.y + 5);
      if (!building.completed) {
        building.label
          .setVisible(true)
          .setText(`${Math.floor((building.buildProgress / building.def.buildTime) * 100)}%`)
          .setPosition(building.x, building.y + building.def.size * 0.48)
          .setDepth(building.y + 8);
      } else {
        building.label.setVisible(false);
      }
      building.selection.setPosition(building.x, building.y);
      building.hpBg.setPosition(building.x, building.y - building.def.size / 2 - 10);
      building.hpFill.setPosition(building.x - building.def.size / 2, building.y - building.def.size / 2 - 10);
      building.hpFill.setDisplaySize(building.def.size * (building.hp / building.def.maxHp), 6);
    });
  }

  updateAI(now) {
    const elapsed = now - this.state.matchStartedAt;
    Object.values(this.state.players).forEach((player) => {
      if (player.isHuman) return;
      const ai = this.state.ai[player.playerId];
      if (now < ai.nextDecisionAt) return;
      ai.nextDecisionAt = now + Phaser.Math.Between(2200, 3200);

      const townhall = this.state.buildings.find((entry) => entry.ownerId === player.playerId && entry.type === "townhall" && !entry.dead);
      const barracks = this.state.buildings.find((entry) => entry.ownerId === player.playerId && entry.type === "barracks" && !entry.dead);
      const farm = this.state.buildings.find((entry) => entry.ownerId === player.playerId && entry.type === "farm" && !entry.dead);
      if (!townhall) return;

      const workers = this.state.units.filter((entry) => entry.ownerId === player.playerId && entry.type === "worker" && !entry.dead);
      const combatUnits = this.state.units.filter((entry) => entry.ownerId === player.playerId && entry.type !== "worker" && !entry.dead);

      workers.forEach((worker) => {
        if (worker.state === "idle") {
          const resource = this.findClosestResource(worker, player.resources.gold < player.resources.wood ? "gold" : "wood");
          if (resource) this.commandGather(worker, resource);
        }
      });

      const desiredWorkers = elapsed < 120000 ? 6 : 8;
      if (townhall.completed && workers.length < desiredWorkers) {
        this.queueTraining(townhall, "worker", { silent: true });
      }

      if (!farm && workers[0] && elapsed > 22000 && this.payCost(player.playerId, BUILDING_DEFS.farm.cost)) {
        const building = this.spawnBuilding(player.playerId, "farm", townhall.x + 120, townhall.y - 90, false);
        workers[0].buildTarget = building;
        workers[0].state = "building";
      } else if (!barracks && workers[1] && elapsed > 45000 && this.payCost(player.playerId, BUILDING_DEFS.barracks.cost)) {
        const building = this.spawnBuilding(player.playerId, "barracks", townhall.x + 110, townhall.y + 110, false);
        workers[1].buildTarget = building;
        workers[1].state = "building";
      }

      if (barracks?.completed) {
        const meleeCount = combatUnits.filter((entry) => entry.type === "swordsman").length;
        const desiredArmy = elapsed < 150000 ? 8 : 14;
        if (combatUnits.length < desiredArmy) {
          this.queueTraining(barracks, meleeCount <= combatUnits.length * 0.55 ? "swordsman" : "archer", { silent: true });
        }
      }

      // No early all-in rush: first coordinated attack starts after economy phase.
      if (elapsed < 90000) {
        return;
      }

      if (now >= ai.nextAttackAt) {
        const attackers = combatUnits.filter((entry) => entry.type === "swordsman" || entry.type === "archer");
        const minWaveSize = elapsed < 210000 ? 6 : 9;
        if (attackers.length < minWaveSize) {
          ai.nextAttackAt = now + Phaser.Math.Between(7000, 11000);
          return;
        }

        ai.attackWave += 1;
        ai.nextAttackAt = now + Phaser.Math.Between(22000, 32000);
        const target = [...this.state.units, ...this.state.buildings]
          .filter((entry) => entry.ownerId !== player.playerId && !entry.dead)
          .sort((a, b) => distanceSq(townhall ?? { x: 0, y: 0 }, a) - distanceSq(townhall ?? { x: 0, y: 0 }, b))[0];
        if (target) {
          const waveSize = Math.min(attackers.length, minWaveSize + ai.attackWave * 2);
          attackers.slice(0, waveSize).forEach((unit) => this.commandAttack(unit, target));
        }
      }
    });
  }

  autoAcquireTarget(unit) {
    if (unit.type === "worker") return;
    const target = [...this.state.units, ...this.state.buildings]
      .filter((entry) => entry.ownerId !== unit.ownerId && !entry.dead)
      .sort((a, b) => distanceSq(unit, a) - distanceSq(unit, b))[0];
    if (target && distance(unit, target) <= 180) {
      this.commandAttack(unit, target);
    }
  }

  moveEntityTowards(entity, point, amount) {
    const dx = point.x - entity.x;
    const dy = point.y - entity.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= amount || dist === 0) {
      entity.x = point.x;
      entity.y = point.y;
      return true;
    }
    entity.x += (dx / dist) * amount;
    entity.y += (dy / dist) * amount;
    return false;
  }

  getMoveSpeed(unit) {
    return unit.def.speed * unit.faction.modifiers.moveSpeed;
  }

  getDamage(entity) {
    if (entity.kind === "building") return entity.def.damage ?? 0;
    if (entity.type === "swordsman") return entity.def.damage * entity.faction.modifiers.meleeDamage;
    if (entity.type === "archer") return entity.def.damage * entity.faction.modifiers.rangedDamage;
    return entity.def.damage;
  }

  getGatherRate(unit) {
    return unit.faction.modifiers.gatherRate;
  }

  handleCommandButton(def) {
    if (def.type === "cancel") {
      this.cancelBuildMode();
      return;
    }
    if (def.type === "build") {
      if (!this.state.selected.some((entry) => entry.kind === "unit" && entry.type === "worker")) {
        this.showMessage("Select at least one Worker to build.");
        return;
      }
      this.enterBuildMode(def.value);
      return;
    }
    if (def.type === "train") {
      const building = this.getSingleSelectedBuilding();
      if (!building) {
        this.showMessage("Select Town Hall or Barracks first.");
        return;
      }
      this.issueCommands([{ kind: "train", buildingId: building.id, unitType: def.value }]);
    }
  }

  enterBuildMode(type) {
    if (!this.state.selected.some((entry) => entry.kind === "unit" && entry.type === "worker")) return;
    this.cancelBuildMode();
    const def = BUILDING_DEFS[type];
    this.state.buildMode = type;
    this.state.placingGhost = this.add.rectangle(0, 0, def.size, def.size, 0xa8d99d, 0.3).setStrokeStyle(2, 0xf4f1d0, 0.9);
    this.state.placingGhost.setDepth(1000);
  }

  cancelBuildMode() {
    this.state.buildMode = null;
    this.state.placingGhost?.destroy();
    this.state.placingGhost = null;
  }

  tryPlaceBuilding(worldPoint) {
    if (!this.state.buildMode) return;
    const workers = this.state.selected.filter((entry) => entry.kind === "unit" && entry.type === "worker").map((entry) => entry.id);
    if (workers.length === 0) {
      this.showMessage("Select Workers to place a building.");
      return;
    }
    this.issueCommands([{ kind: "place_building", buildingType: this.state.buildMode, workerIds: workers, point: worldPoint }]);
    this.cancelBuildMode();
  }

  canPlaceBuilding(type, x, y) {
    const size = BUILDING_DEFS[type].size;
    const padding = size / 2 + 20;
    if (x < padding || y < padding || x > MAP_WIDTH - padding || y > MAP_HEIGHT - padding) return { ok: false, reason: "Edge blocked" };
    if (this.state.buildings.some((entry) => distance(entry, { x, y }) < (entry.def.size + size) * 0.65)) return { ok: false, reason: "Area blocked" };
    if (this.state.resourcesNodes.some((entry) => distance(entry, { x, y }) < entry.radius + size * 0.7)) return { ok: false, reason: "Near resources" };
    return { ok: true };
  }

  queueTraining(building, type, options = {}) {
    const { silent = false } = options;
    const owner = this.state.players[building.ownerId];
    const def = UNIT_DEFS[type];
    if (!building.completed) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("Building is still under construction.");
      return false;
    }
    if (!building.def.canTrain?.includes(type)) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("This building cannot train that unit.");
      return false;
    }
    if (owner.resources.supplyUsed + def.cost.supply > owner.resources.supplyCap) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("Need more supply. Build Farms.");
      return false;
    }
    if (!this.payCost(building.ownerId, def.cost)) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("Not enough resources.");
      return false;
    }
    building.queue.push({ type, remaining: def.trainTime });
    this.updateSupply(building.ownerId);
    if (!silent && building.ownerId === this.localPlayerId) this.showMessage(`${def.label} queued.`);
    return true;
  }

  payCost(ownerId, cost) {
    if (!cost) return true;
    const res = this.state.players[ownerId].resources;
    if (res.gold < (cost.gold ?? 0) || res.wood < (cost.wood ?? 0)) return false;
    res.gold -= cost.gold ?? 0;
    res.wood -= cost.wood ?? 0;
    return true;
  }

  updateSupply(ownerId) {
    const owner = this.state.players[ownerId];
    owner.resources.supplyCap = this.state.buildings
      .filter((entry) => entry.ownerId === ownerId && !entry.dead && (entry.completed || entry.type === "townhall"))
      .reduce((sum, entry) => sum + (entry.def.supplyProvided ?? 0), 0);
    const queued = this.state.buildings
      .filter((entry) => entry.ownerId === ownerId && !entry.dead)
      .reduce((sum, entry) => sum + entry.queue.reduce((inner, queueItem) => inner + UNIT_DEFS[queueItem.type].cost.supply, 0), 0);
    owner.resources.supplyUsed = this.state.units
      .filter((entry) => entry.ownerId === ownerId && !entry.dead)
      .reduce((sum, entry) => sum + entry.def.cost.supply, 0) + queued;
  }

  findNearestDropOff(ownerId, from) {
    return this.state.buildings
      .filter((entry) => entry.ownerId === ownerId && entry.type === "townhall" && entry.completed && !entry.dead)
      .sort((a, b) => distanceSq(from, a) - distanceSq(from, b))[0];
  }

  findClosestResource(from, type) {
    return this.state.resourcesNodes
      .filter((entry) => entry.type === type && entry.amount > 0 && !entry.dead)
      .sort((a, b) => distanceSq(from, a) - distanceSq(from, b))[0];
  }

  applyDamage(target, amount) {
    if (target.dead) return;
    target.hp -= amount;
    this.spawnHitEffect(target.x, target.y);
    this.tweens.add({
      targets: target.sprite,
      alpha: 0.35,
      duration: 70,
      yoyo: true
    });
    if (target.hp <= 0) {
      target.dead = true;
      this.spawnDeathEffect(target.x, target.y);
      this.tweens.add({
        targets: this.uiPulse,
        alpha: 0.12,
        duration: 70,
        yoyo: true
      });
      this.updateSupply(target.ownerId);
    }
  }

  spawnHitEffect(x, y) {
    const spark = this.add.image(x, y, "hit-spark").setTint(0xffd87a).setScale(0.25);
    this.fxLayer.add(spark);
    this.tweens.add({
      targets: spark,
      scale: 0.95,
      alpha: 0,
      angle: Phaser.Math.Between(-70, 70),
      duration: 180,
      onComplete: () => spark.destroy()
    });
  }

  spawnDeathEffect(x, y) {
    const puff = this.add.image(x, y, "dust-puff").setTint(0xd1c3a7).setScale(0.4).setAlpha(0.7);
    this.fxLayer.add(puff);
    this.tweens.add({
      targets: puff,
      scale: 1.3,
      alpha: 0,
      y: y - 14,
      duration: 360,
      onComplete: () => puff.destroy()
    });
  }

  cleanupDestroyed() {
    this.state.resourcesNodes = this.state.resourcesNodes.filter((entry) => {
      if (entry.amount > 0 && !entry.dead) return true;
      entry.shadow.destroy();
      entry.sprite.destroy();
      return false;
    });
    this.state.units = this.state.units.filter((entry) => {
      if (!entry.dead) return true;
      entry.shadow.destroy();
      entry.sprite.destroy();
      entry.marker.destroy();
      entry.hpBg.destroy();
      entry.hpFill.destroy();
      entry.selection.destroy();
      return false;
    });
    this.state.buildings = this.state.buildings.filter((entry) => {
      if (!entry.dead) return true;
      entry.shadow.destroy();
      entry.sprite.destroy();
      entry.banner.destroy();
      entry.hpBg.destroy();
      entry.hpFill.destroy();
      entry.selection.destroy();
      entry.label.destroy();
      return false;
    });
  }

  checkEndConditions() {
    const livingTownHalls = this.state.buildings.filter((entry) => entry.type === "townhall" && !entry.dead);
    const localAlive = livingTownHalls.some((entry) => entry.ownerId === this.localPlayerId);
    const hostileAlive = livingTownHalls.some((entry) => entry.ownerId !== this.localPlayerId);
    if (!localAlive) this.state.result = "Defeat";
    if (localAlive && !hostileAlive) this.state.result = "Victory";
  }

  updateSelectionBox() {
    this.selectionGraphics.clear();
    if (!this.dragSelect.active) return;
    const cam = this.cameras.main;
    const x = Math.min(this.dragSelect.start.x, this.dragSelect.end.x) - cam.scrollX;
    const y = Math.min(this.dragSelect.start.y, this.dragSelect.end.y) - cam.scrollY;
    const width = Math.abs(this.dragSelect.start.x - this.dragSelect.end.x);
    const height = Math.abs(this.dragSelect.start.y - this.dragSelect.end.y);
    this.selectionGraphics.lineStyle(1, 0xf4f1d0, 0.95);
    this.selectionGraphics.fillStyle(0xf4f1d0, 0.14);
    this.selectionGraphics.fillRect(x, y, width, height);
    this.selectionGraphics.strokeRect(x, y, width, height);
  }

  updateGhostPlacement() {
    if (!this.state.placingGhost || !this.state.buildMode) return;
    const canPlace = this.canPlaceBuilding(this.state.buildMode, this.state.placingGhost.x, this.state.placingGhost.y);
    this.state.placingGhost.setFillStyle(canPlace.ok ? 0x9fcf8a : 0xcd6f6f, 0.28);
  }

  getSingleSelectedBuilding() {
    return this.state.selected.length === 1 && this.state.selected[0].kind === "building" ? this.state.selected[0] : null;
  }

  showCommandMarker(x, y, color) {
    this.commandMarker.clear();
    this.commandMarker.lineStyle(2, color, 0.9);
    this.commandMarker.strokeCircle(x, y, 18);
    this.commandMarker.strokeCircle(x, y, 10);
    this.time.delayedCall(260, () => this.commandMarker.clear());
  }

  showMessage(message) {
    this.state.message = message;
    this.state.messageUntil = this.time.now + 2400;
  }

  showPlayerMessage(playerId, message) {
    if (playerId === this.localPlayerId) {
      this.showMessage(message);
    }
  }

  updateUI(now) {
    const player = this.state.players[this.localPlayerId];
    if (!player) return;
    this.ui.stats.setText(
      `Gold ${Math.floor(player.resources.gold)}   Wood ${Math.floor(player.resources.wood)}   Supply ${player.resources.supplyUsed}/${player.resources.supplyCap}`
    );
    this.ui.status.setText(this.state.result ?? (this.state.messageUntil > now ? this.state.message : `${player.factionDef.name} ready`));
    this.ui.roster.setText(
      this.roster.map((entry) => `${entry.playerId === this.localPlayerId ? ">" : " "} ${FACTION_DEFS[entry.faction].name}${entry.isHuman ? "" : " AI"}`).join("\n")
    );

    if (this.state.selected.length === 0) {
      this.ui.selection.setText("No selection");
      this.ui.details.setText(this.mode === "multiplayer" && !this.isHost && !this.state.snapshotSeen ? "Waiting for host world state..." : "Workers gather and build. Barracks train troops.");
    } else if (this.state.selected.length === 1) {
      const entity = this.state.selected[0];
      this.ui.selection.setText(`${entity.def.label}  HP ${Math.max(0, Math.ceil(entity.hp))}/${entity.def.maxHp}`);
      this.ui.details.setText(
        entity.kind === "building"
          ? entity.queue.length
            ? `Queue: ${entity.queue.map((entry) => UNIT_DEFS[entry.type].label).join(", ")}`
            : entity.completed
              ? "Structure operational"
              : `Construction ${Math.floor((entity.buildProgress / entity.def.buildTime) * 100)}%`
          : entity.carry
            ? `Carrying ${Math.floor(entity.carry.amount)} ${entity.carry.type}`
            : `DMG ${Math.floor(this.getDamage(entity))}  Range ${entity.def.range}  Speed ${Math.floor(this.getMoveSpeed(entity))}`
      );
    } else {
      this.ui.selection.setText(`${this.state.selected.length} selected`);
      this.ui.details.setText(this.state.selected.map((entry) => entry.def.label).join(", "));
    }

    this.refreshButtons();
    if (this.state.result) this.ui.result.setVisible(true).setText(this.state.result);
  }

  refreshButtons() {
    const hasWorker = this.state.selected.some((entry) => entry.kind === "unit" && entry.type === "worker");
    const building = this.getSingleSelectedBuilding();
    this.ui.buttons.forEach((button) => {
      let visible = false;
      let subtitle = "";
      if (button.type === "build") {
        visible = hasWorker;
        subtitle = formatCost(BUILDING_DEFS[button.value].cost);
      } else if (button.type === "train") {
        visible = Boolean(building?.completed && building.def.canTrain?.includes(button.value));
        subtitle = formatCost(UNIT_DEFS[button.value].cost);
      } else if (button.type === "cancel") {
        visible = this.state.buildMode !== null;
      }
      button.container.setVisible(visible);
      button.text.setText(subtitle ? `${button.label}\n${subtitle}` : button.label);
      button.text.setFontSize(subtitle ? "13px" : "16px");
    });
  }

  drawMinimap() {
    const frame = this.ui.minimapFrame;
    const width = frame.width - 12;
    const height = frame.height - 12;
    const x = frame.x + 6;
    const y = frame.y + 6;
    this.minimap.clear();
    this.minimap.fillStyle(0x19211a, 0.94);
    this.minimap.fillRect(x, y, width, height);
    const scaleX = width / MAP_WIDTH;
    const scaleY = height / MAP_HEIGHT;
    this.state.resourcesNodes.forEach((entry) => {
      this.minimap.fillStyle(RESOURCE_TYPES[entry.type].color, 0.8);
      this.minimap.fillRect(x + entry.x * scaleX, y + entry.y * scaleY, 2, 2);
    });
    this.roster.forEach((entry) => {
      const faction = FACTION_DEFS[entry.faction];
      this.minimap.fillStyle(faction.color, 0.95);
      this.state.units.filter((unit) => unit.ownerId === entry.playerId).forEach((unit) => this.minimap.fillRect(x + unit.x * scaleX, y + unit.y * scaleY, 3, 3));
      this.state.buildings.filter((building) => building.ownerId === entry.playerId).forEach((building) => this.minimap.fillRect(x + building.x * scaleX, y + building.y * scaleY, 4, 4));
    });
    const cam = this.cameras.main;
    this.minimap.lineStyle(1, 0xf5f1d5, 0.9);
    this.minimap.strokeRect(x + cam.scrollX * scaleX, y + cam.scrollY * scaleY, cam.width / cam.zoom * scaleX, cam.height / cam.zoom * scaleY);
  }

  getEntityById(id) {
    return [...this.state.units, ...this.state.buildings, ...this.state.resourcesNodes].find((entry) => entry.id === id);
  }

  serializeSnapshot() {
    return {
      type: "state",
      payload: {
        result: this.state.result,
        players: Object.fromEntries(
          Object.entries(this.state.players).map(([id, entry]) => [
            id,
            { resources: entry.resources, faction: entry.faction, name: entry.name, isHuman: entry.isHuman }
          ])
        ),
        units: this.state.units.map((entry) => ({
          id: entry.id,
          ownerId: entry.ownerId,
          type: entry.type,
          x: entry.x,
          y: entry.y,
          hp: entry.hp,
          state: entry.state,
          carry: entry.carry
        })),
        buildings: this.state.buildings.map((entry) => ({
          id: entry.id,
          ownerId: entry.ownerId,
          type: entry.type,
          x: entry.x,
          y: entry.y,
          hp: entry.hp,
          completed: entry.completed,
          queue: entry.queue,
          buildProgress: entry.buildProgress,
          rallyPoint: entry.rallyPoint
        })),
        resourcesNodes: this.state.resourcesNodes.map((entry) => ({
          id: entry.id,
          type: entry.type,
          x: entry.x,
          y: entry.y,
          amount: entry.amount
        }))
      }
    };
  }

  broadcastSnapshot() {
    this.netClient?.send("state", this.serializeSnapshot().payload);
  }

  applySnapshot(payload) {
    this.state.snapshotSeen = true;
    this.state.result = payload.result;
    Object.entries(payload.players).forEach(([playerId, data]) => {
      if (this.state.players[playerId]) {
        this.state.players[playerId].resources = data.resources;
      }
    });
    this.syncSnapshotEntities(payload.resourcesNodes, "resource");
    this.syncSnapshotEntities(payload.buildings, "building");
    this.syncSnapshotEntities(payload.units, "unit");
  }

  syncSnapshotEntities(entries, kind) {
    if (kind === "resource") {
      const incomingIds = new Set(entries.map((entry) => entry.id));
      this.state.resourcesNodes.filter((entry) => !incomingIds.has(entry.id)).forEach((entry) => {
        entry.shadow.destroy();
        entry.sprite.destroy();
        entry.dead = true;
      });
      this.state.resourcesNodes = this.state.resourcesNodes.filter((entry) => incomingIds.has(entry.id));
      entries.forEach((data) => {
        let entity = this.state.resourcesNodes.find((entry) => entry.id === data.id);
        if (!entity) entity = this.spawnResource(data.type, data.x, data.y, data.amount);
        entity.id = data.id;
        entity.x = data.x;
        entity.y = data.y;
        entity.amount = data.amount;
        entity.sprite.setPosition(entity.x, entity.y);
        entity.shadow.setPosition(entity.x, entity.y + 20);
      });
      return;
    }

    if (kind === "unit") {
      const incomingIds = new Set(entries.map((entry) => entry.id));
      this.state.units.filter((entry) => !incomingIds.has(entry.id)).forEach((entry) => {
        entry.shadow.destroy(); entry.sprite.destroy(); entry.marker.destroy(); entry.hpBg.destroy(); entry.hpFill.destroy(); entry.selection.destroy(); entry.dead = true;
      });
      this.state.units = this.state.units.filter((entry) => incomingIds.has(entry.id));
      entries.forEach((data) => {
        let entity = this.state.units.find((entry) => entry.id === data.id);
        if (!entity) entity = this.spawnUnit(data.ownerId, data.type, data.x, data.y, data.id);
        entity.x = data.x;
        entity.y = data.y;
        entity.hp = data.hp;
        entity.carry = data.carry;
        entity.state = data.state;
        entity.shadow.setPosition(entity.x, entity.y + 14);
        entity.sprite.setPosition(entity.x, entity.y);
        entity.marker.setPosition(entity.x, entity.y - 16);
        entity.hpBg.setPosition(entity.x, entity.y - 22);
        entity.hpFill.setPosition(entity.x - 15, entity.y - 22).setDisplaySize(30 * (entity.hp / entity.def.maxHp), 4);
        entity.prevX = entity.x;
        entity.prevY = entity.y;
      });
      return;
    }

    if (kind === "building") {
      const incomingIds = new Set(entries.map((entry) => entry.id));
      this.state.buildings.filter((entry) => !incomingIds.has(entry.id)).forEach((entry) => {
        entry.shadow.destroy(); entry.sprite.destroy(); entry.banner.destroy(); entry.hpBg.destroy(); entry.hpFill.destroy(); entry.selection.destroy(); entry.label.destroy(); entry.dead = true;
      });
      this.state.buildings = this.state.buildings.filter((entry) => incomingIds.has(entry.id));
      entries.forEach((data) => {
        let entity = this.state.buildings.find((entry) => entry.id === data.id);
        if (!entity) entity = this.spawnBuilding(data.ownerId, data.type, data.x, data.y, data.completed, data.id);
        entity.x = data.x;
        entity.y = data.y;
        entity.hp = data.hp;
        entity.completed = data.completed;
        entity.queue = data.queue;
        entity.buildProgress = data.buildProgress;
        entity.rallyPoint = data.rallyPoint;
        entity.shadow.setPosition(entity.x, entity.y + entity.def.size * 0.34);
        entity.sprite.setPosition(entity.x, entity.y).setAlpha(entity.completed ? 1 : 0.58);
        entity.banner.setPosition(entity.x, entity.y - entity.def.size * 0.35);
        if (entity.completed) {
          entity.label.setVisible(false);
        } else {
          entity.label
            .setVisible(true)
            .setPosition(entity.x, entity.y + entity.def.size * 0.48)
            .setText(`${Math.floor((entity.buildProgress / entity.def.buildTime) * 100)}%`)
            .setAlpha(0.72);
        }
        entity.hpBg.setPosition(entity.x, entity.y - entity.def.size / 2 - 10);
        entity.hpFill.setPosition(entity.x - entity.def.size / 2, entity.y - entity.def.size / 2 - 10).setDisplaySize(entity.def.size * (entity.hp / entity.def.maxHp), 6);
      });
    }
  }
}
