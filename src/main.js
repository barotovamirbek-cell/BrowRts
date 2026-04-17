import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { MenuScene } from "./scenes/MenuScene.js";

const config = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#120f0b",
  width: window.innerWidth,
  height: window.innerHeight,
  scene: [BootScene, MenuScene, GameScene],
  render: {
    pixelArt: false,
    antialias: true
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

new Phaser.Game(config);
