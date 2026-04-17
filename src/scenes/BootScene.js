import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create() {
    this.createTextures();
    this.scene.start("game");
  }

  createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(16, 16, 14);
    graphics.lineStyle(2, 0x000000, 0.35);
    graphics.strokeCircle(16, 16, 14);
    graphics.generateTexture("unit-circle", 32, 32);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 0, 80, 80);
    graphics.lineStyle(4, 0x000000, 0.28);
    graphics.strokeRect(0, 0, 80, 80);
    graphics.generateTexture("building-square", 80, 80);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 0, 34, 52);
    graphics.fillStyle(0x000000, 0.18);
    graphics.fillRect(4, 8, 26, 42);
    graphics.generateTexture("tree", 34, 52);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(20, 20, 18);
    graphics.fillStyle(0x000000, 0.18);
    graphics.fillCircle(25, 15, 8);
    graphics.generateTexture("gold-mine", 40, 40);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture("projectile", 8, 8);
    graphics.clear();
  }
}
