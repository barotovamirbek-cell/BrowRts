import Phaser from "phaser";
import { BUILDING_DEFS, MAP_HEIGHT, MAP_WIDTH, RESOURCE_TYPES, UNIT_DEFS } from "../game/defs.js";
import { FACTION_DEFS } from "../game/factions.js";
import { clamp, distance, distanceSq, formatCost, makeSelectionRect, pointInRect } from "../game/utils.js";

const SPAWNS = [
  { x: 340, y: 1560 },
  { x: 2820, y: 620 },
  { x: 420, y: 520 },
  { x: 2820, y: 1600 }
];

const FACTION_UNIT_VISUALS = {
  kingdom: {
    scale: 2.2,
    worker: [106, 107],
    swordsman: [107, 161],
    archer: [178, 179],
    knight: [161, 160],
    hunter: [179, 178],
    hero: [161, 178]
  },
  wildkin: {
    scale: 2.2,
    worker: [106, 107],
    swordsman: [161, 107],
    archer: [178, 179],
    knight: [107, 160],
    hunter: [178, 179],
    hero: [160, 179]
  },
  dusk: {
    scale: 2.2,
    worker: [106, 107],
    swordsman: [107, 161],
    archer: [179, 178],
    knight: [161, 160],
    hunter: [179, 178],
    hero: [160, 178]
  },
  ember: {
    scale: 2.2,
    worker: [106, 107],
    swordsman: [161, 107],
    archer: [178, 179],
    knight: [161, 160],
    hunter: [178, 179],
    hero: [160, 179]
  }
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
  tower: 5,
  forge: 7,
  herohall: 3
};

const RESOURCE_VISUALS = {
  wood: { frame: 137, scale: 2.55, shadowScale: [1.22, 0.96] },
  gold: { frame: 5, scale: 2.7, shadowScale: [1.3, 0.95] }
};

const FOREST_TREE_TEXTURES = ["forest-tree-a", "forest-tree-b", "forest-tree-c"];
const FOG_CELL_SIZE = 44;

