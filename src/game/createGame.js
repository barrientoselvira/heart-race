import Phaser from "phaser";

/**
 * We build the game at a "design size" (like a fixed canvas),
 * then Phaser scales it to fit the screen.
 */
const DESIGN_W = 480;
const DESIGN_H = 720;

/** Game rules */
const HEARTS_TO_WIN = 33;
const STORAGE_KEY = "love_lap_best";

/** Helper: keep values inside a min/max range */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * createGame()
 * React calls this when you press Start.
 * parent: the div we mount the Phaser canvas into
 * selectedCarUrl: image URL for the chosen car
 * onHud: callback to update React UI (hearts, best, label)
 * onExitToMenu: callback to return to React start screen (Space)
 */
export function createGame({ parent, onHud, selectedCarUrl, onExitToMenu }) {
  class MainScene extends Phaser.Scene {
    constructor() {
      super("main");

      // ---- game state
      this.score = 0;
      this.best = 0;
      this.dead = false;
      this.finished = false;

      // ---- movement & lanes (3 lanes)
      this.lanes = [];
      this.laneIndex = 1; // start in middle lane

      // ---- objects
      this.road = null;
      this.player = null;
      this.playerPlate = null;

      // ---- groups (collections of things)
      this.enemies = null;
      this.hearts = null;
      this.cones = null;

      // ---- timing / difficulty
      this.roadSpeed = 280;
      this.spawnTimer = 0;
      this.heartTimer = 0;

      // ---- UI
      this.msg = null;
      this.particles = null;

      // ---- keyboard listener reference (so we can remove it cleanly)
      this._onKeyDown = null;

      // ---- SWIPE state
      this.swipeStartX = null;
      this.swipeStartY = null;
      this.SWIPE_MIN_DISTANCE = 40; // pixels (tune if needed)
    }

    preload() {
      // If an image fails to load, log it (helps debugging)
      this.load.on("loaderror", (file) => {
        console.error("❌ Phaser load error:", file?.key, file?.src);
      });

      // Load the chosen car image
      this.load.image("playerCarImg", selectedCarUrl);

      // Create simple retro textures (no external assets needed)
      this.makeRoadTexture("road");
      this.makePixelHeartTexture("heart");
      this.makeNeonCarTexture("enemyCar", 0xff4fd8, 0x27f7ff);
      this.makeNeonConeTexture("cone", 0xffe66d, 0xff4fd8);
      this.makeFallbackCarTexture("fallbackCar");
    }

    create() {
      // ✅ Reset state here (Phaser restart does not rerun constructor)
      this.score = 0;
      this.dead = false;
      this.finished = false;

      this.roadSpeed = 280;
      this.spawnTimer = 0;
      this.heartTimer = 0;

      this.best = Number(localStorage.getItem(STORAGE_KEY) || "0");
      onHud?.({ score: this.score, best: this.best, lapLabel: this.getHudLabel() });

      // Road background
      this.road = this.add.tileSprite(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, "road");

      // Define 3 lanes across the screen
      this.lanes = [DESIGN_W * 0.25, DESIGN_W * 0.5, DESIGN_W * 0.75];
      this.laneIndex = 1;

      // Player: if the chosen image exists, use it, otherwise fallback
      const hasImg =
        this.textures.exists("playerCarImg") &&
        this.textures.get("playerCarImg")?.getSourceImage?.();

      const playerKey = hasImg ? "playerCarImg" : "fallbackCar";

      this.player = this.physics.add.sprite(this.lanes[this.laneIndex], DESIGN_H * 0.82, playerKey);
      this.player.setCollideWorldBounds(true);
      this.player.setDepth(10);

      // Scale the player to a consistent height
      if (playerKey === "playerCarImg") {
        const img = this.textures.get("playerCarImg")?.getSourceImage?.();
        if (img?.height) {
          const targetH = 96;
          this.player.setScale(targetH / img.height);
        } else {
          this.player.setDisplaySize(58, 96);
        }
      } else {
        this.player.setDisplaySize(58, 96);
      }

      // A subtle glow plate under the car (visual polish)
      this.playerPlate = this.add.ellipse(this.player.x, this.player.y + 22, 110, 52, 0x27f7ff, 0.10);
      this.playerPlate.setBlendMode(Phaser.BlendModes.ADD);
      this.playerPlate.setDepth(9);

      // Create groups
      this.enemies = this.physics.add.group();
      this.hearts = this.physics.add.group();
      this.cones = this.physics.add.group();

      // Collisions / overlaps:
      // Hearts: collect them
      this.physics.add.overlap(this.player, this.hearts, (_, heart) => {
        if (this.dead || this.finished) return;
        heart.destroy();
        this.addScore(1);
      });

      // Enemy cars or cones: crash
      this.physics.add.overlap(this.player, this.enemies, () => this.crash(), null, this);
      this.physics.add.overlap(this.player, this.cones, () => this.crash(), null, this);

      // Message text overlay (for crash/win)
      this.msg = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2, "", {
          fontSize: "22px",
          color: "#ffffff",
          align: "center",
        })
        .setOrigin(0.5)
        .setDepth(999);

      // Particles using the heart texture
      this.particles = this.add.particles(0, 0, "heart", {
        speed: { min: 40, max: 115 },
        scale: { start: 0.75, end: 0 },
        lifespan: 520,
        quantity: 1,
        frequency: -1,
        blendMode: Phaser.BlendModes.ADD,
      });

      // ----------------------------
      // ✅ Keyboard controls (Arrow/A/D)
      // Space = menu, R = restart
      // ----------------------------

      // Remove old listener if scene restarted
      if (this._onKeyDown) {
        window.removeEventListener("keydown", this._onKeyDown, { capture: true });
        this._onKeyDown = null;
      }

      this._onKeyDown = (e) => {
        const key = e.key;
        const code = e.code;

        const isLeft = code === "ArrowLeft" || code === "KeyA" || key === "a" || key === "A";
        const isRight = code === "ArrowRight" || code === "KeyD" || key === "d" || key === "D";
        const isSpace = code === "Space" || key === " " || key === "Spacebar";
        const isR = code === "KeyR" || key === "r" || key === "R";

        // stop page from scrolling when you press these keys
        if (isLeft || isRight || isSpace || isR) e.preventDefault();

        // Space always returns to menu (React screen)
        if (isSpace) {
          onExitToMenu?.();
          return;
        }

        // R restarts the game instantly
        if (isR) {
          this.scene.restart();
          return;
        }

        // Move lanes only if game is active
        if (!this.dead && !this.finished) {
          if (isLeft) this.moveLane(-1);
          if (isRight) this.moveLane(1);
        }
      };

      // capture:true makes it more reliable if other handlers exist
      window.addEventListener("keydown", this._onKeyDown, { passive: false, capture: true });

      // Cleanup keyboard listener
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (this._onKeyDown) window.removeEventListener("keydown", this._onKeyDown, { capture: true });
        this._onKeyDown = null;
      });

      // ----------------------------
      // ✅ Swipe controls (mobile)
      // ----------------------------
      // We'll detect horizontal swipes. Vertical swipes are ignored.
      // This does NOT block scrolling globally because we keep the page locked during gameplay via CSS.
      this.input.on("pointerdown", (pointer) => {
        this.swipeStartX = pointer.x;
        this.swipeStartY = pointer.y;
      });

      this.input.on("pointerup", (pointer) => {
        if (this.dead || this.finished) return;
        if (this.swipeStartX == null || this.swipeStartY == null) return;

        const dx = pointer.x - this.swipeStartX;
        const dy = pointer.y - this.swipeStartY;

        // Only treat it as swipe if horizontal motion is large enough
        // AND more horizontal than vertical (prevents accidental triggers)
        if (Math.abs(dx) >= this.SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) this.moveLane(-1); // swiped left
          else this.moveLane(1);         // swiped right
        }

        this.swipeStartX = null;
        this.swipeStartY = null;
      });
    }

    // Moves the car to the next lane with a small tween (smooth movement)
    moveLane(delta) {
      if (this.dead || this.finished) return;

      const next = clamp(this.laneIndex + delta, 0, this.lanes.length - 1);
      if (next === this.laneIndex) return;

      this.laneIndex = next;

      this.tweens.add({
        targets: this.player,
        x: this.lanes[this.laneIndex],
        duration: 90,
        ease: "Sine.easeOut",
      });
    }

    update(_, dtMs) {
      const dt = dtMs / 1000;

      // Move road background down (makes it feel like driving forward)
      this.road.tilePositionY -= this.roadSpeed * dt;

      // Keep plate under player
      if (this.playerPlate) {
        this.playerPlate.x = this.player.x;
        this.playerPlate.y = this.player.y + 22;
      }

      // Stop spawning if game ended
      if (this.dead || this.finished) return;

      // Increase difficulty over time
      this.roadSpeed += 8 * dt;

      // Spawn enemy/cone
      this.spawnTimer += dt;
      const spawnEvery = clamp(0.78 - this.score * 0.01, 0.32, 0.78);

      if (this.spawnTimer >= spawnEvery) {
        this.spawnTimer = 0;

        const laneX = Phaser.Utils.Array.GetRandom(this.lanes);
        if (Math.random() < 0.72) this.spawnEnemy(laneX);
        else this.spawnCone(laneX);
      }

      // Spawn hearts
      this.heartTimer += dt;
      if (this.heartTimer >= 0.75) {
        this.heartTimer = 0;
        const laneX = Phaser.Utils.Array.GetRandom(this.lanes);
        this.spawnHeart(laneX);
      }

      // Clean up objects off screen
      this.cleanup(this.enemies);
      this.cleanup(this.cones);
      this.cleanup(this.hearts);
    }

    // HUD label we show in React
    getHudLabel() {
      return `Hearts: ${this.score} / ${HEARTS_TO_WIN}`;
    }

    // Create objects
    spawnEnemy(x) {
      const s = this.enemies.create(x, -70, "enemyCar");
      s.setVelocityY(this.roadSpeed + 80);
      s.setBlendMode(Phaser.BlendModes.ADD);
    }

    spawnCone(x) {
      const s = this.cones.create(x, -50, "cone");
      s.setVelocityY(this.roadSpeed + 60);
      s.setBlendMode(Phaser.BlendModes.ADD);
    }

    spawnHeart(x) {
      const s = this.hearts.create(x, -50, "heart");
      s.setVelocityY(this.roadSpeed + 30);
      s.setAngularVelocity(160);
      s.setBlendMode(Phaser.BlendModes.ADD);
    }

    // Remove objects that moved past bottom of the screen
    cleanup(group) {
      group.getChildren().forEach((obj) => {
        if (obj.y > DESIGN_H + 90) obj.destroy();
      });
    }

    // When we collect a heart
    addScore(n) {
      this.score += n;

      // Save best score
      if (this.score > this.best) {
        this.best = this.score;
        localStorage.setItem(STORAGE_KEY, String(this.best));
      }

      // Update React HUD
      onHud?.({ score: this.score, best: this.best, lapLabel: this.getHudLabel() });

      // Cute heart burst
      this.particles.emitParticleAt(this.player.x, this.player.y - 18, 10);

      // Win condition
      if (this.score >= HEARTS_TO_WIN) {
        this.win();
      }
    }

    crash() {
      if (this.dead || this.finished) return;
      this.dead = true;

      this.cameras.main.shake(120, 0.006);

      this.msg.setText("CRASH! 😅\n\nPress R to restart\nPress Space for menu");

      // Stop movement
      this.enemies.setVelocityY(0);
      this.cones.setVelocityY(0);
      this.hearts.setVelocityY(0);
    }

    win() {
      if (this.finished) return;
      this.finished = true;

      this.particles.emitParticleAt(DESIGN_W / 2, DESIGN_H / 2, 90);

      this.msg.setText(
        `YOU DID IT 💛\n\nYou collected ${HEARTS_TO_WIN} hearts!\n\nHappy Valentine’s Day\nLove, Elvira\n\nPress Space for menu\nPress R to play again`
      );

      // Stop movement
      this.enemies.setVelocityY(0);
      this.cones.setVelocityY(0);
      this.hearts.setVelocityY(0);
    }

    // ----------------------------
    // Retro texture generators
    // ----------------------------

    makeRoadTexture(key) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });

      // Base background
      g.fillStyle(0x060813, 1);
      g.fillRect(0, 0, DESIGN_W, DESIGN_H);

      // Neon horizon glow
      g.fillStyle(0xff4fd8, 0.10);
      g.fillRect(0, 0, DESIGN_W, 180);

      const cyan = 0x27f7ff;
      const pink = 0xff4fd8;

      // Center line
      g.fillStyle(cyan, 0.12);
      g.fillRect(DESIGN_W / 2 - 3, 160, 6, DESIGN_H);

      // Dashed lane lines
      g.fillStyle(pink, 0.10);
      for (let y = 200; y < DESIGN_H; y += 70) {
        g.fillRect(DESIGN_W * 0.25 - 2, y, 4, 26);
        g.fillRect(DESIGN_W * 0.75 - 2, y, 4, 26);
      }

      // Horizontal grid lines
      g.fillStyle(cyan, 0.08);
      for (let y = 200; y < DESIGN_H; y += 44) {
        g.fillRect(0, y, DESIGN_W, 2);
      }

      // Side rails
      g.fillStyle(pink, 0.10);
      g.fillRect(16, 180, 6, DESIGN_H);
      g.fillRect(DESIGN_W - 22, 180, 6, DESIGN_H);

      g.generateTexture(key, DESIGN_W, DESIGN_H);
      g.destroy();
    }

    makeFallbackCarTexture(key) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffe66d, 1);
      g.fillRoundedRect(0, 0, 58, 96, 10);
      g.lineStyle(3, 0x27f7ff, 0.6);
      g.strokeRoundedRect(1.5, 1.5, 55, 93, 10);
      g.fillStyle(0x0b1020, 1);
      g.fillRoundedRect(10, 14, 38, 24, 8);
      g.fillRoundedRect(10, 58, 38, 24, 8);
      g.generateTexture(key, 58, 96);
      g.destroy();
    }

    makePixelHeartTexture(key) {
      const w = 20, h = 20;
      const g = this.make.graphics({ x: 0, y: 0, add: false });

      const px = (x, y, c, a = 1) => {
        g.fillStyle(c, a);
        g.fillRect(x, y, 2, 2);
      };

      const pink = 0xff4fd8;
      const cyan = 0x27f7ff;

      // Heart body
      const coords = [
        [6,4],[8,4],[10,4],[12,4],
        [4,6],[6,6],[8,6],[10,6],[12,6],[14,6],
        [4,8],[6,8],[8,8],[10,8],[12,8],[14,8],
        [6,10],[8,10],[10,10],[12,10],
        [8,12],[10,12],
        [9,14],
      ];
      coords.forEach(([x,y]) => px(x, y, pink, 1));

      // Glow outline-ish
      px(6, 2, cyan, 0.35);
      px(12, 2, cyan, 0.35);

      // Highlight
      px(6, 6, 0xffffff, 0.30);
      px(8, 6, 0xffffff, 0.20);

      g.generateTexture(key, w, h);
      g.destroy();
    }

    makeNeonCarTexture(key, glow1, glow2) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const w = 52, h = 88;

      // Glow blocks
      g.fillStyle(glow2, 0.20);
      g.fillRoundedRect(0, 0, w, h, 10);
      g.fillStyle(glow1, 0.22);
      g.fillRoundedRect(2, 2, w - 4, h - 4, 10);

      // Body
      g.fillStyle(0x0b1020, 0.85);
      g.fillRoundedRect(6, 6, w - 12, h - 12, 10);

      // Neon outline
      g.lineStyle(2, glow2, 0.85);
      g.strokeRoundedRect(6.5, 6.5, w - 13, h - 13, 10);

      // Windows
      g.fillStyle(glow2, 0.18);
      g.fillRoundedRect(14, 18, w - 28, 18, 8);
      g.fillRoundedRect(14, 52, w - 28, 18, 8);

      g.generateTexture(key, w, h);
      g.destroy();
    }

    makeNeonConeTexture(key, glow1, glow2) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const w = 44, h = 56;

      g.fillStyle(glow2, 0.18);
      g.fillTriangle(w / 2, 0, w, h, 0, h);

      g.fillStyle(0x0b1020, 0.78);
      g.fillTriangle(w / 2, 6, w - 6, h - 4, 6, h - 4);

      g.lineStyle(2, glow1, 0.85);
      g.strokeTriangle(w / 2, 6, w - 6, h - 4, 6, h - 4);

      g.fillStyle(glow2, 0.22);
      g.fillRect(8, 34, w - 16, 6);

      g.generateTexture(key, w, h);
      g.destroy();
    }
  }

  // Phaser game configuration
  const config = {
    type: Phaser.AUTO,
    width: DESIGN_W,
    height: DESIGN_H,
    parent,
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scene: [MainScene],
    backgroundColor: "#0b1020",

    // ✅ Fit the canvas inside its parent (your gameShell) on desktop & mobile
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_W,
      height: DESIGN_H,
    },
  };

  return new Phaser.Game(config);
}
