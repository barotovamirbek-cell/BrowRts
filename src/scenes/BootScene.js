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

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(12, 16, 10, 28);
    graphics.fillCircle(17, 12, 12);
    graphics.fillCircle(9, 20, 8);
    graphics.fillCircle(26, 20, 8);
    graphics.generateTexture("tree", 34, 52);
    graphics.clear();

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
}
