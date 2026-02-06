import { useEffect, useRef, useState } from "react";
import { createGame } from "./game/createGame";

import s13Url from "./assets/cars/s13.png";
import s14Url from "./assets/cars/s14.png";
import s15Url from "./assets/cars/s15.png";

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

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("love_lap_best") || "0"));
  const [lap, setLap] = useState("Hearts: 0 / 10");

  // ✅ prevent scrolling only while game is running
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
      onHud: ({ score: newScore, best: newBest, lapLabel }) => {
        if (typeof newScore === "number") setScore(newScore);
        if (typeof newBest === "number") setBest(newBest);
        if (typeof lapLabel === "string") setLap(lapLabel);
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
            <h1>LOVE LAP: HIGHWAY RUN 💛</h1>
            <p>Choose your ride, then collect 10 hearts to win.</p>

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
              Start 💛
            </button>

            <div className="smallHint">
              Controls: ← → or A/D • Space = Menu • R = Restart • Mobile: tap ◀ ▶
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
          <h1>LOVE LAP: HIGHWAY RUN 💛</h1>
          <p>{lap} • ← → or A/D • Space = Menu • R = Restart • Mobile: tap ◀ ▶</p>
        </div>

        <div className="hud">
          <div className="pill"><strong>Hearts</strong>: {score}</div>
          <div className="pill"><strong>Best</strong>: {best}</div>
        </div>
      </div>

      <div className="gameShell">
        <div id="phaser-root" ref={phaserRef} />
      </div>

      <div className="footer">Happy Valentine’s Day 💛 Love, Elvira</div>
    </div>
  );
}
