export const MAP_WIDTH = 3200;
export const MAP_HEIGHT = 2200;

export const RESOURCE_TYPES = {
  gold: { color: 0xe0b84b, label: "Gold" },
  wood: { color: 0x4c9a57, label: "Wood" }
};

export const UNIT_DEFS = {
  worker: {
    label: "Worker",
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
    label: "Swordsman",
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
    label: "Archer",
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
  }
};

export const BUILDING_DEFS = {
  townhall: {
    label: "Town Hall",
    maxHp: 900,
    size: 84,
    cost: null,
    canTrain: ["worker"],
    supplyProvided: 6,
    buildTime: 0,
    color: 0x8a6a49
  },
  farm: {
    label: "Farm",
    maxHp: 240,
    size: 54,
    cost: { gold: 40, wood: 60 },
    supplyProvided: 5,
    buildTime: 6000,
    color: 0xc6a867
  },
  barracks: {
    label: "Barracks",
    maxHp: 520,
    size: 72,
    cost: { gold: 130, wood: 95 },
    canTrain: ["swordsman", "archer"],
    buildTime: 8200,
    color: 0x7d5d44
  },
  tower: {
    label: "Tower",
    maxHp: 320,
    size: 48,
    cost: { gold: 90, wood: 110 },
    damage: 16,
    range: 220,
    attackCooldown: 1200,
    buildTime: 7600,
    color: 0x9d8f81
  }
};

export const BUILD_OPTIONS = ["farm", "barracks", "tower"];
