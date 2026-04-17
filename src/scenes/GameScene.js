import Phaser from "phaser";
import { BUILD_OPTIONS, BUILDING_DEFS, MAP_HEIGHT, MAP_WIDTH, RESOURCE_TYPES, UNIT_DEFS } from "../game/defs.js";
import { clamp, distance, distanceSq, formatCost, makeSelectionRect, pointInRect } from "../game/utils.js";

const PLAYER = "player";
const ENEMY = "enemy";

export class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  create() {
    this.state = {
      resources: {
        [PLAYER]: { gold: 320, wood: 260, supplyUsed: 0, supplyCap: 0 },
        [ENEMY]: { gold: 240, wood: 220, supplyUsed: 0, supplyCap: 0 }
      },
      units: [],
      buildings: [],
      resourcesNodes: [],
      projectiles: [],
      selected: [],
      buildMode: null,
      placingGhost: null,
      nextId: 1,
      message: "",
      messageUntil: 0,
      result: null,
      ai: {
        nextDecisionAt: 0,
        nextAttackAt: 0
      }
    };

    this.input.mouse.disableContextMenu();
    this.createMap();
    this.createWorldState();
    this.createUI();
    this.setupInput();
    this.bindResize();
    this.showMessage("Harvest, build and crush the enemy stronghold.");
  }

  createMap() {
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1f3b23, 0x294f2f, 0x182b18, 0x233b23, 1);
    bg.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    for (let i = 0; i < 240; i += 1) {
      const x = Phaser.Math.Between(0, MAP_WIDTH);
      const y = Phaser.Math.Between(0, MAP_HEIGHT);
      const radius = Phaser.Math.Between(18, 52);
      const color = Phaser.Display.Color.GetColor(
        Phaser.Math.Between(28, 42),
        Phaser.Math.Between(70, 95),
        Phaser.Math.Between(26, 42)
      );
      bg.fillStyle(color, 0.18);
      bg.fillCircle(x, y, radius);
    }

    const river = this.add.graphics();
    river.fillStyle(0x244d63, 0.42);
    river.beginPath();
    river.moveTo(420, 0);
    river.quadraticCurveTo(820, 420, 740, 950);
    river.quadraticCurveTo(680, 1450, 980, 2200);
    river.lineTo(1230, 2200);
    river.quadraticCurveTo(840, 1460, 970, 920);
    river.quadraticCurveTo(1090, 380, 760, 0);
    river.closePath();
    river.fillPath();

    this.worldLayer = this.add.container();
    this.resourceLayer = this.add.container();
    this.buildingLayer = this.add.container();
    this.unitLayer = this.add.container();
    this.fxLayer = this.add.container();

    this.selectionGraphics = this.add.graphics();
    this.selectionGraphics.setScrollFactor(0);
    this.commandMarker = this.add.graphics();
  }

  createWorldState() {
    this.spawnStartingBase(PLAYER, 320, 1460);
    this.spawnStartingBase(ENEMY, 2790, 680);

    const nodeData = [
      ["gold", 600, 1340, 1500],
      ["gold", 930, 1620, 1500],
      ["gold", 2440, 840, 1500],
      ["gold", 2670, 560, 1500],
      ["wood", 520, 1180, 2200],
      ["wood", 1030, 1460, 2200],
      ["wood", 2280, 980, 2200],
      ["wood", 2900, 820, 2200],
      ["wood", 1580, 580, 2200],
      ["gold", 1670, 1540, 1200]
    ];

    nodeData.forEach(([type, x, y, amount]) => this.spawnResource(type, x, y, amount));
  }

  spawnStartingBase(owner, x, y) {
    const sign = owner === PLAYER ? 1 : -1;
    const townhall = this.spawnBuilding(owner, "townhall", x, y, true);
    this.spawnUnit(owner, "worker", x + 96 * sign, y - 40);
    this.spawnUnit(owner, "worker", x + 108 * sign, y + 18);
    this.spawnUnit(owner, "worker", x + 58 * sign, y + 78);
    this.spawnUnit(owner, "swordsman", x + 34 * sign, y - 116);
    this.spawnUnit(owner, "archer", x - 14 * sign, y - 136);
    if (owner === ENEMY) {
      this.spawnBuilding(owner, "barracks", x - 120, y + 110, true);
      this.spawnBuilding(owner, "farm", x - 156, y - 90, true);
      townhall.rallyPoint = { x: x - 160, y: y + 20 };
    }
  }

  spawnResource(type, x, y, amount) {
    const texture = type === "gold" ? "gold-mine" : "tree";
    const scale = type === "gold" ? 1.4 : 1.2;
    const sprite = this.add.image(x, y, texture).setTint(RESOURCE_TYPES[type].color).setScale(scale);
    this.resourceLayer.add(sprite);
    const node = {
      id: this.state.nextId++,
      kind: "resource",
      type,
      x,
      y,
      amount,
      sprite,
      radius: type === "gold" ? 30 : 26
    };
    sprite.setData("entity", node);
    this.state.resourcesNodes.push(node);
    return node;
  }

  spawnUnit(owner, type, x, y) {
    const def = UNIT_DEFS[type];
    const baseTint = owner === PLAYER ? def.color : Phaser.Display.Color.IntegerToColor(def.color).darken(35).color;
    const sprite = this.add.image(x, y, "unit-circle").setTint(baseTint);
    const hpBg = this.add.rectangle(x, y - 18, 30, 4, 0x000000, 0.6);
    const hpFill = this.add.rectangle(x - 15, y - 18, 30, 4, 0x6dd66d, 1).setOrigin(0, 0.5);
    const selection = this.add.circle(x, y, def.radius + 6).setStrokeStyle(2, owner === PLAYER ? 0xf4f1d0 : 0xe66060, 0.95).setVisible(false);
    this.unitLayer.add([selection, sprite, hpBg, hpFill]);

    const unit = {
      id: this.state.nextId++,
      kind: "unit",
      owner,
      type,
      x,
      y,
      hp: def.maxHp,
      def,
      sprite,
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
      targetPos: null,
      rallyFrom: null
    };

    sprite.setData("entity", unit);
    this.state.units.push(unit);
    this.updateSupply(owner);
    return unit;
  }

  spawnBuilding(owner, type, x, y, completed) {
    const def = BUILDING_DEFS[type];
    const baseTint = owner === PLAYER ? def.color : Phaser.Display.Color.IntegerToColor(def.color).darken(35).color;
    const sprite = this.add.image(x, y, "building-square").setDisplaySize(def.size, def.size).setTint(baseTint);
    const hpBg = this.add.rectangle(x, y - def.size / 2 - 10, def.size, 6, 0x000000, 0.66);
    const hpFill = this.add.rectangle(x - def.size / 2, y - def.size / 2 - 10, def.size, 6, 0x6dd66d, 1).setOrigin(0, 0.5);
    const selection = this.add.rectangle(x, y, def.size + 10, def.size + 10).setStrokeStyle(2, owner === PLAYER ? 0xf4f1d0 : 0xe66060, 0.95).setVisible(false);
    const label = this.add.text(x, y, def.label[0], {
      fontFamily: "Georgia",
      fontSize: `${Math.round(def.size * 0.38)}px`,
      color: owner === PLAYER ? "#fff6cf" : "#ffe1dd"
    }).setOrigin(0.5);
    this.buildingLayer.add([selection, sprite, label, hpBg, hpFill]);

    const building = {
      id: this.state.nextId++,
      kind: "building",
      owner,
      type,
      x,
      y,
      hp: completed ? def.maxHp : Math.ceil(def.maxHp * 0.25),
      def,
      sprite,
      label,
      hpBg,
      hpFill,
      selection,
      queue: [],
      training: null,
      buildProgress: completed ? def.buildTime : 0,
      completed,
      underConstruction: !completed,
      workerIds: new Set(),
      lastAttackAt: 0,
      rallyPoint: { x: x + (owner === PLAYER ? 110 : -110), y: y + 30 }
    };

    if (!completed) {
      sprite.setAlpha(0.58);
      label.setAlpha(0.7);
    }

    sprite.setData("entity", building);
    this.state.buildings.push(building);
    this.updateSupply(owner);
    return building;
  }

  createUI() {
    const width = this.scale.width;
    const height = this.scale.height;

    this.ui = {
      topBar: this.add.rectangle(0, 0, width, 54, 0x14100d, 0.92).setOrigin(0).setScrollFactor(0),
      bottomBar: this.add.rectangle(0, height - 144, width, 144, 0x14100d, 0.94).setOrigin(0).setScrollFactor(0),
      title: this.add.text(16, 12, "Ironfront", { fontSize: "24px", color: "#f1ddb1", fontFamily: "Georgia" }).setScrollFactor(0),
      stats: this.add.text(190, 14, "", { fontSize: "18px", color: "#f4f2e6" }).setScrollFactor(0),
      status: this.add.text(width - 20, 15, "", { fontSize: "18px", color: "#f8c885" }).setOrigin(1, 0).setScrollFactor(0),
      selection: this.add.text(20, height - 132, "", { fontSize: "20px", color: "#f4f2e6", wordWrap: { width: 310 } }).setScrollFactor(0),
      details: this.add.text(20, height - 92, "", { fontSize: "15px", color: "#bfb8a9", wordWrap: { width: 360 } }).setScrollFactor(0),
      hint: this.add.text(width - 20, height - 128, "LMB select  RMB command  Drag edges/WASD move camera  Wheel zoom", {
        fontSize: "15px",
        color: "#bfb8a9",
        align: "right"
      }).setOrigin(1, 0).setScrollFactor(0),
      buttons: [],
      result: this.add.text(width / 2, 84, "", {
        fontSize: "42px",
        fontStyle: "bold",
        color: "#fff2c7",
        fontFamily: "Georgia",
        stroke: "#000000",
        strokeThickness: 4
      }).setOrigin(0.5, 0).setScrollFactor(0).setVisible(false)
    };

    this.buildCommandButtons();
  }

  buildCommandButtons() {
    this.ui.buttons.forEach((button) => button.container.destroy());
    this.ui.buttons = [];

    const buttonDefs = [
      { key: "build-farm", label: "Farm", type: "build", value: "farm" },
      { key: "build-barracks", label: "Barracks", type: "build", value: "barracks" },
      { key: "build-tower", label: "Tower", type: "build", value: "tower" },
      { key: "train-worker", label: "Worker", type: "train", value: "worker" },
      { key: "train-swordsman", label: "Swordsman", type: "train", value: "swordsman" },
      { key: "train-archer", label: "Archer", type: "train", value: "archer" },
      { key: "cancel", label: "Cancel", type: "cancel", value: null }
    ];

    buttonDefs.forEach((buttonDef, index) => {
      const x = 390 + (index % 4) * 148;
      const y = this.scale.height - 122 + Math.floor(index / 4) * 58;
      const bg = this.add.rectangle(x, y, 132, 42, 0x2a241e, 0.95).setStrokeStyle(2, 0x7d6f5c, 0.9);
      const text = this.add.text(x, y, buttonDef.label, { fontSize: "16px", color: "#f4f2e6" }).setOrigin(0.5);
      const container = this.add.container(0, 0, [bg, text]).setScrollFactor(0).setVisible(false);
      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerdown", () => this.handleCommandButton(buttonDef));
      this.ui.buttons.push({ ...buttonDef, container, bg, text });
    });
  }

  bindResize() {
    this.scale.on("resize", (gameSize) => {
      const width = gameSize.width;
      const height = gameSize.height;
      this.ui.topBar.setSize(width, 54);
      this.ui.bottomBar.setPosition(0, height - 144).setSize(width, 144);
      this.ui.status.setPosition(width - 20, 15);
      this.ui.selection.setPosition(20, height - 132);
      this.ui.details.setPosition(20, height - 92);
      this.ui.hint.setPosition(width - 20, height - 128);
      this.ui.result.setPosition(width / 2, 84);
      this.buildCommandButtons();
    });
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      build: Phaser.Input.Keyboard.KeyCodes.B,
      stop: Phaser.Input.Keyboard.KeyCodes.X,
      townhall: Phaser.Input.Keyboard.KeyCodes.H,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE
    });

    this.dragSelect = {
      active: false,
      start: new Phaser.Math.Vector2(),
      end: new Phaser.Math.Vector2()
    };

    this.input.on("pointerdown", (pointer) => {
      if (this.state.result && pointer.rightButtonDown()) {
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
      if (pointer.button !== 0 || !this.dragSelect.active) {
        return;
      }
      this.dragSelect.active = false;
      const rect = makeSelectionRect(this.dragSelect.start, this.dragSelect.end);
      if (rect.width < 10 && rect.height < 10) {
        this.handleSingleSelection(pointer.positionToCamera(this.cameras.main), pointer.event.shiftKey);
      } else {
        this.selectInRect(rect, pointer.event.shiftKey);
      }
      this.selectionGraphics.clear();
    });

    this.input.on("wheel", (_pointer, _gos, _dx, dy) => {
      const cam = this.cameras.main;
      cam.zoom = clamp(cam.zoom - dy * 0.001, 0.7, 1.35);
    });
  }

  handleSingleSelection(worldPoint, additive) {
    const entity = this.getEntityAt(worldPoint);
    if (!additive) {
      this.clearSelection();
    }
    if (entity && entity.owner === PLAYER) {
      this.addToSelection(entity);
    }
  }

  selectInRect(rect, additive) {
    if (!additive) {
      this.clearSelection();
    }

    this.state.units
      .filter((unit) => unit.owner === PLAYER && pointInRect(unit, rect))
      .forEach((unit) => this.addToSelection(unit));

    if (this.state.selected.length === 0) {
      this.state.buildings
        .filter((building) => building.owner === PLAYER && pointInRect(building, rect))
        .forEach((building) => this.addToSelection(building));
    }
  }

  getEntityAt(worldPoint) {
    const candidates = [
      ...this.state.units.filter((unit) => distanceSq(unit, worldPoint) <= (unit.def.radius + 4) ** 2),
      ...this.state.buildings.filter((building) => {
        const half = building.def.size / 2;
        return (
          worldPoint.x >= building.x - half &&
          worldPoint.x <= building.x + half &&
          worldPoint.y >= building.y - half &&
          worldPoint.y <= building.y + half
        );
      }),
      ...this.state.resourcesNodes.filter((node) => distanceSq(node, worldPoint) <= node.radius ** 2)
    ];

    candidates.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "unit" ? -1 : 1;
      }
      return 0;
    });
    return candidates[0] ?? null;
  }

  addToSelection(entity) {
    if (entity.kind === "resource") {
      return;
    }
    if (this.state.selected.includes(entity)) {
      return;
    }
    entity.selection.setVisible(true);
    this.state.selected.push(entity);
  }

  clearSelection() {
    this.state.selected.forEach((entity) => entity.selection.setVisible(false));
    this.state.selected = [];
  }

  handleRightClick(worldPoint) {
    if (this.state.selected.length === 0 || this.state.result) {
      return;
    }

    if (this.state.buildMode) {
      this.cancelBuildMode();
      return;
    }

    const target = this.getEntityAt(worldPoint);
    const selectedUnits = this.state.selected.filter((entity) => entity.kind === "unit");

    if (selectedUnits.length === 0) {
      const selectedBuilding = this.state.selected[0];
      if (selectedBuilding?.kind === "building") {
        selectedBuilding.rallyPoint = { x: worldPoint.x, y: worldPoint.y };
        this.showCommandMarker(worldPoint.x, worldPoint.y, 0xf4f1d0);
      }
      return;
    }

    const formationColumns = Math.ceil(Math.sqrt(selectedUnits.length));
    selectedUnits.forEach((unit, index) => {
      const offsetX = (index % formationColumns) * 34;
      const offsetY = Math.floor(index / formationColumns) * 34;
      const formationPoint = {
        x: worldPoint.x + offsetX - (formationColumns * 17),
        y: worldPoint.y + offsetY - 18
      };

      if (target?.kind === "resource" && unit.type === "worker") {
        this.commandGather(unit, target);
      } else if (target && target.owner && target.owner !== unit.owner) {
        this.commandAttack(unit, target);
      } else if (target?.kind === "building" && target.owner === PLAYER && unit.type === "worker" && unit.carry) {
        this.commandReturn(unit, target);
      } else {
        this.commandMove(unit, formationPoint);
      }
    });

    this.showCommandMarker(worldPoint.x, worldPoint.y, target?.owner && target.owner !== PLAYER ? 0xd95959 : 0xf4f1d0);
  }

  commandMove(unit, point) {
    unit.state = "moving";
    unit.moveTarget = { x: point.x, y: point.y };
    unit.attackTarget = null;
    unit.resourceTarget = null;
    unit.buildTarget = null;
  }

  commandAttack(unit, target) {
    unit.state = "attacking";
    unit.attackTarget = target;
    unit.moveTarget = null;
    unit.resourceTarget = null;
  }

  commandGather(unit, resource) {
    unit.state = "gathering";
    unit.resourceTarget = resource;
    unit.attackTarget = null;
    unit.moveTarget = null;
  }

  commandReturn(unit, building) {
    unit.state = "returning";
    unit.moveTarget = { x: building.x, y: building.y };
    unit.attackTarget = null;
    unit.resourceTarget = building;
  }

  showCommandMarker(x, y, color) {
    this.commandMarker.clear();
    this.commandMarker.lineStyle(2, color, 0.9);
    this.commandMarker.strokeCircle(x, y, 18);
    this.commandMarker.strokeCircle(x, y, 10);
    this.time.delayedCall(260, () => this.commandMarker.clear());
  }

  handleCommandButton(buttonDef) {
    if (this.state.result) {
      return;
    }

    if (buttonDef.type === "cancel") {
      if (this.state.buildMode) {
        this.cancelBuildMode();
        return;
      }

      const building = this.getSingleSelectedBuilding();
      if (building?.queue.length) {
        const queueItem = building.queue.pop();
        const unitDef = UNIT_DEFS[queueItem.type];
        this.state.resources[PLAYER].gold += unitDef.cost.gold;
        this.state.resources[PLAYER].wood += unitDef.cost.wood;
        this.updateSupply(PLAYER);
      }
      return;
    }

    if (buttonDef.type === "build") {
      const workers = this.state.selected.filter((entity) => entity.kind === "unit" && entity.type === "worker");
      if (workers.length === 0) {
        return;
      }
      this.enterBuildMode(buttonDef.value);
      return;
    }

    if (buttonDef.type === "train") {
      const building = this.getSingleSelectedBuilding();
      if (!building || !building.completed || !building.def.canTrain?.includes(buttonDef.value)) {
        return;
      }
      this.queueTraining(building, buttonDef.value);
    }
  }

  getSingleSelectedBuilding() {
    return this.state.selected.length === 1 && this.state.selected[0].kind === "building" ? this.state.selected[0] : null;
  }

  enterBuildMode(type) {
    this.cancelBuildMode();
    const def = BUILDING_DEFS[type];
    this.state.buildMode = type;
    this.state.placingGhost = this.add
      .rectangle(0, 0, def.size, def.size, 0xb0d5a0, 0.28)
      .setStrokeStyle(2, 0xf4f1d0, 0.92);
    this.state.placingGhost.setDepth(1000);
    this.showMessage(`Place ${def.label}`);
  }

  cancelBuildMode() {
    this.state.buildMode = null;
    this.state.placingGhost?.destroy();
    this.state.placingGhost = null;
  }

  tryPlaceBuilding(worldPoint) {
    const type = this.state.buildMode;
    const def = BUILDING_DEFS[type];
    const workers = this.state.selected.filter((entity) => entity.kind === "unit" && entity.type === "worker");
    if (workers.length === 0) {
      this.cancelBuildMode();
      return;
    }

    const canPlace = this.canPlaceBuilding(type, worldPoint.x, worldPoint.y);
    if (!canPlace.ok) {
      this.showMessage(canPlace.reason);
      return;
    }

    if (!this.payCost(PLAYER, def.cost)) {
      this.showMessage("Not enough resources.");
      return;
    }

    const building = this.spawnBuilding(PLAYER, type, worldPoint.x, worldPoint.y, false);
    workers.forEach((worker, index) => {
      worker.buildTarget = building;
      worker.state = "building";
      worker.moveTarget = { x: building.x + ((index % 2) * 28) - 14, y: building.y + (Math.floor(index / 2) * 28) - 14 };
      building.workerIds.add(worker.id);
    });
    this.cancelBuildMode();
    this.showMessage(`${def.label} construction started.`);
  }

  canPlaceBuilding(type, x, y) {
    const size = BUILDING_DEFS[type].size;
    const padding = size / 2 + 20;
    if (x < padding || y < padding || x > MAP_WIDTH - padding || y > MAP_HEIGHT - padding) {
      return { ok: false, reason: "Too close to map edge." };
    }

    const overlapsBuilding = this.state.buildings.some((building) => distance(building, { x, y }) < (building.def.size + size) * 0.65);
    if (overlapsBuilding) {
      return { ok: false, reason: "Area is blocked." };
    }

    const overlapsResource = this.state.resourcesNodes.some((node) => distance(node, { x, y }) < node.radius + size * 0.7);
    if (overlapsResource) {
      return { ok: false, reason: "Too close to resource node." };
    }

    return { ok: true };
  }

  queueTraining(building, type) {
    const def = UNIT_DEFS[type];
    const ownerState = this.state.resources[building.owner];
    if (ownerState.supplyUsed + def.cost.supply > ownerState.supplyCap) {
      if (building.owner === PLAYER) {
        this.showMessage("Need more supply.");
      }
      return false;
    }
    if (!this.payCost(building.owner, def.cost)) {
      if (building.owner === PLAYER) {
        this.showMessage("Not enough resources.");
      }
      return false;
    }

    building.queue.push({ type, remaining: def.trainTime });
    this.updateSupply(building.owner);
    if (building.owner === PLAYER) {
      this.showMessage(`${def.label} queued.`);
    }
    return true;
  }

  payCost(owner, cost) {
    const res = this.state.resources[owner];
    if (!cost) {
      return true;
    }
    if (res.gold < (cost.gold ?? 0) || res.wood < (cost.wood ?? 0)) {
      return false;
    }
    res.gold -= cost.gold ?? 0;
    res.wood -= cost.wood ?? 0;
    return true;
  }

  refundSupply(entity) {
    if (entity.kind === "unit") {
      this.state.resources[entity.owner].supplyUsed -= entity.def.cost.supply;
    }
  }

  update(_time, delta) {
    const now = this.time.now;
    const dt = delta / 1000;

    this.handleCamera(dt);
    this.updateSelectionBox();
    this.updateGhostPlacement();
    this.updateUnits(dt, now);
    this.updateBuildings(delta, now);
    this.updateProjectiles(dt);
    this.updateAI(now);
    this.cleanupDestroyed();
    this.updateUI(now);
    this.checkEndConditions();
  }

  handleCamera(dt) {
    const cam = this.cameras.main;
    const speed = 620 / cam.zoom;
    const pointer = this.input.activePointer;
    const edge = 24;

    if (this.keys.left.isDown || pointer.x < edge) {
      cam.scrollX -= speed * dt;
    }
    if (this.keys.right.isDown || pointer.x > this.scale.width - edge) {
      cam.scrollX += speed * dt;
    }
    if (this.keys.up.isDown || pointer.y < edge) {
      cam.scrollY -= speed * dt;
    }
    if (this.keys.down.isDown || pointer.y > this.scale.height - edge) {
      cam.scrollY += speed * dt;
    }

    cam.scrollX = clamp(cam.scrollX, 0, MAP_WIDTH - cam.width / cam.zoom);
    cam.scrollY = clamp(cam.scrollY, 0, MAP_HEIGHT - cam.height / cam.zoom);

    if (Phaser.Input.Keyboard.JustDown(this.keys.stop)) {
      this.state.selected.filter((entity) => entity.kind === "unit").forEach((unit) => {
        unit.state = "idle";
        unit.moveTarget = null;
        unit.attackTarget = null;
        unit.resourceTarget = null;
        unit.buildTarget = null;
      });
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.build)) {
      if (this.state.selected.some((entity) => entity.kind === "unit" && entity.type === "worker")) {
        this.enterBuildMode("farm");
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.townhall)) {
      const townhall = this.state.buildings.find((building) => building.owner === PLAYER && building.type === "townhall");
      if (townhall) {
        cam.centerOn(townhall.x, townhall.y);
        this.clearSelection();
        this.addToSelection(townhall);
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) {
      this.selectOwnedUnitType("worker");
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) {
      this.selectOwnedUnitType("swordsman");
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) {
      this.selectOwnedUnitType("archer");
    }
  }

  selectOwnedUnitType(type) {
    this.clearSelection();
    this.state.units
      .filter((unit) => unit.owner === PLAYER && unit.type === type)
      .slice(0, 12)
      .forEach((unit) => this.addToSelection(unit));
  }

  updateSelectionBox() {
    this.selectionGraphics.clear();
    if (!this.dragSelect.active) {
      return;
    }
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
    if (!this.state.placingGhost || !this.state.buildMode) {
      return;
    }
    const def = BUILDING_DEFS[this.state.buildMode];
    const canPlace = this.canPlaceBuilding(this.state.buildMode, this.state.placingGhost.x, this.state.placingGhost.y);
    this.state.placingGhost.setSize(def.size, def.size);
    this.state.placingGhost.setFillStyle(canPlace.ok ? 0x9fcf8a : 0xc05a5a, 0.28);
    this.state.placingGhost.setStrokeStyle(2, canPlace.ok ? 0xf4f1d0 : 0xffb4b4, 0.92);
  }

  updateUnits(dt, now) {
    for (const unit of this.state.units) {
      if (unit.dead) {
        continue;
      }

      if (unit.state === "building") {
        this.updateWorkerBuild(unit, dt);
      } else if (unit.state === "gathering") {
        this.updateWorkerGather(unit, dt);
      } else if (unit.state === "returning") {
        this.updateWorkerReturn(unit, dt);
      } else if (unit.state === "attacking") {
        this.updateCombatantAttack(unit, dt, now);
      } else if (unit.state === "moving") {
        if (unit.moveTarget && this.moveEntityTowards(unit, unit.moveTarget, unit.def.speed * dt)) {
          unit.moveTarget = null;
          unit.state = "idle";
        }
      } else {
        this.autoAcquireTarget(unit);
      }

      unit.sprite.setPosition(unit.x, unit.y);
      unit.selection.setPosition(unit.x, unit.y);
      unit.hpBg.setPosition(unit.x, unit.y - 18);
      unit.hpFill.setPosition(unit.x - 15, unit.y - 18).setDisplaySize(30 * (unit.hp / unit.def.maxHp), 4);
    }
  }

  updateWorkerBuild(unit, dt) {
    const building = unit.buildTarget;
    if (!building || building.dead) {
      unit.buildTarget = null;
      unit.state = "idle";
      return;
    }

    if (distance(unit, building) > building.def.size * 0.62) {
      this.moveEntityTowards(unit, { x: unit.moveTarget.x, y: unit.moveTarget.y }, unit.def.speed * dt);
      return;
    }

    if (building.completed) {
      unit.buildTarget = null;
      unit.state = "idle";
      return;
    }

    building.buildProgress += dt * 1000 * 0.65;
    building.hp = clamp(building.hp + dt * (building.def.maxHp / (building.def.buildTime / 1000)), 0, building.def.maxHp);
    if (building.buildProgress >= building.def.buildTime) {
      building.completed = true;
      building.underConstruction = false;
      building.sprite.setAlpha(1);
      building.label.setAlpha(1);
      building.hp = building.def.maxHp;
      this.updateSupply(building.owner);
      unit.buildTarget = null;
      unit.state = "idle";
      if (building.owner === PLAYER) {
        this.showMessage(`${building.def.label} ready.`);
      }
    }
  }

  updateWorkerGather(unit, dt) {
    const node = unit.resourceTarget;
    if (!node || node.dead || node.amount <= 0) {
      unit.resourceTarget = null;
      unit.state = "idle";
      return;
    }

    if (unit.carry && unit.carry.amount >= unit.def.carryLimit) {
      const dropOff = this.findNearestDropOff(unit.owner, unit);
      if (dropOff) {
        this.commandReturn(unit, dropOff);
      }
      return;
    }

    if (distance(unit, node) > node.radius + 10) {
      this.moveEntityTowards(unit, node, unit.def.speed * dt);
      return;
    }

    unit.carry ??= { type: node.type, amount: 0 };
    const gathered = Math.min(node.amount, unit.def.harvestRate * dt);
    node.amount -= gathered;
    unit.carry.amount += gathered;
    unit.carry.type = node.type;
    if (unit.carry.amount >= unit.def.carryLimit || node.amount <= 0) {
      const dropOff = this.findNearestDropOff(unit.owner, unit);
      if (dropOff) {
        this.commandReturn(unit, dropOff);
      } else {
        unit.state = "idle";
      }
    }
  }

  updateWorkerReturn(unit, dt) {
    const building = unit.resourceTarget;
    if (!building || building.dead) {
      unit.state = "idle";
      unit.resourceTarget = null;
      return;
    }

    if (!unit.carry) {
      unit.state = "idle";
      unit.resourceTarget = null;
      return;
    }

    if (distance(unit, building) > building.def.size * 0.62) {
      this.moveEntityTowards(unit, building, unit.def.speed * dt);
      return;
    }

    this.state.resources[unit.owner][unit.carry.type] += unit.carry.amount;
    const resourceNode = this.findClosestResource(unit, unit.carry.type);
    unit.carry = null;
    if (resourceNode) {
      this.commandGather(unit, resourceNode);
    } else {
      unit.state = "idle";
    }
  }

  updateCombatantAttack(attacker, dt, now) {
    const target = attacker.attackTarget;
    if (!target || target.dead) {
      attacker.attackTarget = null;
      attacker.state = "idle";
      return;
    }

    const range = attacker.def.range + (target.kind === "building" ? target.def.size / 2 : 0);
    const currentDistance = distance(attacker, target);
    if (currentDistance > range) {
      this.moveEntityTowards(attacker, target, attacker.def.speed * dt);
      return;
    }

    if (now - attacker.lastAttackAt < attacker.def.attackCooldown) {
      return;
    }

    attacker.lastAttackAt = now;
    if (attacker.type === "archer") {
      this.spawnProjectile(attacker, target);
    } else {
      this.applyDamage(target, attacker.def.damage, attacker);
    }
  }

  autoAcquireTarget(unit) {
    const enemies = [...this.state.units, ...this.state.buildings]
      .filter((entity) => entity.owner !== unit.owner && !entity.dead)
      .sort((a, b) => distanceSq(unit, a) - distanceSq(unit, b));
    const nearest = enemies[0];
    if (!nearest) {
      return;
    }
    const leash = unit.type === "worker" ? 90 : 180;
    if (distance(unit, nearest) <= leash) {
      unit.state = "attacking";
      unit.attackTarget = nearest;
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

  findNearestDropOff(owner, from) {
    return this.state.buildings
      .filter((building) => building.owner === owner && building.completed && ["townhall"].includes(building.type) && !building.dead)
      .sort((a, b) => distanceSq(from, a) - distanceSq(from, b))[0];
  }

  findClosestResource(from, type) {
    return this.state.resourcesNodes
      .filter((node) => node.type === type && node.amount > 0 && !node.dead)
      .sort((a, b) => distanceSq(from, a) - distanceSq(from, b))[0];
  }

  updateBuildings(delta, now) {
    for (const building of this.state.buildings) {
      if (building.dead) {
        continue;
      }

      if (building.completed && building.queue.length) {
        building.queue[0].remaining -= delta;
        if (building.queue[0].remaining <= 0) {
          const queueItem = building.queue.shift();
          const spawnX = building.rallyPoint?.x ?? building.x + (building.owner === PLAYER ? 90 : -90);
          const spawnY = building.rallyPoint?.y ?? building.y + 30;
          const unit = this.spawnUnit(building.owner, queueItem.type, building.x + (building.owner === PLAYER ? 60 : -60), building.y + 18);
          this.commandMove(unit, { x: spawnX, y: spawnY });
          if (building.owner === PLAYER) {
            this.showMessage(`${UNIT_DEFS[queueItem.type].label} ready.`);
          }
        }
      }

      if (building.completed && building.type === "tower") {
        const target = [...this.state.units, ...this.state.buildings]
          .filter((entity) => entity.owner !== building.owner && !entity.dead)
          .sort((a, b) => distanceSq(building, a) - distanceSq(building, b))[0];
        if (target && distance(building, target) <= building.def.range && now - building.lastAttackAt >= building.def.attackCooldown) {
          building.lastAttackAt = now;
          this.spawnProjectile(building, target, building.def.damage);
        }
      }

      building.hpBg.setPosition(building.x, building.y - building.def.size / 2 - 10);
      building.hpFill.setPosition(building.x - building.def.size / 2, building.y - building.def.size / 2 - 10);
      building.hpFill.setDisplaySize(building.def.size * (building.hp / building.def.maxHp), 6);
      building.selection.setPosition(building.x, building.y);
      building.sprite.setPosition(building.x, building.y);
      building.label.setPosition(building.x, building.y);
    }
  }

  spawnProjectile(source, target, overrideDamage = null) {
    const projectile = this.add.image(source.x, source.y, "projectile").setTint(source.owner === PLAYER ? 0xffefb0 : 0xff9b9b);
    this.fxLayer.add(projectile);
    this.state.projectiles.push({
      x: source.x,
      y: source.y,
      source,
      target,
      damage: overrideDamage ?? source.def.damage,
      speed: source.type === "archer" ? source.def.projectileSpeed : 320,
      sprite: projectile
    });
  }

  updateProjectiles(dt) {
    for (const projectile of this.state.projectiles) {
      if (projectile.dead) {
        continue;
      }

      if (!projectile.target || projectile.target.dead) {
        projectile.dead = true;
        projectile.sprite.destroy();
        continue;
      }

      const arrived = this.moveEntityTowards(projectile, projectile.target, projectile.speed * dt);
      projectile.sprite.setPosition(projectile.x, projectile.y);
      if (arrived) {
        this.applyDamage(projectile.target, projectile.damage, projectile.source);
        projectile.dead = true;
        projectile.sprite.destroy();
      }
    }
    this.state.projectiles = this.state.projectiles.filter((projectile) => !projectile.dead);
  }

  applyDamage(target, amount, source) {
    if (target.dead) {
      return;
    }
    target.hp -= amount;
    if (target.hp <= 0) {
      target.dead = true;
      if (target.kind === "unit") {
        this.refundSupply(target);
      }
      if (target.kind === "building") {
        this.updateSupply(target.owner);
      }
      if (source?.owner === PLAYER && target.owner === ENEMY) {
        this.showMessage(`${target.kind === "unit" ? target.def.label : target.def.label} destroyed.`);
      }
    }
  }

  updateAI(now) {
    if (now < this.state.ai.nextDecisionAt || this.state.result) {
      return;
    }
    this.state.ai.nextDecisionAt = now + 2300;

    const enemyTownHall = this.state.buildings.find((building) => building.owner === ENEMY && building.type === "townhall" && !building.dead);
    const enemyBarracks = this.state.buildings.find((building) => building.owner === ENEMY && building.type === "barracks" && !building.dead);
    const enemyFarm = this.state.buildings.find((building) => building.owner === ENEMY && building.type === "farm" && !building.dead);
    const enemyWorkers = this.state.units.filter((unit) => unit.owner === ENEMY && unit.type === "worker" && !unit.dead);

    enemyWorkers.forEach((worker) => {
      if (worker.state === "idle" || worker.state === "moving") {
        const resource = this.findClosestResource(worker, this.state.resources[ENEMY].gold < this.state.resources[ENEMY].wood ? "gold" : "wood");
        if (resource) {
          this.commandGather(worker, resource);
        }
      }
    });

    if (enemyTownHall?.completed) {
      if (enemyWorkers.length < 4) {
        this.queueTraining(enemyTownHall, "worker");
      }
    }

    if (!enemyFarm && enemyWorkers.length > 0) {
      const worker = enemyWorkers[0];
      if (this.payCost(ENEMY, BUILDING_DEFS.farm.cost)) {
        const farm = this.spawnBuilding(ENEMY, "farm", enemyTownHall.x - 130, enemyTownHall.y - 110, false);
        worker.buildTarget = farm;
        worker.state = "building";
        worker.moveTarget = { x: farm.x + 20, y: farm.y + 20 };
      }
    } else if (!enemyBarracks && enemyWorkers.length > 1 && this.state.resources[ENEMY].wood >= BUILDING_DEFS.barracks.cost.wood) {
      const worker = enemyWorkers[1];
      if (this.payCost(ENEMY, BUILDING_DEFS.barracks.cost)) {
        const barracks = this.spawnBuilding(ENEMY, "barracks", enemyTownHall.x - 100, enemyTownHall.y + 110, false);
        worker.buildTarget = barracks;
        worker.state = "building";
        worker.moveTarget = { x: barracks.x + 20, y: barracks.y };
      }
    }

    if (enemyBarracks?.completed) {
      const meleeCount = this.state.units.filter((unit) => unit.owner === ENEMY && unit.type === "swordsman" && !unit.dead).length;
      const rangedCount = this.state.units.filter((unit) => unit.owner === ENEMY && unit.type === "archer" && !unit.dead).length;
      this.queueTraining(enemyBarracks, meleeCount <= rangedCount ? "swordsman" : "archer");
    }

    if (now >= this.state.ai.nextAttackAt) {
      this.state.ai.nextAttackAt = now + Phaser.Math.Between(9000, 13500);
      const attackers = this.state.units.filter((unit) => unit.owner === ENEMY && !unit.dead && unit.type !== "worker");
      const playerTarget = [...this.state.units, ...this.state.buildings]
        .filter((entity) => entity.owner === PLAYER && !entity.dead)
        .sort((a, b) => distanceSq(enemyTownHall ?? { x: 0, y: 0 }, a) - distanceSq(enemyTownHall ?? { x: 0, y: 0 }, b))[0];
      if (playerTarget) {
        attackers.forEach((unit) => this.commandAttack(unit, playerTarget));
      }
    }
  }

  cleanupDestroyed() {
    this.state.resourcesNodes = this.state.resourcesNodes.filter((node) => {
      if (node.amount > 0 && !node.dead) {
        return true;
      }
      node.dead = true;
      node.sprite.destroy();
      return false;
    });

    this.state.units = this.state.units.filter((unit) => {
      if (!unit.dead) {
        return true;
      }
      if (this.state.selected.includes(unit)) {
        unit.selection.setVisible(false);
        this.state.selected = this.state.selected.filter((entity) => entity !== unit);
      }
      unit.sprite.destroy();
      unit.hpBg.destroy();
      unit.hpFill.destroy();
      unit.selection.destroy();
      return false;
    });

    this.state.buildings = this.state.buildings.filter((building) => {
      if (!building.dead) {
        return true;
      }
      if (this.state.selected.includes(building)) {
        building.selection.setVisible(false);
        this.state.selected = this.state.selected.filter((entity) => entity !== building);
      }
      building.sprite.destroy();
      building.label.destroy();
      building.hpBg.destroy();
      building.hpFill.destroy();
      building.selection.destroy();
      return false;
    });
  }

  updateUI(now) {
    const playerRes = this.state.resources[PLAYER];
    this.ui.stats.setText(
      `Gold ${Math.floor(playerRes.gold)}   Wood ${Math.floor(playerRes.wood)}   Supply ${playerRes.supplyUsed}/${playerRes.supplyCap}`
    );

    if (this.state.messageUntil > now) {
      this.ui.status.setText(this.state.message);
    } else {
      this.ui.status.setText("Destroy the enemy Town Hall.");
    }

    const selected = this.state.selected;
    if (selected.length === 0) {
      this.ui.selection.setText("No selection");
      this.ui.details.setText("Select workers to harvest or build. Select structures to queue units.");
    } else if (selected.length === 1) {
      const entity = selected[0];
      const progress =
        entity.kind === "building" && entity.queue.length
          ? `Queue: ${entity.queue.map((item) => UNIT_DEFS[item.type].label).join(", ")}`
          : entity.kind === "building" && !entity.completed
            ? `Construction ${Math.floor((entity.buildProgress / entity.def.buildTime) * 100)}%`
            : entity.kind === "unit" && entity.carry
              ? `Carrying ${Math.floor(entity.carry.amount)} ${entity.carry.type}`
              : entity.kind === "unit"
                ? `DMG ${entity.def.damage}  Range ${entity.def.range}  Speed ${entity.def.speed}`
                : `HP ${Math.ceil(entity.hp)}/${entity.def.maxHp}`;

      this.ui.selection.setText(`${entity.def.label}  HP ${Math.max(0, Math.ceil(entity.hp))}/${entity.def.maxHp}`);
      this.ui.details.setText(progress);
    } else {
      const countByType = selected.reduce((acc, entity) => {
        acc[entity.def.label] = (acc[entity.def.label] ?? 0) + 1;
        return acc;
      }, {});
      this.ui.selection.setText(`${selected.length} selected`);
      this.ui.details.setText(Object.entries(countByType).map(([label, count]) => `${label} x${count}`).join("   "));
    }

    this.refreshButtons();
    if (this.state.result) {
      this.ui.result.setVisible(true).setText(this.state.result);
    }
  }

  refreshButtons() {
    const selected = this.state.selected;
    const singleBuilding = this.getSingleSelectedBuilding();
    const hasWorker = selected.some((entity) => entity.kind === "unit" && entity.type === "worker");

    this.ui.buttons.forEach((button) => {
      let visible = false;
      let enabled = false;
      let subtitle = "";

      if (button.type === "build") {
        visible = hasWorker;
        enabled = visible;
        subtitle = formatCost(BUILDING_DEFS[button.value].cost);
      } else if (button.type === "train") {
        visible = Boolean(singleBuilding?.completed && singleBuilding.def.canTrain?.includes(button.value));
        enabled = visible;
        subtitle = formatCost(UNIT_DEFS[button.value].cost);
      } else if (button.type === "cancel") {
        visible = this.state.buildMode !== null || Boolean(singleBuilding?.queue.length);
        enabled = visible;
      }

      button.container.setVisible(visible);
      button.bg.setFillStyle(enabled ? 0x2a241e : 0x1d1813, 0.96);
      button.text.setText(subtitle ? `${button.label}\n${subtitle}` : button.label);
      button.text.setFontSize(subtitle ? "13px" : "16px");
      button.text.setAlign("center");
      button.text.setOrigin(0.5);
    });
  }

  updateSupply(owner) {
    const supplyCap = this.state.buildings
      .filter((building) => building.owner === owner && !building.dead && (building.completed || building.type === "townhall"))
      .reduce((sum, building) => sum + (building.def.supplyProvided ?? 0), 0);
    const trainedQueueSupply = this.state.buildings
      .filter((building) => building.owner === owner && !building.dead)
      .reduce(
        (sum, building) => sum + building.queue.reduce((inner, item) => inner + UNIT_DEFS[item.type].cost.supply, 0),
        0
      );
    const supplyUsed = this.state.units
      .filter((unit) => unit.owner === owner && !unit.dead)
      .reduce((sum, unit) => sum + unit.def.cost.supply, 0) + trainedQueueSupply;
    this.state.resources[owner].supplyCap = supplyCap;
    this.state.resources[owner].supplyUsed = supplyUsed;
  }

  showMessage(message) {
    this.state.message = message;
    this.state.messageUntil = this.time.now + 2400;
  }

  checkEndConditions() {
    if (this.state.result) {
      return;
    }

    const playerTownHallAlive = this.state.buildings.some((building) => building.owner === PLAYER && building.type === "townhall" && !building.dead);
    const enemyTownHallAlive = this.state.buildings.some((building) => building.owner === ENEMY && building.type === "townhall" && !building.dead);

    if (!enemyTownHallAlive) {
      this.state.result = "Victory";
      this.showMessage("Enemy fortress shattered.");
    } else if (!playerTownHallAlive) {
      this.state.result = "Defeat";
      this.showMessage("Your stronghold has fallen.");
    }
  }
}
