import Phaser from "phaser";

const DESIGN_W = 480;
const DESIGN_H = 720;

//  Win requirements
const HEARTS_TO_WIN = 34;
const BALLS_TO_WIN = 5;

const STORAGE_KEY = "love_lap_best_total";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function createGame({ parent, onHud, selectedCarUrl, onExitToMenu }) {
  class MainScene extends Phaser.Scene {
    constructor() {
      super("main");

      this.heartsCollected = 0;
      this.ballsCollected = 0;
      this.best = 0;

      this.dead = false;
      this.finished = false;

      this.lanes = [];
      this.laneIndex = 1;

      this.road = null;
      this.player = null;
      this.playerPlate = null;

      this.enemies = null;
      this.hearts = null;
      this.cones = null;
      this.balls = null;

      this.roadSpeed = 280;
      this.spawnTimer = 0;
      this.heartTimer = 0;

      this.ballTimer = 0;
      this.nextBallIn = this.pickNextBallTime();

      this.msg = null;
      this.particles = null;

      this._onKeyDown = null;

      this.swipe = { startX: null, startY: null, startTime: null, lastLaneMoveTime: 0 };
      this.SWIPE_MIN_DISTANCE = 55;
      this.SWIPE_MAX_TIME = 420;
      this.SWIPE_DIRECTION_RATIO = 1.35;
      this.SWIPE_COOLDOWN_MS = 140;

      this._pressTimer = null;
      this.LONG_PRESS_MS = 650;
      this._longPressTriggered = false;

      this.mobileControls = null;
    }

    pickNextBallTime() {
      return Phaser.Math.Between(5, 10);
    }

    preload() {
      this.load.on("loaderror", (file) => {
        console.error("❌ Phaser load error:", file?.key, file?.src);
      });

      this.load.image("playerCarImg", selectedCarUrl);

      this.makeRoadTexture("road");
      this.makePixelHeartTexture("heart");
      this.makeBasketballTexture("basketball");
      this.makeNeonCarTexture("enemyCar", 0xff4fd8, 0x27f7ff);
      this.makeNeonConeTexture("cone", 0xffe66d, 0xff4fd8);
      this.makeFallbackCarTexture("fallbackCar");
    }

    create() {
      this.heartsCollected = 0;
      this.ballsCollected = 0;
      this.dead = false;
      this.finished = false;

      this.roadSpeed = 280;
      this.spawnTimer = 0;
      this.heartTimer = 0;

      this.ballTimer = 0;
      this.nextBallIn = this.pickNextBallTime();

      this.best = Number(localStorage.getItem(STORAGE_KEY) || "0");
      this.pushHud();

      this.road = this.add.tileSprite(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, "road");

      this.lanes = [DESIGN_W * 0.25, DESIGN_W * 0.5, DESIGN_W * 0.75];
      this.laneIndex = 1;

      const hasImg =
        this.textures.exists("playerCarImg") &&
        this.textures.get("playerCarImg")?.getSourceImage?.();

      const playerKey = hasImg ? "playerCarImg" : "fallbackCar";

      this.player = this.physics.add.sprite(this.lanes[this.laneIndex], DESIGN_H * 0.82, playerKey);
      this.player.setCollideWorldBounds(true);
      this.player.setDepth(10);

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

      this.playerPlate = this.add.ellipse(this.player.x, this.player.y + 22, 110, 52, 0x27f7ff, 0.10);
      this.playerPlate.setBlendMode(Phaser.BlendModes.ADD);
      this.playerPlate.setDepth(9);

      this.enemies = this.physics.add.group();
      this.hearts = this.physics.add.group();
      this.cones = this.physics.add.group();
      this.balls = this.physics.add.group();

      this.physics.add.overlap(this.player, this.hearts, (_, heart) => {
        if (this.dead || this.finished) return;
        heart.destroy();
        this.collectHeart();
      });

      this.physics.add.overlap(this.player, this.balls, (_, ball) => {
        if (this.dead || this.finished) return;
        ball.destroy();
        this.collectBall();
      });

      this.physics.add.overlap(this.player, this.enemies, () => this.crash(), null, this);
      this.physics.add.overlap(this.player, this.cones, () => this.crash(), null, this);

      this.msg = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2, "", { fontSize: "22px", color: "#ffffff", align: "center" })
        .setOrigin(0.5)
        .setDepth(999);

      this.particles = this.add.particles(0, 0, "heart", {
        speed: { min: 40, max: 110 },
        scale: { start: 0.55, end: 0 },
        lifespan: 520,
        quantity: 1,
        frequency: -1,
        blendMode: Phaser.BlendModes.ADD,
      });

      if (this.isTouchDevice()) this.createMobileArrows();

      // Keyboard
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

        if (isLeft || isRight || isSpace || isR) e.preventDefault();

        if (isSpace) return onExitToMenu?.();
        if (isR) return this.scene.restart();

        if (!this.dead && !this.finished) {
          if (isLeft) this.moveLane(-1);
          if (isRight) this.moveLane(1);
        }
      };

      window.addEventListener("keydown", this._onKeyDown, { passive: false, capture: true });

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (this._onKeyDown) window.removeEventListener("keydown", this._onKeyDown, { capture: true });
        this._onKeyDown = null;

        if (this.mobileControls) {
          this.mobileControls.destroy(true);
          this.mobileControls = null;
        }
      });

      // Touch
      this.input.on("pointerdown", (pointer) => {
        this.swipe.startX = pointer.x;
        this.swipe.startY = pointer.y;
        this.swipe.startTime = performance.now();

        if (this.dead || this.finished) {
          this._longPressTriggered = false;
          if (this._pressTimer) clearTimeout(this._pressTimer);

          this._pressTimer = setTimeout(() => {
            this._longPressTriggered = true;
            onExitToMenu?.();
          }, this.LONG_PRESS_MS);
        }
      });

      this.input.on("pointerup", (pointer) => {
        if (this.dead || this.finished) {
          if (this._pressTimer) clearTimeout(this._pressTimer);
          if (this._longPressTriggered) return;
          this.scene.restart();
          return;
        }

        if (this.swipe.startX == null || this.swipe.startY == null || this.swipe.startTime == null) return;

        const dt = performance.now() - this.swipe.startTime;
        const dx = pointer.x - this.swipe.startX;
        const dy = pointer.y - this.swipe.startY;

        this.swipe.startX = null;
        this.swipe.startY = null;
        this.swipe.startTime = null;

        if (dt > this.SWIPE_MAX_TIME) return;
        if (Math.abs(dx) < this.SWIPE_MIN_DISTANCE) return;
        if (Math.abs(dx) < Math.abs(dy) * this.SWIPE_DIRECTION_RATIO) return;

        const now = performance.now();
        if (now - this.swipe.lastLaneMoveTime < this.SWIPE_COOLDOWN_MS) return;
        this.swipe.lastLaneMoveTime = now;

        if (dx < 0) this.moveLane(-1);
        else this.moveLane(1);
      });
    }

    pushHud() {
      // best = best total collected
      const total = this.heartsCollected + this.ballsCollected;
      if (total > this.best) {
        this.best = total;
        localStorage.setItem(STORAGE_KEY, String(this.best));
      }

      onHud?.({
        hearts: this.heartsCollected,
        balls: this.ballsCollected,
        best: this.best,
        statusLabel: this.getStatusLabel(),
      });
    }

    getStatusLabel() {
      return `💙 ${this.heartsCollected}/${HEARTS_TO_WIN} • 🏀 ${this.ballsCollected}/${BALLS_TO_WIN}`;
    }

    isTouchDevice() {
      const dev = this.sys.game.device;
      return !!dev?.input?.touch;
    }

    createMobileArrows() {
      this.mobileControls = this.add.container(0, 0);
      this.mobileControls.setDepth(2000);

      const y = DESIGN_H - 86;
      const leftX = 78;
      const rightX = DESIGN_W - 78;

      const makeBtn = (x, label, onPress) => {
        const circle = this.add.circle(x, y, 46, 0x27f7ff, 0.10);
        circle.setStrokeStyle(2, 0xff4fd8, 0.55);
        circle.setBlendMode(Phaser.BlendModes.ADD);

        const txt = this.add.text(x, y, label, {
          fontSize: "28px",
          color: "#ffffff",
          fontStyle: "700",
        });
        txt.setOrigin(0.5);
        txt.setShadow(0, 0, "#27f7ff", 12, true, true);

        circle.setInteractive({ useHandCursor: true });
        circle.on("pointerdown", (p) => {
          this.swipe.startX = null;
          this.swipe.startY = null;
          this.swipe.startTime = null;

          if (!this.dead && !this.finished) onPress();
          p.event?.stopPropagation?.();
        });

        this.mobileControls.add([circle, txt]);
      };

      makeBtn(leftX, "◀", () => this.moveLane(-1));
      makeBtn(rightX, "▶", () => this.moveLane(1));

      const hint = this.add.text(DESIGN_W / 2, DESIGN_H - 24, "Tap arrows (swipe optional)", {
        fontSize: "12px",
        color: "rgba(255,255,255,0.70)",
      });
      hint.setOrigin(0.5);
      this.mobileControls.add(hint);
    }

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

      this.road.tilePositionY -= this.roadSpeed * dt;

      if (this.playerPlate) {
        this.playerPlate.x = this.player.x;
        this.playerPlate.y = this.player.y + 22;
      }

      if (this.dead || this.finished) return;

      this.roadSpeed += 8 * dt;

      // Obstacles
      this.spawnTimer += dt;
      const spawnEvery = clamp(0.78 - this.heartsCollected * 0.01, 0.32, 0.78);

      if (this.spawnTimer >= spawnEvery) {
        this.spawnTimer = 0;
        const laneX = Phaser.Utils.Array.GetRandom(this.lanes);
        if (Math.random() < 0.72) this.spawnEnemy(laneX);
        else this.spawnCone(laneX);
      }

      // Hearts
      this.heartTimer += dt;
      if (this.heartTimer >= 0.75) {
        this.heartTimer = 0;
        const laneX = Phaser.Utils.Array.GetRandom(this.lanes);
        this.spawnHeart(laneX);
      }

      // Basketballs
      this.ballTimer += dt;
      if (this.ballTimer >= this.nextBallIn) {
        this.ballTimer = 0;
        this.nextBallIn = this.pickNextBallTime();

        if (Math.random() < 0.6) {
          const laneX = Phaser.Utils.Array.GetRandom(this.lanes);
          this.spawnBasketball(laneX);
        }
      }

      this.cleanup(this.enemies);
      this.cleanup(this.cones);
      this.cleanup(this.hearts);
      this.cleanup(this.balls);
    }

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

    spawnBasketball(x) {
      const s = this.balls.create(x, -50, "basketball");
      s.setVelocityY(this.roadSpeed + 45);
      s.setAngularVelocity(220);
      s.setBlendMode(Phaser.BlendModes.ADD);
    }

    cleanup(group) {
      group.getChildren().forEach((obj) => {
        if (obj.y > DESIGN_H + 90) obj.destroy();
      });
    }

    collectHeart() {
      this.heartsCollected += 1;
      this.particles.emitParticleAt(this.player.x, this.player.y - 18, 10);
      this.pushHud();
      this.checkWin();
    }

    collectBall() {
      this.ballsCollected += 1;
      this.particles.emitParticleAt(this.player.x, this.player.y - 18, 12);
      this.pushHud();
      this.checkWin();
    }

    checkWin() {
      const wonHearts = this.heartsCollected >= HEARTS_TO_WIN;
      const wonBalls = this.ballsCollected >= BALLS_TO_WIN;
      if (wonHearts && wonBalls) this.win();
    }

    crash() {
      if (this.dead || this.finished) return;
      this.dead = true;

      this.cameras.main.shake(120, 0.006);

      this.msg.setText(
        "CRASH! 😅\n\nMobile: Tap = restart\nHold = menu\n\nDesktop: R = restart • Space = menu"
      );

      this.enemies.setVelocityY(0);
      this.cones.setVelocityY(0);
      this.hearts.setVelocityY(0);
      this.balls.setVelocityY(0);
    }

    win() {
      if (this.finished) return;
      this.finished = true;

      this.particles.emitParticleAt(DESIGN_W / 2, DESIGN_H / 2, 90);

      this.msg.setText(
        `YOU WIN 💙\n\n💙 ${this.heartsCollected}/${HEARTS_TO_WIN}\n🏀 ${this.ballsCollected}/${BALLS_TO_WIN}\n\nMobile: Tap = play again\nHold = menu\n\nDesktop: R = restart • Space = menu`
      );

      this.enemies.setVelocityY(0);
      this.cones.setVelocityY(0);
      this.hearts.setVelocityY(0);
      this.balls.setVelocityY(0);
    }

    // -------- Textures --------

    makeRoadTexture(key) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });

      g.fillStyle(0x060813, 1);
      g.fillRect(0, 0, DESIGN_W, DESIGN_H);

      g.fillStyle(0xff4fd8, 0.10);
      g.fillRect(0, 0, DESIGN_W, 180);

      const cyan = 0x27f7ff;
      const pink = 0xff4fd8;

      g.fillStyle(cyan, 0.12);
      g.fillRect(DESIGN_W / 2 - 3, 160, 6, DESIGN_H);

      g.fillStyle(pink, 0.10);
      for (let y = 200; y < DESIGN_H; y += 70) {
        g.fillRect(DESIGN_W * 0.25 - 2, y, 4, 26);
        g.fillRect(DESIGN_W * 0.75 - 2, y, 4, 26);
      }

      g.fillStyle(cyan, 0.08);
      for (let y = 200; y < DESIGN_H; y += 44) {
        g.fillRect(0, y, DESIGN_W, 2);
      }

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

      const coords = [
        [6,4],[8,4],[10,4],[12,4],
        [4,6],[6,6],[8,6],[10,6],[12,6],[14,6],
        [4,8],[6,8],[8,8],[10,8],[12,8],[14,8],
        [6,10],[8,10],[10,10],[12,10],
        [8,12],[10,12],
        [9,14],
      ];
      coords.forEach(([x,y]) => px(x, y, pink, 1));

      px(6, 2, cyan, 0.35);
      px(12, 2, cyan, 0.35);
      px(6, 6, 0xffffff, 0.30);
      px(8, 6, 0xffffff, 0.20);

      g.generateTexture(key, w, h);
      g.destroy();
    }

    makeBasketballTexture(key) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const size = 34;
      const r = size / 2;

      g.fillStyle(0xff9b2f, 0.22);
      g.fillCircle(r, r, r);

      g.fillStyle(0xff7a18, 0.95);
      g.fillCircle(r, r, r - 3);

      g.lineStyle(2, 0x1b0e06, 0.85);
      g.strokeCircle(r, r, r - 3);

      g.beginPath();
      g.moveTo(r, 4);
      g.lineTo(r, size - 4);
      g.strokePath();

      g.beginPath();
      g.moveTo(4, r);
      g.lineTo(size - 4, r);
      g.strokePath();

      g.beginPath();
      g.arc(r - 6, r, r - 6, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(60), false);
      g.strokePath();

      g.beginPath();
      g.arc(r + 6, r, r - 6, Phaser.Math.DegToRad(120), Phaser.Math.DegToRad(240), false);
      g.strokePath();

      g.generateTexture(key, size, size);
      g.destroy();
    }

    makeNeonCarTexture(key, glow1, glow2) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const w = 52, h = 88;

      g.fillStyle(glow2, 0.20);
      g.fillRoundedRect(0, 0, w, h, 10);
      g.fillStyle(glow1, 0.22);
      g.fillRoundedRect(2, 2, w - 4, h - 4, 10);

      g.fillStyle(0x0b1020, 0.85);
      g.fillRoundedRect(6, 6, w - 12, h - 12, 10);

      g.lineStyle(2, glow2, 0.85);
      g.strokeRoundedRect(6.5, 6.5, w - 13, h - 13, 10);

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

  const config = {
    type: Phaser.AUTO,
    width: DESIGN_W,
    height: DESIGN_H,
    parent,
    physics: { default: "arcade", arcade: { debug: false } },
    scene: [MainScene],
    backgroundColor: "#0b1020",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_W,
      height: DESIGN_H,
    },
  };

  return new Phaser.Game(config);
}