const COMMAND_GRID_KEYS = [
  { code: Phaser.Input.Keyboard.KeyCodes.Q, label: "Q" },
  { code: Phaser.Input.Keyboard.KeyCodes.W, label: "W" },
  { code: Phaser.Input.Keyboard.KeyCodes.E, label: "E" },
  { code: Phaser.Input.Keyboard.KeyCodes.A, label: "A" },
  { code: Phaser.Input.Keyboard.KeyCodes.S, label: "S" },
  { code: Phaser.Input.Keyboard.KeyCodes.D, label: "D" },
  { code: Phaser.Input.Keyboard.KeyCodes.Z, label: "Z" },
  { code: Phaser.Input.Keyboard.KeyCodes.X, label: "X" },
  { code: Phaser.Input.Keyboard.KeyCodes.C, label: "C" }
];

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
      team: entry.team ?? (index === 0 ? 1 : 2),
      name: entry.name ?? entry.playerId
    }));

    if (!entries.some((entry) => entry.playerId === this.localPlayerId)) {
      if (entries.length === 0) {
        entries.push({
          playerId: this.localPlayerId,
          faction: selectedFaction,
          slot: 0,
          isHuman: true,
          isHost: true,
          team: 1,
          name: "Игрок"
        });
      } else {
        entries[0].playerId = this.localPlayerId;
        entries[0].faction = selectedFaction;
        entries[0].isHuman = true;
      }
    }

    return entries.slice(0, 4);
  }

  getUnitFrames(unitType, factionKey) {
    const factionVisuals = FACTION_UNIT_VISUALS[factionKey] ?? FACTION_UNIT_VISUALS.kingdom;
    const framePair = factionVisuals[unitType] ?? factionVisuals.worker;
    return {
      idle: [framePair[0]],
      move: [framePair[0], framePair[1]],
      attack: [framePair[1]],
      scale: factionVisuals.scale
    };
  }

  getBuildingFrame(buildingType, factionKey) {
    const base = FACTION_BUILDING_BASE[factionKey] ?? FACTION_BUILDING_BASE.kingdom;
    return base + (BUILDING_FRAME_OFFSETS[buildingType] ?? 0);
  }

  getUnitLabel(type, ownerId = this.localPlayerId) {
    if (type === "hero") {
      return this.state?.players?.[ownerId]?.factionDef?.heroName ?? this.state?.players?.[this.localPlayerId]?.factionDef?.heroName ?? UNIT_DEFS.hero.label;
    }
    return UNIT_DEFS[type]?.label ?? type;
  }

  isEnemyOwner(ownerA, ownerB) {
    if (!ownerA || !ownerB || ownerA === ownerB) {
      return false;
    }
    const teamA = this.state.players[ownerA]?.team ?? ownerA;
    const teamB = this.state.players[ownerB]?.team ?? ownerB;
    return teamA !== teamB;
  }

  isEnemyEntity(viewerId, entity) {
    return Boolean(entity?.ownerId) && this.isEnemyOwner(viewerId, entity.ownerId);
  }

  create() {
    this.state = {
      players: {},
      units: [],
      buildings: [],
      resourcesNodes: [],
      selected: [],
      inspectedResource: null,
      nextId: 1,
      buildMode: null,
      placingGhost: null,
      result: null,
      message: "",
      messageUntil: 0,
      ai: {},
      snapshotSeen: false,
      matchStartedAt: this.time.now,
      cameraCentered: false,
      fog: null,
      lastFogDrawAt: 0
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
        attackWave: 0,
        threatTargetId: null,
        underAttackUntil: 0,
        rallyAt: null
      };
    });

    this.input.mouse.disableContextMenu();
    this.createMap();
    this.createUI();
    this.setupInput();
    this.bindResize();
    this.bindVisibilityRecovery();
    this.setupNetworking();
    this.createScreenPulse();

    if (this.isHost) {
      this.createWorldState();
      if (this.mode === "multiplayer") {
        this.time.delayedCall(180, () => this.broadcastSnapshot());
      }
      this.centerCameraOnLocalBase(true);
      this.showMessage("Развивай базу, собирай армию и ломай вражеские укрепления.");
    } else {
      this.showMessage("Ожидание состояния мира от хоста...");
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
      this.applySnapshot(message.payload ?? message);
    });

    this.netClient.on("request_state", () => {
      if (!this.isHost) {
        return;
      }
      if (this.state.units.length === 0 && this.state.buildings.length === 0) {
        this.time.delayedCall(120, () => this.broadcastSnapshot());
        return;
      }
      this.broadcastSnapshot();
    });

    if (!this.isHost) {
      this.time.delayedCall(120, () => {
        this.netClient?.send("request_state");
      });
      this.time.addEvent({
        delay: 1400,
        loop: true,
        callback: () => {
          if (!this.state.snapshotSeen && this.netClient?.connected) {
            this.netClient.send("request_state");
          }
        }
      });
    }
  }

  createMap() {
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    const baseTint = this.add.graphics();
    baseTint.fillGradientStyle(0x638f5a, 0x81b16f, 0x446f49, 0x507f4f, 1);
    baseTint.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    const grassBase = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, "tinyBattleTiles", 0).setOrigin(0).setAlpha(0.55);
    grassBase.tileScaleX = 2;
    grassBase.tileScaleY = 2;

    const grassNoise = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, "tinyBattleTiles", 1).setOrigin(0).setAlpha(0.18);
    grassNoise.tileScaleX = 2;
    grassNoise.tileScaleY = 2;

    const mossBand = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, "tinyBattleTiles", 2).setOrigin(0).setAlpha(0.12);
    mossBand.tileScaleX = 2;
    mossBand.tileScaleY = 2;

    const stoneNoise = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, "tinyDungeonTiles", 175).setOrigin(0).setAlpha(0.06);
    stoneNoise.tileScaleX = 2;
    stoneNoise.tileScaleY = 2;

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

    this.selectionGraphics = this.add.graphics().setScrollFactor(0).setDepth(6400);
    this.commandMarker = this.add.graphics().setDepth(3500);
    this.setupFogOfWar();
  }

  createScreenPulse() {
    this.uiPulse = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 0).setOrigin(0).setScrollFactor(0);
    this.scale.on("resize", (gameSize) => {
      this.uiPulse.setSize(gameSize.width, gameSize.height);
    });
  }

  setupFogOfWar() {
    const cols = Math.ceil(MAP_WIDTH / FOG_CELL_SIZE);
    const rows = Math.ceil(MAP_HEIGHT / FOG_CELL_SIZE);
    this.state.fog = {
      cols,
      rows,
      cellSize: FOG_CELL_SIZE,
      explored: new Uint8Array(cols * rows),
      visible: new Uint8Array(cols * rows),
      graphics: this.add.graphics().setDepth(3000)
    };
  }

  getFogIndex(col, row) {
    const fog = this.state.fog;
    if (!fog) return -1;
    if (col < 0 || row < 0 || col >= fog.cols || row >= fog.rows) return -1;
    return row * fog.cols + col;
  }

  markFogCircle(worldX, worldY, radius) {
    const fog = this.state.fog;
    if (!fog) return;
    const minCol = Math.floor((worldX - radius) / fog.cellSize);
    const maxCol = Math.floor((worldX + radius) / fog.cellSize);
    const minRow = Math.floor((worldY - radius) / fog.cellSize);
    const maxRow = Math.floor((worldY + radius) / fog.cellSize);
    const radiusSq = radius * radius;

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const index = this.getFogIndex(col, row);
        if (index < 0) continue;
        const centerX = col * fog.cellSize + fog.cellSize * 0.5;
        const centerY = row * fog.cellSize + fog.cellSize * 0.5;
        const dx = centerX - worldX;
        const dy = centerY - worldY;
        if (dx * dx + dy * dy > radiusSq) continue;
        fog.visible[index] = 1;
        fog.explored[index] = 1;
      }
    }
  }

  isPointVisible(worldX, worldY) {
    const fog = this.state.fog;
    if (!fog) return true;
    const col = Math.floor(worldX / fog.cellSize);
    const row = Math.floor(worldY / fog.cellSize);
    const index = this.getFogIndex(col, row);
    return index >= 0 ? fog.visible[index] === 1 : false;
  }

  isPointExplored(worldX, worldY) {
    const fog = this.state.fog;
    if (!fog) return true;
    const col = Math.floor(worldX / fog.cellSize);
    const row = Math.floor(worldY / fog.cellSize);
    const index = this.getFogIndex(col, row);
    return index >= 0 ? fog.explored[index] === 1 : false;
  }

  updateFogOfWar(now) {
    const fog = this.state.fog;
    if (!fog) return;

    fog.visible.fill(0);
    this.state.units.filter((entry) => entry.ownerId === this.localPlayerId && !entry.dead).forEach((unit) => {
      const radius = unit.type === "worker" ? 220 : 245;
      this.markFogCircle(unit.x, unit.y, radius);
    });
    this.state.buildings.filter((entry) => entry.ownerId === this.localPlayerId && !entry.dead).forEach((building) => {
      const radius = building.type === "townhall" ? 300 : 240;
      this.markFogCircle(building.x, building.y, radius);
    });

    this.applyFogVisibilityToEntities();

    if (now - this.state.lastFogDrawAt > 120) {
      this.state.lastFogDrawAt = now;
      this.drawFogOverlay();
    }
  }

  drawFogOverlay() {
    const fog = this.state.fog;
    if (!fog) return;
    const g = fog.graphics;
    g.clear();
    for (let row = 0; row < fog.rows; row += 1) {
      for (let col = 0; col < fog.cols; col += 1) {
        const index = row * fog.cols + col;
        if (fog.visible[index]) continue;
        const alpha = fog.explored[index] ? 0.5 : 0.93;
        g.fillStyle(0x060608, alpha);
        g.fillRect(col * fog.cellSize, row * fog.cellSize, fog.cellSize, fog.cellSize);
      }
    }
  }

  applyFogVisibilityToEntities() {
    this.state.units.forEach((unit) => {
      const visible = unit.ownerId === this.localPlayerId || this.isPointVisible(unit.x, unit.y);
      [unit.shadow, unit.sprite, unit.marker, unit.hpBg, unit.hpFill].forEach((part) => part.setVisible(visible));
      unit.selection.setVisible(visible && this.state.selected.includes(unit));
    });

    this.state.buildings.forEach((building) => {
      const visible = building.ownerId === this.localPlayerId || this.isPointVisible(building.x, building.y);
      [building.shadow, building.sprite, building.banner, building.hpBg, building.hpFill].forEach((part) => part.setVisible(visible));
      const showLabel = visible && !building.completed;
      building.label.setVisible(showLabel);
      building.selection.setVisible(visible && this.state.selected.includes(building));
    });

    this.state.resourcesNodes.forEach((node) => {
      const explored = this.isPointExplored(node.x, node.y);
      const visible = this.isPointVisible(node.x, node.y);
      node.shadow.setVisible(explored).setAlpha(visible ? 0.22 : 0.12);
      node.sprite.setVisible(explored).setAlpha(visible ? 1 : 0.6);
      if (node.amountPlate) node.amountPlate.setVisible(explored).setAlpha(visible ? 0.76 : 0.5);
      if (node.amountText) {
        node.amountText
          .setVisible(explored)
          .setAlpha(visible ? 1 : 0.7)
          .setText(`${Math.max(0, Math.floor(node.amount))}/${Math.floor(node.maxAmount ?? node.amount)}`);
      }
      node.decorations?.forEach((part) => part.setVisible(explored).setAlpha(visible ? 1 : 0.62));
    });
  }

  createWorldState() {
    this.roster.forEach((entry, index) => {
      const spawn = SPAWNS[index];
      this.spawnStartingBase(entry.playerId, spawn.x, spawn.y, index);
      this.spawnStartingResources(spawn.x, spawn.y, index);
    });

    [
      [1550, 1080, 3200],
      [930, 980, 2600],
      [2140, 1220, 2600],
      [1620, 540, 2400]
    ].forEach(([x, y, amount]) => this.spawnResource("gold", x, y, amount, { maxAmount: amount }));

    [
      [640, 960],
      [920, 1760],
      [1720, 1680],
      [2520, 1420],
      [2870, 940],
      [2010, 410],
      [1120, 410]
    ].forEach(([x, y]) =>
      this.spawnForestPatch(x, y, {
        columns: 3,
        rows: 2,
        stepX: 78,
        stepY: 74,
        jitter: 12,
        amount: 1450
      })
    );
  }

  spawnStartingBase(ownerId, x, y, slotIndex) {
    const sign = slotIndex % 2 === 0 ? 1 : -1;
    this.spawnBuilding(ownerId, "townhall", x, y, true);
    this.spawnUnit(ownerId, "worker", x + sign * 78, y - 46);
    this.spawnUnit(ownerId, "worker", x + sign * 102, y + 8);
    this.spawnUnit(ownerId, "worker", x + sign * 64, y + 64);
    this.spawnUnit(ownerId, "worker", x + sign * 24, y + 36);
  }

  getSpawnDirection(slotIndex) {
    return [
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: 1, y: 1 },
      { x: -1, y: -1 }
    ][slotIndex % 4];
  }

  spawnStartingResources(baseX, baseY, slotIndex) {
    const dir = this.getSpawnDirection(slotIndex);
    const perpendicular = { x: -dir.y, y: dir.x };
    this.spawnResource("gold", baseX + dir.x * 208, baseY + dir.y * 152, 2600, { maxAmount: 2600 });
    const forestCenterX = baseX + dir.x * 392;
    const forestCenterY = baseY + dir.y * 296;
    this.spawnForestPatch(forestCenterX + perpendicular.x * 116, forestCenterY + perpendicular.y * 116, {
      columns: 4,
      rows: 3,
      stepX: 70,
      stepY: 68,
      jitter: 10,
      amount: 1180,
      axis: perpendicular,
      depthAxis: dir
    });
    this.spawnForestPatch(forestCenterX - perpendicular.x * 116, forestCenterY - perpendicular.y * 116, {
      columns: 4,
      rows: 3,
      stepX: 70,
      stepY: 68,
      jitter: 10,
      amount: 1180,
      axis: perpendicular,
      depthAxis: dir
    });
  }

  canPlaceResourceNode(x, y, minDistance = 66) {
    if (x < 90 || y < 90 || x > MAP_WIDTH - 90 || y > MAP_HEIGHT - 90) {
      return false;
    }

    const candidate = { x, y };
    const farFromResources = this.state.resourcesNodes.every((entry) => distanceSq(entry, candidate) > minDistance * minDistance);
    const farFromBuildings = this.state.buildings.every((entry) => distanceSq(entry, candidate) > (entry.def.size * 0.72 + minDistance) ** 2);
    return farFromResources && farFromBuildings;
  }

  spawnForestPatch(centerX, centerY, options = {}) {
    const {
      columns = 3,
      rows = 2,
      stepX = 80,
      stepY = 74,
      jitter = 12,
      amount = 1400,
      axis = { x: 1, y: 0 },
      depthAxis = { x: 0, y: 1 }
    } = options;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const lateral = (col - (columns - 1) * 0.5) * stepX;
        const depth = (row - (rows - 1) * 0.5) * stepY;
        const targetX =
          centerX +
          axis.x * lateral +
          depthAxis.x * depth +
          Phaser.Math.Between(-jitter, jitter);
        const targetY =
          centerY +
          axis.y * lateral +
          depthAxis.y * depth +
          Phaser.Math.Between(-jitter, jitter);

        if (this.canPlaceResourceNode(targetX, targetY)) {
          this.spawnResource("wood", targetX, targetY, amount, { maxAmount: amount });
          continue;
        }

        let placed = false;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const retryX = targetX + Phaser.Math.Between(-26, 26);
          const retryY = targetY + Phaser.Math.Between(-26, 26);
          if (!this.canPlaceResourceNode(retryX, retryY)) {
            continue;
          }
          this.spawnResource("wood", retryX, retryY, amount, { maxAmount: amount });
          placed = true;
          break;
        }

      }
    }
  }

  createUI() {
    const width = this.scale.width;
    const height = this.scale.height;
    const faction = this.state.players[this.localPlayerId]?.factionDef ?? FACTION_DEFS.kingdom;

    this.ui = {
      topBar: this.add.rectangle(0, 0, width, 54, 0x0e0c0b, 0.95).setOrigin(0).setScrollFactor(0),
      topInner: this.add.rectangle(6, 6, width - 12, 42, 0x17120f, 0.82).setOrigin(0).setScrollFactor(0).setStrokeStyle(1, 0x4a3f31, 0.8),
      bottomBar: this.add.rectangle(0, height - 160, width, 160, 0x100d0c, 0.97).setOrigin(0).setScrollFactor(0),
      infoPanel: this.add.rectangle(12, height - 152, 364, 142, 0x17120f, 0.8).setOrigin(0).setScrollFactor(0).setStrokeStyle(2, 0x554935, 0.88),
      commandPanel: this.add
        .rectangle(384, height - 156, Math.max(420, width - 620), 150, 0x17120f, 0.8)
        .setOrigin(0)
        .setScrollFactor(0)
        .setStrokeStyle(2, 0x4c4333, 0.88),
      minimapPanel: this.add.rectangle(width - 220, height - 156, 208, 152, 0x17120f, 0.84).setOrigin(0).setScrollFactor(0).setStrokeStyle(2, 0x5d513b, 0.9),
      topAccent: this.add.rectangle(0, 54, width, 2, faction.color, 0.85).setOrigin(0).setScrollFactor(0),
      bottomAccent: this.add.rectangle(0, height - 160, width, 2, faction.color, 0.85).setOrigin(0).setScrollFactor(0),
      title: this.add.text(16, 12, "Железный Рубеж", { fontFamily: "Georgia", fontSize: "26px", color: faction.ui }).setScrollFactor(0),
      stats: this.add.text(186, 14, "", { fontSize: "18px", color: "#f4f2e8" }).setScrollFactor(0),
      status: this.add.text(width - 18, 15, "", { fontSize: "18px", color: "#f0c97a" }).setOrigin(1, 0).setScrollFactor(0),
      selection: this.add.text(20, height - 142, "", { fontSize: "20px", color: "#f4f2e8", wordWrap: { width: 320 } }).setScrollFactor(0),
      details: this.add.text(20, height - 98, "", { fontSize: "15px", color: "#bdb5a4", wordWrap: { width: 360 } }).setScrollFactor(0),
      roster: this.add.text(width - 20, 70, "", { fontSize: "15px", color: "#ddd3c8", align: "right" }).setOrigin(1, 0).setScrollFactor(0),
      hint: this.add.text(width - 20, height - 136, "ЛКМ выделить  ПКМ приказ  QWE/ASD/ZXC команды  H к базе", {
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

    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(6100);
    Object.values(this.ui).forEach((entry) => {
      if (entry && typeof entry.setDepth === "function" && entry !== this.ui.buttons) {
        entry.setDepth(6000);
      }
    });

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
    this.ui.buttons.forEach((button) => {
      button.container.destroy();
      button.hit.destroy();
    });
    this.ui.buttons = [];
    for (let index = 0; index < 9; index += 1) {
      const keybind = COMMAND_GRID_KEYS[index];
      const bg = this.add.rectangle(0, 0, 132, 46, 0x1a1612, 0.9).setStrokeStyle(2, 0x554a3c, 0.9);
      const keycap = this.add.text(-57, -18, keybind.label, { fontSize: "11px", color: "#8f887b" }).setOrigin(0, 0);
      const title = this.add.text(0, -7, "", { fontSize: "15px", color: "#f4f2e6", align: "center" }).setOrigin(0.5);
      const sub = this.add.text(0, 11, "", { fontSize: "11px", color: "#bdb5a4", align: "center" }).setOrigin(0.5);
      const hit = this.add.rectangle(0, 0, 136, 50, 0x000000, 0.001).setOrigin(0.5).setScrollFactor(0).setDepth(6201);
      hit.setInteractive({ useHandCursor: true });
      const container = this.add.container(0, 0, [bg, keycap, title, sub]).setScrollFactor(0).setDepth(6200);
      container.setSize(132, 46);
      const button = { container, bg, keycap, title, sub, hit, action: null };
      hit
        .on("pointerover", () => {
          if (!button.action) return;
          button.bg.setStrokeStyle(2, 0xf0d9a3, 0.95);
        })
        .on("pointerout", () => {
          this.refreshButtons();
        })
        .on("pointerdown", (_pointer, _lx, _ly, event) => {
          event?.stopPropagation?.();
          if (!button.action) return;
          this.handleCommandButton(button.action);
        });
      this.ui.buttons.push(button);
    }

    this.layoutCommandButtons();
  }

  layoutCommandButtons() {
    const cols = 3;
    const cellW = 132;
    const cellH = 46;
    const gapX = 12;
    const gapY = 10;
    const gridW = cols * cellW + (cols - 1) * gapX;
    const leftLimit = 390;
    const rightLimit = this.scale.width - 228;
    const availableLeft = Math.max(leftLimit, Math.floor((this.scale.width - gridW) / 2));
    const maxLeft = Math.max(leftLimit, rightLimit - gridW);
    const left = clamp(availableLeft, leftLimit, maxLeft);
    const top = this.scale.height - 154;

    this.ui.buttons.forEach((button, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      button.container.setPosition(
        left + col * (cellW + gapX) + cellW / 2,
        top + row * (cellH + gapY) + cellH / 2
      );
      button.hit.setPosition(
        left + col * (cellW + gapX) + cellW / 2,
        top + row * (cellH + gapY) + cellH / 2
      );
    });
  }

  getCommandActions() {
    const actions = [];
    const hasWorker = this.state.selected.some((entry) => entry.kind === "unit" && entry.type === "worker");
    const hasUnits = this.state.selected.some((entry) => entry.kind === "unit");
    const building = this.getSingleSelectedBuilding();

    if (this.state.buildMode !== null) {
      actions.push({ key: "cancel", label: "Отмена", type: "cancel", value: null, costText: "" });
    }

    if (hasWorker) {
      actions.push({ key: "build-farm", label: "Ферма", type: "build", value: "farm", costText: formatCost(BUILDING_DEFS.farm.cost) });
      actions.push({
        key: "build-barracks",
        label: "Казармы",
        type: "build",
        value: "barracks",
        costText: formatCost(BUILDING_DEFS.barracks.cost)
      });
      actions.push({ key: "build-tower", label: "Башня", type: "build", value: "tower", costText: formatCost(BUILDING_DEFS.tower.cost) });
      actions.push({ key: "build-forge", label: "Кузница", type: "build", value: "forge", costText: formatCost(BUILDING_DEFS.forge.cost) });
      actions.push({ key: "build-herohall", label: "Зал героев", type: "build", value: "herohall", costText: formatCost(BUILDING_DEFS.herohall.cost) });
    }

    if (building?.completed) {
      if (building.def.canTrain?.includes("worker")) {
        actions.push({ key: "train-worker", label: "Рабочий", type: "train", value: "worker", costText: formatCost(UNIT_DEFS.worker.cost) });
      }
      if (building.def.canTrain?.includes("swordsman")) {
        actions.push({
          key: "train-swordsman",
          label: "Мечник",
          type: "train",
          value: "swordsman",
          costText: formatCost(UNIT_DEFS.swordsman.cost)
        });
      }
      if (building.def.canTrain?.includes("archer")) {
        actions.push({ key: "train-archer", label: "Лучник", type: "train", value: "archer", costText: formatCost(UNIT_DEFS.archer.cost) });
      }
      if (building.def.canTrain?.includes("knight")) {
        actions.push({ key: "train-knight", label: "Рыцарь", type: "train", value: "knight", costText: formatCost(UNIT_DEFS.knight.cost) });
      }
      if (building.def.canTrain?.includes("hunter")) {
        actions.push({ key: "train-hunter", label: "Следопыт", type: "train", value: "hunter", costText: formatCost(UNIT_DEFS.hunter.cost) });
      }
      if (building.def.canTrain?.includes("hero")) {
        actions.push({
          key: "train-hero",
          label: this.getUnitLabel("hero", building.ownerId),
          type: "train",
          value: "hero",
          costText: formatCost(UNIT_DEFS.hero.cost)
        });
      }
    }

    if (hasUnits) {
      actions.push({ key: "stop", label: "Стоп", type: "stop", value: null, costText: "" });
    }

    return actions.slice(0, 9);
  }

  bindResize() {
    this.scale.on("resize", (gameSize) => {
      const width = gameSize.width;
      const height = gameSize.height;
      this.ui.topBar.setSize(width, 54);
      this.ui.topInner.setSize(width - 12, 42);
      this.ui.bottomBar.setPosition(0, height - 160).setSize(width, 160);
      this.ui.infoPanel.setPosition(12, height - 152);
      this.ui.commandPanel.setPosition(384, height - 156).setSize(Math.max(420, width - 620), 150);
      this.ui.minimapPanel.setPosition(width - 220, height - 156);
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
      this.applyResponsiveUiLayout(width, height);
      this.layoutCommandButtons();
    });
    this.applyResponsiveUiLayout(this.scale.width, this.scale.height);
  }

  applyResponsiveUiLayout(width, height) {
    const compact = width < 1280;
    this.ui.title.setFontSize(compact ? 22 : 26);
    this.ui.stats.setFontSize(compact ? 15 : 18).setWordWrapWidth(Math.max(260, width * 0.34), true);
    this.ui.status.setFontSize(compact ? 15 : 18).setWordWrapWidth(Math.max(220, width * 0.28), true);
    this.ui.selection.setFontSize(compact ? 18 : 20).setWordWrapWidth(Math.max(220, this.ui.infoPanel.width - 36), true);
    this.ui.details.setFontSize(compact ? 14 : 15).setWordWrapWidth(Math.max(240, this.ui.infoPanel.width - 24), true);
    this.ui.roster.setFontSize(compact ? 13 : 15).setWordWrapWidth(Math.max(160, width * 0.18), true);
    this.ui.hint.setFontSize(compact ? 13 : 15).setWordWrapWidth(Math.max(180, width * 0.2), true);
    this.ui.result.setWordWrapWidth(Math.max(320, width * 0.48), true);
    this.ui.status.setPosition(width - 18, compact ? 12 : 15);
    this.ui.roster.setPosition(width - 20, compact ? 64 : 70);
    this.ui.hint.setPosition(width - 20, height - 136);
  }

  bindVisibilityRecovery() {
    this.handleVisibilityChange = () => {
      const hidden = document.hidden;
      this.resetTransientInputState();
      if (hidden) {
        if (this.mode === "multiplayer" && this.isHost) {
          this.showMessage("Хост во вкладке в фоне: браузер замедляет симуляцию.");
        }
        return;
      }

      if (this.mode === "multiplayer") {
        if (this.isHost) {
          this.broadcastSnapshot();
        } else {
          this.netClient?.send("request_state");
        }
      }
      this.showMessage("Управление восстановлено.");
    };

    this.handleWindowBlur = () => this.resetTransientInputState();
    this.handleWindowFocus = () => this.handleVisibilityChange();

    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("focus", this.handleWindowFocus);
    this.events.once("shutdown", () => this.unbindVisibilityRecovery());
    this.events.once("destroy", () => this.unbindVisibilityRecovery());
  }

  unbindVisibilityRecovery() {
    if (this.handleVisibilityChange) {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      this.handleVisibilityChange = null;
    }
    if (this.handleWindowBlur) {
      window.removeEventListener("blur", this.handleWindowBlur);
      this.handleWindowBlur = null;
    }
    if (this.handleWindowFocus) {
      window.removeEventListener("focus", this.handleWindowFocus);
      this.handleWindowFocus = null;
    }
  }

  resetTransientInputState() {
    if (this.dragSelect) {
      this.dragSelect.active = false;
      this.dragSelect.button = null;
      this.dragSelect.pointerId = null;
    }
    this.selectionGraphics?.clear();
    this.input?.keyboard?.resetKeys?.();
    const pointers = this.input?.manager?.pointers ?? [];
    pointers.forEach((pointer) => pointer?.reset?.());
    this.input?.activePointer?.reset?.();
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

  isPointerInWorldArea(pointer) {
    const y = pointer.y;
    const topUiHeight = 54;
    const bottomUiHeight = 160;
    return y > topUiHeight && y < this.scale.height - bottomUiHeight;
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys({
      camLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
      camRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      camUp: Phaser.Input.Keyboard.KeyCodes.UP,
      camDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
      build: Phaser.Input.Keyboard.KeyCodes.B,
      home: Phaser.Input.Keyboard.KeyCodes.H
    });
    this.commandKeyCodeToSlot = {
      KeyQ: 0,
      KeyW: 1,
      KeyE: 2,
      KeyA: 3,
      KeyS: 4,
      KeyD: 5,
      KeyZ: 6,
      KeyX: 7,
      KeyC: 8,
      Digit1: 0,
      Digit2: 1,
      Digit3: 2,
      Digit4: 3,
      Digit5: 4,
      Digit6: 5,
      Digit7: 6,
      Digit8: 7,
      Digit9: 8,
      Numpad1: 0,
      Numpad2: 1,
      Numpad3: 2,
      Numpad4: 3,
      Numpad5: 4,
      Numpad6: 5,
      Numpad7: 6,
      Numpad8: 7,
      Numpad9: 8
    };
    this.input.keyboard.on("keydown", (event) => {
      const slot = this.commandKeyCodeToSlot[event.code];
      if (slot === undefined) {
        return;
      }
      this.triggerCommandSlot(slot);
      event.preventDefault();
    });

    this.dragSelect = { active: false, button: null, pointerId: null, start: new Phaser.Math.Vector2(), end: new Phaser.Math.Vector2() };

    this.input.on("pointerdown", (pointer) => {
      if (this.isPointerOverMinimap(pointer)) {
        return;
      }
      if (!this.isPointerInWorldArea(pointer)) {
        return;
      }

      const button = pointer.event?.button;
      const isLeft = button === 0 || pointer.leftButtonDown();
      const isRight = button === 2 || pointer.rightButtonDown();

      if (isLeft) {
        const worldPoint = pointer.positionToCamera(this.cameras.main);
        if (this.state.buildMode) {
          this.tryPlaceBuilding(worldPoint);
          return;
        }
        this.dragSelect.active = true;
        this.dragSelect.button = 0;
        this.dragSelect.pointerId = pointer.id;
        this.dragSelect.start.set(worldPoint.x, worldPoint.y);
        this.dragSelect.end.set(worldPoint.x, worldPoint.y);
      }

      if (isRight) {
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
      if (this.dragSelect.button !== 0) {
        this.dragSelect.active = false;
        this.dragSelect.button = null;
        this.dragSelect.pointerId = null;
        return;
      }
      if (this.dragSelect.pointerId !== null && pointer.id !== this.dragSelect.pointerId) {
        return;
      }

      this.dragSelect.active = false;
      this.dragSelect.button = null;
      this.dragSelect.pointerId = null;
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

  spawnResource(type, x, y, amount, options = {}) {
    const { fixedId = null, maxAmount = amount } = options;
    const visual = RESOURCE_VISUALS[type] ?? RESOURCE_VISUALS.wood;
    const shadow = this.add
      .image(x, y + 20, "shadow-oval")
      .setScale(visual.shadowScale[0], visual.shadowScale[1])
      .setAlpha(0.22)
      .setTint(0x000000);
    const sprite =
      type === "wood"
        ? this.add.image(x, y, Phaser.Utils.Array.GetRandom(FOREST_TREE_TEXTURES)).setOrigin(0.5, 0.88)
        : this.add.image(x, y, "tinyBattleTiles", visual.frame).setScale(visual.scale);
    const decorations = [];
    let amountPlate = null;
    let amountText = null;

    if (type === "wood") {
      sprite
        .setScale(Phaser.Math.FloatBetween(0.92, 1.08))
        .setTint(
          Phaser.Display.Color.GetColor(
            Phaser.Math.Between(214, 255),
            Phaser.Math.Between(218, 255),
            Phaser.Math.Between(214, 255)
          )
        )
        .setDepth(y + 8);
      shadow.setPosition(x, y + 14).setScale(1.08, 0.82).setAlpha(0.18);
      const ground = this.add.ellipse(x, y + 8, 42, 16, 0x284120, 0.26).setDepth(y + 1);
      decorations.push(ground);
    } else {
      amountPlate = this.add.rectangle(x, y + 34, 82, 16, 0x130f0c, 0.76).setStrokeStyle(1, 0x5a4a30, 0.95).setDepth(y + 36);
      amountText = this.add.text(x, y + 34, `${Math.floor(amount)}`, { fontSize: "11px", color: "#f4d986" }).setOrigin(0.5).setDepth(y + 37);
      const rim = this.add.circle(x, y + 4, 34, 0x2b2115, 0.18).setStrokeStyle(1, 0x78603c, 0.45).setDepth(y - 12);
      decorations.push(rim);
      sprite.setTint(0xe7c778).setDepth(y + 4);
    }

    this.resourceLayer.add([shadow, ...decorations, sprite, amountPlate, amountText].filter(Boolean));
    const node = {
      id: fixedId ?? this.state.nextId++,
      kind: "resource",
      type,
      x,
      y,
      amount,
      maxAmount,
      sprite,
      shadow,
      decorations,
      amountPlate,
      amountText,
      radius: type === "gold" ? 38 : 42
    };
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
    sprite.setTint(faction.unitTints?.[type] ?? faction.color ?? 0xffffff);
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
    sprite.setTint(faction.color);
    const banner = this.add.rectangle(x, y - def.size * 0.35, Math.max(8, def.size * 0.22), Math.max(8, def.size * 0.18), faction.color, 0.95).setStrokeStyle(1, 0x18120e, 0.95);
    const hpBg = this.add.rectangle(x, y - def.size / 2 - 10, def.size, 6, 0x000000, 0.66);
    const hpFill = this.add.rectangle(x - def.size / 2, y - def.size / 2 - 10, def.size, 6, 0x6dd66d, 1).setOrigin(0, 0.5);
    const selection = this.add.rectangle(x, y, def.size + 10, def.size + 10).setStrokeStyle(2, 0xf4f1d0, 0.95).setVisible(false);
    const label = this.add.text(x, y + def.size * 0.48, completed ? "" : "Строится...", {
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

    this.updateFogOfWar(now);
    this.updateUI(now);
    this.drawMinimap();
  }

  handleCamera(dt) {
    const cam = this.cameras.main;
    const speed = 620 / cam.zoom;
    const pointer = this.input.activePointer;
    const edge = 24;
    if (this.keys.camLeft.isDown || pointer.x < edge) cam.scrollX -= speed * dt;
    if (this.keys.camRight.isDown || pointer.x > this.scale.width - edge) cam.scrollX += speed * dt;
    if (this.keys.camUp.isDown || pointer.y < edge) cam.scrollY -= speed * dt;
    if (this.keys.camDown.isDown || pointer.y > this.scale.height - edge) cam.scrollY += speed * dt;
    cam.scrollX = clamp(cam.scrollX, 0, MAP_WIDTH - cam.width / cam.zoom);
    cam.scrollY = clamp(cam.scrollY, 0, MAP_HEIGHT - cam.height / cam.zoom);

    if (Phaser.Input.Keyboard.JustDown(this.keys.build)) {
      if (this.state.selected.some((entity) => entity.kind === "unit" && entity.type === "worker")) {
        this.enterBuildMode("farm");
      }
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
    if (!entity) {
      this.state.inspectedResource = null;
      return;
    }
    if (entity.kind === "resource") {
      this.state.inspectedResource = entity;
      return;
    }
    this.state.inspectedResource = null;
    if (entity.ownerId === this.localPlayerId) this.addToSelection(entity);
  }

  selectInRect(rect, additive) {
    if (!additive) this.clearSelection();
    this.state.inspectedResource = null;
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
      ...this.state.units.filter(
        (entry) =>
          (entry.ownerId === this.localPlayerId || this.isPointVisible(entry.x, entry.y)) &&
          distanceSq(entry, worldPoint) <= (entry.def.radius + 4) ** 2
      ),
      ...this.state.buildings.filter((entry) => {
        if (entry.ownerId !== this.localPlayerId && !this.isPointVisible(entry.x, entry.y)) return false;
        const half = entry.def.size * 0.6;
        return worldPoint.x >= entry.x - half && worldPoint.x <= entry.x + half && worldPoint.y >= entry.y - half && worldPoint.y <= entry.y + half;
      }),
      ...this.state.resourcesNodes.filter((entry) => this.isPointExplored(entry.x, entry.y) && distanceSq(entry, worldPoint) <= entry.radius ** 2)
    ];
    return hits[0] ?? null;
  }

  handleRightClick(worldPoint) {
    this.state.inspectedResource = null;
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
      if (this.isEnemyEntity(unit.ownerId, target)) {
        return { kind: "unit_command", unitIds: [unit.id], action: "attack", targetId: target.id };
      }
      if (target?.kind === "building" && target.ownerId === unit.ownerId && unit.type === "worker" && unit.carry) {
        return { kind: "unit_command", unitIds: [unit.id], action: "return", targetId: target.id };
      }
      return { kind: "unit_command", unitIds: [unit.id], action: "move", point };
    });

    this.issueCommands(commands);
    this.showCommandMarker(worldPoint.x, worldPoint.y, this.isEnemyEntity(this.localPlayerId, target) ? 0xd95959 : 0xf4f1d0);
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
          this.showPlayerMessage(playerId, `Нельзя строить здесь: ${canPlace.reason}`);
          return;
        }
        if (!this.payCost(playerId, def.cost)) {
          this.showPlayerMessage(playerId, "Недостаточно ресурсов.");
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
          this.showPlayerMessage(playerId, "Сначала выдели своё производящее здание.");
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
    const isRanged = attacker.kind === "building" || Boolean(attacker.def.projectileSpeed);
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
          .filter((entry) => this.isEnemyEntity(building.ownerId, entry) && !entry.dead)
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
      const forge = this.state.buildings.find((entry) => entry.ownerId === player.playerId && entry.type === "forge" && !entry.dead);
      const herohall = this.state.buildings.find((entry) => entry.ownerId === player.playerId && entry.type === "herohall" && !entry.dead);
      if (!townhall) return;

      const workers = this.state.units.filter((entry) => entry.ownerId === player.playerId && entry.type === "worker" && !entry.dead);
      const combatUnits = this.state.units.filter((entry) => entry.ownerId === player.playerId && entry.type !== "worker" && !entry.dead);
      const hero = combatUnits.find((entry) => entry.type === "hero");

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
      } else if (!forge && workers[2] && elapsed > 70000 && this.payCost(player.playerId, BUILDING_DEFS.forge.cost)) {
        const building = this.spawnBuilding(player.playerId, "forge", townhall.x - 126, townhall.y + 126, false);
        workers[2].buildTarget = building;
        workers[2].state = "building";
      } else if (!herohall && workers[3] && elapsed > 90000 && this.payCost(player.playerId, BUILDING_DEFS.herohall.cost)) {
        const building = this.spawnBuilding(player.playerId, "herohall", townhall.x - 120, townhall.y - 106, false);
        workers[3].buildTarget = building;
        workers[3].state = "building";
      }

      if (barracks?.completed) {
        const meleeCount = combatUnits.filter((entry) => entry.type === "swordsman").length;
        const desiredArmy = elapsed < 150000 ? 8 : 14;
        if (combatUnits.length < desiredArmy) {
          this.queueTraining(barracks, meleeCount <= combatUnits.length * 0.55 ? "swordsman" : "archer", { silent: true });
        }
      }

      if (forge?.completed) {
        const heavyCount = combatUnits.filter((entry) => entry.type === "knight").length;
        if (elapsed > 120000 && heavyCount < Math.max(2, Math.floor(combatUnits.length / 3))) {
          this.queueTraining(forge, "knight", { silent: true });
        } else if (elapsed > 135000) {
          this.queueTraining(forge, "hunter", { silent: true });
        }
      }

      if (herohall?.completed && !hero && elapsed > 115000) {
        this.queueTraining(herohall, "hero", { silent: true });
      }

      if (ai.threatTargetId && now < ai.underAttackUntil) {
        const threat = this.getEntityById(ai.threatTargetId);
        const defenders = combatUnits
          .filter((entry) => entry.type === "swordsman" || entry.type === "archer" || entry.type === "knight" || entry.type === "hunter" || entry.type === "hero")
          .slice(0, Math.min(10, combatUnits.length));
        if (threat && !threat.dead) {
          defenders.forEach((unit) => this.commandAttack(unit, threat));
        }
      }

      // No early all-in rush: first coordinated attack starts after economy phase.
      if (elapsed < 90000) {
        return;
      }

      if (now >= ai.nextAttackAt) {
        const attackers = combatUnits.filter((entry) => entry.type !== "worker");
        const minWaveSize = elapsed < 210000 ? 6 : 9;
        if (attackers.length < minWaveSize) {
          ai.nextAttackAt = now + Phaser.Math.Between(7000, 11000);
          return;
        }

        ai.attackWave += 1;
        ai.nextAttackAt = now + Phaser.Math.Between(22000, 32000);
        const target = [...this.state.units, ...this.state.buildings]
          .filter((entry) => this.isEnemyEntity(player.playerId, entry) && !entry.dead)
          .sort((a, b) => distanceSq(townhall ?? { x: 0, y: 0 }, a) - distanceSq(townhall ?? { x: 0, y: 0 }, b))[0];
        if (target) {
          const waveSize = Math.min(attackers.length, minWaveSize + ai.attackWave * 2 + (hero ? 1 : 0));
          attackers.slice(0, waveSize).forEach((unit) => this.commandAttack(unit, target));
        }
      }
    });
  }

  autoAcquireTarget(unit) {
    if (unit.type === "worker") return;
    const target = [...this.state.units, ...this.state.buildings]
      .filter((entry) => this.isEnemyEntity(unit.ownerId, entry) && !entry.dead)
      .sort((a, b) => distanceSq(unit, a) - distanceSq(unit, b))[0];
    if (target && distance(unit, target) <= (unit.type === "hero" ? 320 : 230)) {
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
    if (["swordsman", "knight"].includes(entity.type)) return entity.def.damage * entity.faction.modifiers.meleeDamage;
    if (["archer", "hunter", "hero"].includes(entity.type)) return entity.def.damage * entity.faction.modifiers.rangedDamage;
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
    if (def.type === "stop") {
      const unitIds = this.state.selected.filter((entry) => entry.kind === "unit").map((entry) => entry.id);
      if (unitIds.length === 0) {
        this.showMessage("Сначала выдели юнитов.");
        return;
      }
      this.issueCommands([{ kind: "stop", unitIds }]);
      return;
    }
    if (def.type === "build") {
      if (!this.state.selected.some((entry) => entry.kind === "unit" && entry.type === "worker")) {
        this.showMessage("Для строительства нужен хотя бы один рабочий.");
        return;
      }
      this.enterBuildMode(def.value);
      return;
    }
    if (def.type === "train") {
      const building = this.getSingleSelectedBuilding();
      if (!building) {
        this.showMessage("Выдели производящее здание.");
        return;
      }
      this.issueCommands([{ kind: "train", buildingId: building.id, unitType: def.value }]);
      return;
    }
  }

  triggerCommandSlot(index) {
    const button = this.ui.buttons[index];
    if (!button?.action) {
      return;
    }
    this.handleCommandButton(button.action);
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
      this.showMessage("Выдели рабочих для строительства.");
      return;
    }
    this.issueCommands([{ kind: "place_building", buildingType: this.state.buildMode, workerIds: workers, point: worldPoint }]);
    this.cancelBuildMode();
  }

  canPlaceBuilding(type, x, y) {
    const size = BUILDING_DEFS[type].size;
    const padding = size / 2 + 20;
    if (x < padding || y < padding || x > MAP_WIDTH - padding || y > MAP_HEIGHT - padding) return { ok: false, reason: "Слишком близко к краю карты" };
    if (this.state.buildings.some((entry) => distance(entry, { x, y }) < (entry.def.size + size) * 0.65)) return { ok: false, reason: "Площадка занята" };
    if (this.state.resourcesNodes.some((entry) => distance(entry, { x, y }) < entry.radius + size * 0.7)) return { ok: false, reason: "Слишком близко к ресурсам" };
    return { ok: true };
  }

  queueTraining(building, type, options = {}) {
    const { silent = false } = options;
    const owner = this.state.players[building.ownerId];
    const def = UNIT_DEFS[type];
    if (!building.completed) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("Здание ещё строится.");
      return false;
    }
    if (!building.def.canTrain?.includes(type)) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("Это здание не может обучать этот тип юнитов.");
      return false;
    }
    if (
      def.hero &&
      (
        this.state.units.some((entry) => entry.ownerId === building.ownerId && entry.type === type && !entry.dead) ||
        this.state.buildings.some((entry) => entry.ownerId === building.ownerId && entry.queue.some((queueItem) => queueItem.type === type))
      )
    ) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("Герой этого дома уже на поле или в очереди.");
      return false;
    }
    if (owner.resources.supplyUsed + def.cost.supply > owner.resources.supplyCap) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("Нужен лимит. Строй фермы.");
      return false;
    }
    if (!this.payCost(building.ownerId, def.cost)) {
      if (!silent && building.ownerId === this.localPlayerId) this.showMessage("Недостаточно ресурсов.");
      return false;
    }
    building.queue.push({ type, remaining: def.trainTime });
    this.updateSupply(building.ownerId);
    if (!silent && building.ownerId === this.localPlayerId) this.showMessage(`${this.getUnitLabel(type, building.ownerId)} добавлен в очередь.`);
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

  applyDamage(target, amount, attacker = null) {
    if (target.dead) return;
    target.hp -= amount;
    if (attacker?.ownerId && target.ownerId && this.state.ai[target.ownerId]) {
      const ai = this.state.ai[target.ownerId];
      ai.threatTargetId = attacker.id;
      ai.underAttackUntil = this.time.now + 18000;
    }
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
      entry.amountPlate?.destroy();
      entry.amountText?.destroy();
      entry.decorations?.forEach((part) => part.destroy());
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
    const hostileAlive = livingTownHalls.some((entry) => this.isEnemyOwner(this.localPlayerId, entry.ownerId));
    if (!localAlive) this.state.result = "Поражение";
    if (localAlive && !hostileAlive) this.state.result = "Победа";
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

  centerCameraOnLocalBase(force = false) {
    if (!force && this.state.cameraCentered) {
      return;
    }
    const cam = this.cameras.main;
    const townhall = this.state.buildings.find((entry) => entry.ownerId === this.localPlayerId && entry.type === "townhall" && !entry.dead);
    const fallbackUnit = this.state.units.find((entry) => entry.ownerId === this.localPlayerId && !entry.dead);
    const target = townhall ?? fallbackUnit;
    if (!target) {
      return;
    }

    cam.centerOn(target.x, target.y);
    cam.scrollX = clamp(cam.scrollX, 0, MAP_WIDTH - cam.width / cam.zoom);
    cam.scrollY = clamp(cam.scrollY, 0, MAP_HEIGHT - cam.height / cam.zoom);
    this.state.cameraCentered = true;
  }

  updateUI(now) {
    const player = this.state.players[this.localPlayerId];
    if (!player) return;
    this.ui.stats.setText(
      `Золото ${Math.floor(player.resources.gold)}   Дерево ${Math.floor(player.resources.wood)}   Лимит ${player.resources.supplyUsed}/${player.resources.supplyCap}`
    );
    this.ui.status.setText(this.state.result ?? (this.state.messageUntil > now ? this.state.message : `${player.factionDef.name} готово к бою`));
    this.ui.roster.setText(
      this.roster
        .map((entry) => `${entry.playerId === this.localPlayerId ? ">" : " "} ${FACTION_DEFS[entry.faction].name} • T${entry.team}${entry.isHuman ? "" : " • бот"}`)
        .join("\n")
    );

    if (this.state.inspectedResource?.dead || this.state.inspectedResource?.amount <= 0) {
      this.state.inspectedResource = null;
    }

    if (this.state.selected.length === 0 && this.state.inspectedResource) {
      const node = this.state.inspectedResource;
      const kindLabel = node.type === "gold" ? "Золотая жила" : "Лес";
      this.ui.selection.setText(`${kindLabel}  ${Math.max(0, Math.floor(node.amount))}/${Math.floor(node.maxAmount ?? node.amount)}`);
      this.ui.details.setText(
        node.type === "gold" ? "Рабочие добывают здесь золото и везут его в ратушу." : "Рабочие рубят здесь древесину."
      );
    } else if (this.state.selected.length === 0) {
      this.ui.selection.setText("Ничего не выделено");
      this.ui.details.setText(
        this.mode === "multiplayer" && !this.isHost && !this.state.snapshotSeen
          ? "Ожидание снапшота мира от хоста..."
          : "Рабочие собирают ресурсы и строят. Казармы, кузница и зал героев дают армию."
      );
    } else if (this.state.selected.length === 1) {
      const entity = this.state.selected[0];
      const title = entity.kind === "unit" ? this.getUnitLabel(entity.type, entity.ownerId) : entity.def.label;
      this.ui.selection.setText(`${title}  HP ${Math.max(0, Math.ceil(entity.hp))}/${entity.def.maxHp}`);
      this.ui.details.setText(
        entity.kind === "building"
          ? entity.queue.length
            ? `Очередь: ${entity.queue.map((entry) => this.getUnitLabel(entry.type, entity.ownerId)).join(", ")}`
            : entity.completed
              ? "Здание активно"
              : `Строительство ${Math.floor((entity.buildProgress / entity.def.buildTime) * 100)}%`
          : entity.carry
            ? `Несёт ${Math.floor(entity.carry.amount)} ${RESOURCE_TYPES[entity.carry.type]?.label ?? entity.carry.type}`
            : `Урон ${Math.floor(this.getDamage(entity))}  Дальность ${entity.def.range}  Скорость ${Math.floor(this.getMoveSpeed(entity))}`
      );
    } else {
      this.ui.selection.setText(`Выделено: ${this.state.selected.length}`);
      this.ui.details.setText(
        this.state.selected
          .map((entry) => (entry.kind === "unit" ? this.getUnitLabel(entry.type, entry.ownerId) : entry.def.label))
          .join(", ")
      );
    }

    this.refreshButtons();
    if (this.state.result) this.ui.result.setVisible(true).setText(this.state.result);
  }

  refreshButtons() {
    const actions = this.getCommandActions();
    this.ui.buttons.forEach((button, index) => {
      const action = actions[index] ?? null;
      const enabled = Boolean(action);
      button.action = action;
      button.container.setVisible(true);
      if (button.hit.input) {
        button.hit.input.enabled = enabled;
        button.hit.input.cursor = enabled ? "pointer" : "default";
      }

      if (!enabled) {
        button.bg.setFillStyle(0x191410, 0.55);
        button.bg.setStrokeStyle(2, 0x3c3328, 0.6);
        button.keycap.setColor("#665f54");
        button.title.setText("").setColor("#6c675d");
        button.sub.setText("").setColor("#5b564c");
        return;
      }

      const paletteByType = {
        build: { fill: 0x1a2116, stroke: 0x7c9a65, title: "#edf4e2", sub: "#b8c9a7" },
        train: { fill: 0x1d1914, stroke: 0xa88c63, title: "#f4e8d2", sub: "#c9b290" },
        cancel: { fill: 0x241613, stroke: 0xb87266, title: "#f4d9d6", sub: "#c89b95" },
        stop: { fill: 0x151b24, stroke: 0x6e93be, title: "#dde8f5", sub: "#a8bfd7" }
      };
      const palette = paletteByType[action.type] ?? paletteByType.train;
      button.bg.setFillStyle(palette.fill, 0.92);
      button.bg.setStrokeStyle(2, palette.stroke, 0.95);
      button.keycap.setColor("#efe2c8");
      button.title.setText(action.label).setColor(palette.title);
      button.sub.setText(action.costText ?? "").setColor(palette.sub);
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
      if (!this.isPointExplored(entry.x, entry.y)) return;
      this.minimap.fillStyle(RESOURCE_TYPES[entry.type].color, 0.8);
      this.minimap.fillRect(x + entry.x * scaleX, y + entry.y * scaleY, 2, 2);
    });
    this.roster.forEach((entry) => {
      const faction = FACTION_DEFS[entry.faction];
      this.minimap.fillStyle(faction.color, 0.95);
      this.state.units
        .filter((unit) => unit.ownerId === entry.playerId && (entry.playerId === this.localPlayerId || this.isPointVisible(unit.x, unit.y)))
        .forEach((unit) => this.minimap.fillRect(x + unit.x * scaleX, y + unit.y * scaleY, 3, 3));
      this.state.buildings
        .filter((building) => building.ownerId === entry.playerId && (entry.playerId === this.localPlayerId || this.isPointVisible(building.x, building.y)))
        .forEach((building) => this.minimap.fillRect(x + building.x * scaleX, y + building.y * scaleY, 4, 4));
    });
    const fog = this.state.fog;
    if (fog) {
      for (let row = 0; row < fog.rows; row += 1) {
        for (let col = 0; col < fog.cols; col += 1) {
          const idx = row * fog.cols + col;
          if (fog.visible[idx]) continue;
          const alpha = fog.explored[idx] ? 0.35 : 0.88;
          this.minimap.fillStyle(0x060708, alpha);
          this.minimap.fillRect(x + col * fog.cellSize * scaleX, y + row * fog.cellSize * scaleY, fog.cellSize * scaleX, fog.cellSize * scaleY);
        }
      }
    }
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
            { resources: entry.resources, faction: entry.faction, name: entry.name, isHuman: entry.isHuman, team: entry.team }
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
          amount: entry.amount,
          maxAmount: entry.maxAmount
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
        this.state.players[playerId].team = data.team ?? this.state.players[playerId].team;
        this.state.players[playerId].name = data.name ?? this.state.players[playerId].name;
      }
    });
    this.syncSnapshotEntities(payload.resourcesNodes, "resource");
    this.syncSnapshotEntities(payload.buildings, "building");
    this.syncSnapshotEntities(payload.units, "unit");
    const highestIncomingId = Math.max(
      0,
      ...(payload.resourcesNodes ?? []).map((entry) => entry.id),
      ...(payload.buildings ?? []).map((entry) => entry.id),
      ...(payload.units ?? []).map((entry) => entry.id)
    );
    this.state.nextId = Math.max(this.state.nextId, highestIncomingId + 1);
    this.centerCameraOnLocalBase();
  }

  syncSnapshotEntities(entries, kind) {
    if (kind === "resource") {
      const incomingIds = new Set(entries.map((entry) => entry.id));
      this.state.resourcesNodes.filter((entry) => !incomingIds.has(entry.id)).forEach((entry) => {
        entry.shadow.destroy();
        entry.sprite.destroy();
        entry.amountPlate?.destroy();
        entry.amountText?.destroy();
        entry.decorations?.forEach((part) => part.destroy());
        entry.dead = true;
      });
      this.state.resourcesNodes = this.state.resourcesNodes.filter((entry) => incomingIds.has(entry.id));
      entries.forEach((data) => {
        let entity = this.state.resourcesNodes.find((entry) => entry.id === data.id);
        if (!entity) entity = this.spawnResource(data.type, data.x, data.y, data.amount, { fixedId: data.id, maxAmount: data.maxAmount ?? data.amount });
        entity.id = data.id;
        entity.x = data.x;
        entity.y = data.y;
        entity.amount = data.amount;
        entity.maxAmount = data.maxAmount ?? entity.maxAmount ?? data.amount;
        entity.sprite.setPosition(entity.x, entity.y);
        entity.shadow.setPosition(entity.x, entity.y + 20);
        if (entity.amountPlate) entity.amountPlate.setPosition(entity.x, entity.y + 34);
        if (entity.amountText) entity.amountText.setPosition(entity.x, entity.y + 34);
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
