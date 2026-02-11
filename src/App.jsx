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
  // This ref points to the div where Phaser will inject a <canvas>
  const phaserRef = useRef(null);

  // Keep a reference to the Phaser game instance so we can destroy it cleanly
  const gameRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [selectedCarId, setSelectedCarId] = useState("s14");

  // HUD values displayed by React
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("love_lap_best") || "0"));
  const [label, setLabel] = useState("Hearts: 0 / 10");

  // ✅ Prevent page scrolling ONLY while the game is running
  useEffect(() => {
    document.body.classList.toggle("game-running", started);
    return () => document.body.classList.remove("game-running");
  }, [started]);

  // Create/destroy Phaser when started changes
  useEffect(() => {
    if (!started) return;
    if (!phaserRef.current) return;

    // If a game already exists, destroy it
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    // Clear old canvas from the mount div
    phaserRef.current.innerHTML = "";

    // Find selected car URL
    const selectedCarUrl =
      CARS.find((c) => c.id === selectedCarId)?.img ?? s14Url;

    // Create Phaser game
    gameRef.current = createGame({
      parent: phaserRef.current,
      selectedCarUrl,

      // Phaser calls this to update React HUD
      onHud: ({ score: newScore, best: newBest, lapLabel }) => {
        if (typeof newScore === "number") setScore(newScore);
        if (typeof newBest === "number") setBest(newBest);
        if (typeof lapLabel === "string") setLabel(lapLabel);
      },

      // Phaser calls this when Space is pressed
      onExitToMenu: () => {
        if (gameRef.current) {
          gameRef.current.destroy(true);
          gameRef.current = null;
        }
        if (phaserRef.current) phaserRef.current.innerHTML = "";
        setStarted(false);
      },
    });

    // Cleanup if React unmounts or started changes
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [started, selectedCarId]);

  // --------------------------
  // Welcome screen
  // --------------------------
  if (!started) {
    return (
      <div className="wrap">
        <div className="welcome">
          <div className="welcomeCard">
            <h1>The Heart Gem Heist </h1>
            <p>Pick a car, then collect 33 hearts to win.</p>

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
              Desktop: ← → or A/D • Space = Menu • R = Restart<br />
              Mobile: Swipe left/right
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------
  // Game screen
  // --------------------------
  return (
    <div className="wrap gameLayout">
      <div className="topbar">
        <div className="title">
          <h1>The Heart Gem Heist 💙</h1>
          <p>{label} • ← → or A/D • Space = Menu • R = Restart • Swipe on mobile</p>
        </div>

        <div className="hud">
          <div className="pill">
            <strong>Hearts</strong>: {score}
          </div>
          <div className="pill">
            <strong>Best</strong>: {best}
          </div>
        </div>
      </div>

      <div className="gameShell">
        <div id="phaser-root" ref={phaserRef} />
      </div>

      <div className="footer"> 💙 Happy Valentine’s Day 💙 Love, Elvira</div>
    </div>
  );
}
