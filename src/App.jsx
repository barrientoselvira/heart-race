import { useEffect, useRef, useState } from "react";
import { createGame } from "./game/createGame";

import s13Url from "./assets/cars/s13.png";
import s14Url from "./assets/cars/s14.png";
import s15Url from "./assets/cars/s15.png";

const GAME_TITLE = "The Highway Heart Heist";

const CARS = [
  { id: "s13", name: "Nissan Silvia S13", img: s13Url },
  { id: "s14", name: "Nissan Silvia S14", img: s14Url },
  { id: "s15", name: "Nissan Silvia S15", img: s15Url },
];

export default function App() {
  const phaserRef = useRef(null);
  const gameRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [selectedCarId, setSelectedCarId] = useState("s14");

  // HUD
  const [hearts, setHearts] = useState(0);
  const [balls, setBalls] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("love_lap_best_total") || "0"));
  const [statusLabel, setStatusLabel] = useState("💗 0/10 • 🏀 0/5");

  useEffect(() => {
    document.body.classList.toggle("game-running", started);
    return () => document.body.classList.remove("game-running");
  }, [started]);

  useEffect(() => {
    if (!started) return;
    if (!phaserRef.current) return;

    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    phaserRef.current.innerHTML = "";

    const selectedCarUrl = CARS.find((c) => c.id === selectedCarId)?.img ?? s14Url;

    gameRef.current = createGame({
      parent: phaserRef.current,
      selectedCarUrl,
      onHud: ({ hearts: h, balls: b, best: bestVal, statusLabel: label }) => {
        if (typeof h === "number") setHearts(h);
        if (typeof b === "number") setBalls(b);
        if (typeof bestVal === "number") setBest(bestVal);
        if (typeof label === "string") setStatusLabel(label);
      },
      onExitToMenu: () => {
        if (gameRef.current) {
          gameRef.current.destroy(true);
          gameRef.current = null;
        }
        if (phaserRef.current) phaserRef.current.innerHTML = "";
        setStarted(false);
      },
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [started, selectedCarId]);

  if (!started) {
    return (
      <div className="wrap">
        <div className="welcome">
          <div className="welcomeCard">
            <h1>{GAME_TITLE} 💙</h1>
            <p>
              Win by collecting <strong>34 💗 hearts</strong> AND <strong>5 🏀 basketballs</strong>.
            </p>

            <div className="carGrid">
              {CARS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`carChoice ${selectedCarId === c.id ? "active" : ""}`}
                  onClick={() => setSelectedCarId(c.id)}
                >
                  <img src={c.img} alt={c.name} />
                  <div className="carMeta">
                    <div className="carName">{c.name}</div>
                    <div className="carHint">Click to select</div>
                  </div>
                </button>
              ))}
            </div>

            <button className="startBtn" type="button" onClick={() => setStarted(true)}>
              Start 💙
            </button>

            <div className="smallHint">
              Desktop: ← → or A/D • Space = Menu • R = Restart
              <br />
              Mobile: tap ◀ ▶ • (Swipe optional)
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap gameLayout">
      <div className="topbar">
        <div className="title">
          <h1>{GAME_TITLE} 💙</h1>
          <p>{statusLabel} • Space = Menu • R = Restart</p>
        </div>

        <div className="hud">
          <div className="pill">
            <strong>💗</strong>: {hearts}
          </div>
          <div className="pill">
            <strong>🏀</strong>: {balls}
          </div>
          <div className="pill">
            <strong>Best</strong>: {best}
          </div>
        </div>
      </div>

      <div className="gameShell">
        <div id="phaser-root" ref={phaserRef} />
      </div>

      <div className="footer">Happy Valentine’s Day 💙 Love, Elvira</div>
    </div>
  );
}
