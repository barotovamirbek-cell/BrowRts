export const FACTION_DEFS = {
  kingdom: {
    key: "kingdom",
    name: "Kingdom",
    motto: "Balanced steel and order",
    color: 0xc8b27d,
    ui: "#f4ddb3",
    unitTints: {
      worker: 0xd9d2c4,
      swordsman: 0xc15f4f,
      archer: 0x6288bf
    },
    modifiers: {
      gatherRate: 1,
      moveSpeed: 1,
      meleeDamage: 1,
      rangedDamage: 1,
      buildSpeed: 1
    }
  },
  wildkin: {
    key: "wildkin",
    name: "Wildkin",
    motto: "Fast forests and lean skirmishers",
    color: 0x6caa66,
    ui: "#d8f0b6",
    unitTints: {
      worker: 0xa8cf97,
      swordsman: 0x8c5e39,
      archer: 0x7cbf57
    },
    modifiers: {
      gatherRate: 1.15,
      moveSpeed: 1.12,
      meleeDamage: 0.94,
      rangedDamage: 1.05,
      buildSpeed: 1.05
    }
  },
  dusk: {
    key: "dusk",
    name: "Dusk Legion",
    motto: "Hard-hitting heavy infantry",
    color: 0x7b6fc8,
    ui: "#d6cdfa",
    unitTints: {
      worker: 0xbcb1e6,
      swordsman: 0x8b3f76,
      archer: 0x6b6fe1
    },
    modifiers: {
      gatherRate: 0.95,
      moveSpeed: 0.96,
      meleeDamage: 1.16,
      rangedDamage: 1,
      buildSpeed: 0.96
    }
  },
  ember: {
    key: "ember",
    name: "Ember Court",
    motto: "Aggressive ranged firepower",
    color: 0xd9773d,
    ui: "#ffd2a8",
    unitTints: {
      worker: 0xf0bf9c,
      swordsman: 0xcf643c,
      archer: 0xe39f4c
    },
    modifiers: {
      gatherRate: 0.98,
      moveSpeed: 1,
      meleeDamage: 1,
      rangedDamage: 1.18,
      buildSpeed: 1
    }
  }
};

export const FACTION_ORDER = ["kingdom", "wildkin", "dusk", "ember"];
