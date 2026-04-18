export const MAP_WIDTH = 3200;
export const MAP_HEIGHT = 2200;

export const RESOURCE_TYPES = {
  gold: { color: 0xe0b84b, label: "Золото" },
  wood: { color: 0x4c9a57, label: "Дерево" }
};

export const UNIT_DEFS = {
  worker: {
    label: "Рабочий",
    maxHp: 50,
    damage: 5,
    range: 18,
    speed: 86,
    attackCooldown: 850,
    radius: 12,
    cost: { gold: 55, wood: 0, supply: 1 },
    trainTime: 5200,
    harvestRate: 12,
    carryLimit: 60,
    canBuild: true,
    color: 0xd7d3c8
  },
  swordsman: {
    label: "Мечник",
    maxHp: 100,
    damage: 15,
    range: 20,
    speed: 78,
    attackCooldown: 900,
    radius: 13,
    cost: { gold: 95, wood: 20, supply: 2 },
    trainTime: 6800,
    color: 0xbf4f3d
  },
  archer: {
    label: "Лучник",
    maxHp: 70,
    damage: 12,
    range: 165,
    speed: 82,
    attackCooldown: 1100,
    radius: 12,
    projectileSpeed: 330,
    cost: { gold: 90, wood: 45, supply: 2 },
    trainTime: 7200,
    color: 0x5f8cc4
  },
  knight: {
    label: "Рыцарь",
    maxHp: 150,
    damage: 24,
    range: 22,
    speed: 74,
    attackCooldown: 980,
    radius: 14,
    cost: { gold: 150, wood: 50, supply: 3 },
    trainTime: 9800,
    color: 0xb8c4cf
  },
  hunter: {
    label: "Следопыт",
    maxHp: 88,
    damage: 18,
    range: 210,
    speed: 92,
    attackCooldown: 950,
    radius: 12,
    projectileSpeed: 390,
    cost: { gold: 120, wood: 75, supply: 2 },
    trainTime: 8600,
    color: 0x78b163
  },
  hero: {
    label: "Герой",
    maxHp: 280,
    damage: 30,
    range: 110,
    speed: 88,
    attackCooldown: 820,
    radius: 15,
    projectileSpeed: 460,
    cost: { gold: 240, wood: 120, supply: 4 },
    trainTime: 13500,
    hero: true,
    color: 0xf2d78b
  }
};

export const BUILDING_DEFS = {
  townhall: {
    label: "Ратуша",
    maxHp: 900,
    size: 84,
    cost: null,
    canTrain: ["worker"],
    supplyProvided: 6,
    buildTime: 0,
    color: 0x8a6a49
  },
  farm: {
    label: "Ферма",
    maxHp: 240,
    size: 54,
    cost: { gold: 40, wood: 60 },
    supplyProvided: 5,
    buildTime: 6000,
    color: 0xc6a867
  },
  barracks: {
    label: "Казармы",
    maxHp: 520,
    size: 72,
    cost: { gold: 130, wood: 95 },
    canTrain: ["swordsman", "archer"],
    buildTime: 8200,
    color: 0x7d5d44
  },
  tower: {
    label: "Башня",
    maxHp: 320,
    size: 48,
    cost: { gold: 90, wood: 110 },
    damage: 16,
    range: 220,
    attackCooldown: 1200,
    buildTime: 7600,
    color: 0x9d8f81
  },
  forge: {
    label: "Кузница",
    maxHp: 560,
    size: 70,
    cost: { gold: 170, wood: 125 },
    canTrain: ["knight", "hunter"],
    buildTime: 9800,
    color: 0x9a7e58
  },
  herohall: {
    label: "Зал героев",
    maxHp: 640,
    size: 76,
    cost: { gold: 210, wood: 150 },
    canTrain: ["hero"],
    buildTime: 11500,
    color: 0xb89d6d
  }
};

export const BUILD_OPTIONS = ["farm", "barracks", "tower", "forge", "herohall"];
