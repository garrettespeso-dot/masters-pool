import React, { useMemo, useState } from "react";

const BUCKETS = ["Bucket 1", "Bucket 2", "Bucket 3", "Bucket 4", "Bucket 5"];

const DEFAULT_PARTICIPANTS = [
  {
    name: "Jaryl",
    picks: {
      "Bucket 1": ["Scottie Scheffler", "Xander Schauffele"],
      "Bucket 2": ["Hideki Matsuyama", "Justin Rose"],
      "Bucket 3": ["Adam Scott", "Corey Conners"],
      "Bucket 4": ["Brooks Koepka", "Jordan Spieth"],
      "Bucket 5": ["Dustin Johnson", "Cameron Smith"]
    }
  }
];

const DEFAULT_PLAYERS = [
  { name: "Scottie Scheffler", bucket: "Bucket 1", score: 0, madeCut: false },
  { name: "Xander Schauffele", bucket: "Bucket 1", score: 0, madeCut: false },
  { name: "Hideki Matsuyama", bucket: "Bucket 2", score: 0, madeCut: false },
  { name: "Justin Rose", bucket: "Bucket 2", score: 0, madeCut: false },
  { name: "Adam Scott", bucket: "Bucket 3", score: 0, madeCut: false },
  { name: "Corey Conners", bucket: "Bucket 3", score: 0, madeCut: false },
  { name: "Brooks Koepka", bucket: "Bucket 4", score: 0, madeCut: false },
  { name: "Jordan Spieth", bucket: "Bucket 4", score: 0, madeCut: false },
  { name: "Dustin Johnson", bucket: "Bucket 5", score: 0, madeCut: false },
  { name: "Cameron Smith", bucket: "Bucket 5", score: 0, madeCut: false }
];

function flattenPicks(picks) {
  return BUCKETS.flatMap((bucket) => picks[bucket] || []);
}

function computeEntry(entry, players) {
  const playerMap = Object.fromEntries(players.map((p) => [p.name, p]));
  const selected = flattenPicks(entry.picks)
    .map((name) => playerMap[name])
    .filter(Boolean);

  const madeCutPlayers = selected.filter((p) => p.madeCut);
  const scores = madeCutPlayers
    .map((p) => Number(p.score))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  const best5 = scores.slice(0, 5);
  const total = best5.length === 5 ? best5.reduce((a, b) => a + b, 0) : null;
  const tiebreak = scores.length >= 6 ? scores[5] : null;

  return {
    ...entry,
    madeCutCount: madeCutPlayers.length,
    total,
    tiebreak,
    out: madeCutPlayers.length < 5
  };
}

export default function App() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [participants] = useState(DEFAULT_PARTICIPANTS);

  const leaderboard = useMemo(() => {
    return participants
      .map((p) => computeEntry(p, players))
      .sort((a, b) => (a.total ?? 9999) - (b.total ?? 9999));
  }, [participants, players]);

  const updatePlayer = (name, field, value) => {
    setPlayers((prev) =>
      prev.map((p) => (p.name === name ? { ...p, [field]: value } : p))
    );
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>Masters Pool</h1>

      <h2>Leaderboard</h2>
      {leaderboard.map((p) => (
        <div key={p.name} style={{ marginBottom: 8 }}>
          {p.name} — {p.out ? "OUT" : p.total ?? "Need 5 made cuts"}
        </div>
      ))}

      <h2 style={{ marginTop: 24 }}>Scores</h2>
      {players.map((p) => (
        <div key={p.name} style={{ marginBottom: 8 }}>
          <span style={{ display: "inline-block", width: 180 }}>{p.name}</span>
          <input
            type="number"
            value={p.score}
            onChange={(e) => updatePlayer(p.name, "score", Number(e.target.value || 0))}
            style={{ width: 70, marginRight: 12 }}
          />
          <label>
            <input
              type="checkbox"
              checked={p.madeCut}
              onChange={(e) => updatePlayer(p.name, "madeCut", e.target.checked)}
            />{" "}
            Made cut
          </label>
        </div>
      ))}
    </div>
  );
}
