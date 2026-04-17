import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create() {
    this.createTextures();
    this.scene.start("menu");
  }

  createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(16, 12, 6);
    graphics.fillRoundedRect(10, 18, 12, 12, 3);
    graphics.fillRect(8, 28, 6, 12);
    graphics.fillRect(18, 28, 6, 12);
    graphics.fillRect(6, 20, 6, 12);
    graphics.fillRect(20, 20, 6, 12);
    graphics.generateTexture("unit-worker", 32, 44);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(16, 10, 6);
    graphics.fillStyle(0xe2e2e2, 1);
    graphics.fillRoundedRect(9, 16, 14, 14, 4);
    graphics.fillRect(9, 28, 6, 14);
    graphics.fillRect(17, 28, 6, 14);
    graphics.fillRect(5, 19, 5, 13);
    graphics.fillRect(22, 19, 5, 13);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(25, 19, 3, 16);
    graphics.generateTexture("unit-swordsman", 32, 44);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(16, 10, 6);
    graphics.fillRoundedRect(10, 17, 12, 13, 4);
    graphics.fillRect(10, 28, 5, 14);
    graphics.fillRect(17, 28, 5, 14);
    graphics.fillRect(6, 20, 5, 11);
    graphics.fillRect(21, 20, 5, 11);
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.beginPath();
    graphics.moveTo(23, 18);
    graphics.lineTo(29, 11);
    graphics.lineTo(29, 29);
    graphics.closePath();
    graphics.strokePath();
    graphics.generateTexture("unit-archer", 36, 44);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(8, 18, 64, 50, 5);
    graphics.fillTriangle(4, 22, 40, 0, 76, 22);
    graphics.fillRect(28, 40, 16, 28);
    graphics.fillRect(14, 30, 10, 10);
    graphics.fillRect(56, 30, 10, 10);
    graphics.generateTexture("building-townhall", 80, 72);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(10, 28, 60, 36, 5);
    graphics.fillTriangle(6, 30, 40, 10, 74, 30);
    graphics.fillRect(18, 42, 10, 22);
    graphics.fillRect(50, 42, 10, 22);
    graphics.generateTexture("building-barracks", 80, 70);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(16, 28, 48, 30, 4);
    graphics.fillTriangle(12, 30, 40, 14, 68, 30);
    graphics.fillRect(34, 38, 12, 20);
    graphics.generateTexture("building-farm", 80, 62);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(26, 10, 28, 54);
    graphics.fillRect(20, 20, 40, 12);
    graphics.fillRect(16, 52, 48, 12);
    graphics.generateTexture("building-tower", 80, 72);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(14, 20, 10, 24);
    graphics.fillCircle(18, 16, 12);
    graphics.fillCircle(10, 22, 9);
    graphics.fillCircle(26, 22, 9);
    graphics.generateTexture("tree", 34, 52);
    graphics.clear();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(28, 28, 22);
    graphics.fillCircle(16, 30, 14);
    graphics.fillCircle(40, 32, 14);
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
