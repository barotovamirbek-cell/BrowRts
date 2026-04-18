import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    this.load.spritesheet("tinyDungeonTiles", "assets/kenney/tiny-dungeon/Tilemap/tilemap_packed.png", {
      frameWidth: 16,
      frameHeight: 16
    });
    this.load.spritesheet("tinyBattleTiles", "assets/kenney/tiny-battle/Tilemap/tilemap_packed.png", {
      frameWidth: 16,
      frameHeight: 16
    });
  }

  create() {
    this.createTextures();
    this.scene.start("menu");
  }

  createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    this.createTreeTexture(graphics, "forest-tree-a", {
      canopy: 0x5f8f47,
      canopyDark: 0x456937,
      trunk: 0x5a3823,
      width: 42,
      height: 58,
      canopyOffset: 0
    });
    this.createTreeTexture(graphics, "forest-tree-b", {
      canopy: 0x729a51,
      canopyDark: 0x4f6f3a,
      trunk: 0x68412a,
      width: 44,
      height: 60,
      canopyOffset: 4
    });
    this.createTreeTexture(graphics, "forest-tree-c", {
      canopy: 0x6e9856,
      canopyDark: 0x4a6d3d,
      trunk: 0x6b4427,
      width: 40,
      height: 56,
      canopyOffset: -4
    });

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(28, 28, 20);
    graphics.fillCircle(16, 30, 12);
    graphics.fillCircle(40, 32, 12);
    graphics.generateTexture("gold-mine", 56, 56);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 3, 18, 2);
    graphics.fillTriangle(18, 4, 12, 0, 12, 8);
    graphics.generateTexture("projectile-arrow", 20, 8);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    for (let i = 0; i < 7; i += 1) {
      const angle = (Math.PI * 2 * i) / 7;
      graphics.fillTriangle(
        20,
        20,
        20 + Math.cos(angle - 0.16) * 6,
        20 + Math.sin(angle - 0.16) * 6,
        20 + Math.cos(angle) * 18,
        20 + Math.sin(angle) * 18
      );
    }
    graphics.generateTexture("hit-spark", 40, 40);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(20, 20, 12);
    graphics.fillCircle(12, 18, 9);
    graphics.fillCircle(28, 18, 9);
    graphics.fillCircle(20, 28, 10);
    graphics.generateTexture("dust-puff", 40, 40);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillEllipse(24, 8, 40, 10);
    graphics.generateTexture("shadow-oval", 48, 16);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture("projectile", 8, 8);
    graphics.clear();
  }

  createTreeTexture(graphics, key, options) {
    const { canopy, canopyDark, trunk, width, height, canopyOffset } = options;
    const trunkWidth = Math.max(8, Math.floor(width * 0.22));
    const trunkX = Math.floor((width - trunkWidth) / 2);
    const trunkTop = Math.floor(height * 0.42);

    graphics.clear();
    graphics.fillStyle(trunk, 1);
    graphics.fillRect(trunkX, trunkTop, trunkWidth, height - trunkTop);
    graphics.fillStyle(canopyDark, 1);
    graphics.fillTriangle(width / 2, 2, 8 + canopyOffset, Math.floor(height * 0.55), width - 8 + canopyOffset, Math.floor(height * 0.55));
    graphics.fillTriangle(width / 2, 10, 4 + canopyOffset, Math.floor(height * 0.42), width - 4 + canopyOffset, Math.floor(height * 0.42));
    graphics.fillStyle(canopy, 1);
    graphics.fillTriangle(width / 2, 0, 10 + canopyOffset, Math.floor(height * 0.5), width - 10 + canopyOffset, Math.floor(height * 0.5));
    graphics.fillTriangle(width / 2, 8, 6 + canopyOffset, Math.floor(height * 0.36), width - 6 + canopyOffset, Math.floor(height * 0.36));
    graphics.fillCircle(Math.floor(width * 0.5), Math.floor(height * 0.24), Math.floor(width * 0.14));
    graphics.generateTexture(key, width, height);
    graphics.clear();
  }
}
