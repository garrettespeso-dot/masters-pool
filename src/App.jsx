import React, { useEffect, useMemo, useState } from "react";

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
  },
  {
    name: "Purtell",
    picks: {
      "Bucket 1": ["Rory McIlroy", "Cameron Young"],
      "Bucket 2": ["Sungjae Im", "Justin Thomas"],
      "Bucket 3": ["Akshay Bhatia", "Patrick Reed"],
      "Bucket 4": ["Tom Kim", "Jordan Spieth"],
      "Bucket 5": ["Jake Knapp", "Ryan Gerard"]
    }
  },
  {
    name: "Mark Chelli",
    picks: {
      "Bucket 1": ["Scottie Scheffler", "Xander Schauffele"],
      "Bucket 2": ["Ludvig Aberg", "Hideki Matsuyama"],
      "Bucket 3": ["Will Zalatoris", "Jason Day"],
      "Bucket 4": ["Jordan Spieth", "Tom Kim"],
      "Bucket 5": ["Ben Griffin", "Ryan Gerard"]
    }
  },
  {
    name: "Xavier",
    picks: {
      "Bucket 1": ["Scottie Scheffler", "Rory McIlroy"],
      "Bucket 2": ["Collin Morikawa", "Justin Thomas"],
      "Bucket 3": ["Adam Scott", "Patrick Reed"],
      "Bucket 4": ["Jordan Spieth", "Tom Kim"],
      "Bucket 5": ["Ryan Gerard", "Ben Griffin"]
    }
  }
];

function normalizePoolName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace("Jordon Spieth", "Jordan Spieth")
    .replace("Sungae IM", "Sungjae Im")
    .replace("Ludvig Åberg", "Ludvig Aberg")
    .replace("Nicolai Højgaard", "Nicolai Hojgaard");
}

const DEFAULT_PLAYERS = Array.from(
  new Map(
    DEFAULT_PARTICIPANTS.flatMap((entry) =>
      BUCKETS.flatMap((bucket) =>
        (entry.picks[bucket] || []).map((name) => [
          normalizePoolName(name),
          {
            name: normalizePoolName(name),
            bucket,
            score: 0,
            madeCut: false
          }
        ])
      )
    )
  ).values()
);

function normalizeName(name) {
  return String(name || "")
    .replace(/\(a\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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
  const [syncStatus, setSyncStatus] = useState("Waiting for first live update...");
  const [lastUpdated, setLastUpdated] = useState("");

  const leaderboard = useMemo(() => {
    return participants
      .map((p) => computeEntry(p, players))
      .sort((a, b) => {
        const aOut = a.out ? 1 : 0;
        const bOut = b.out ? 1 : 0;
        if (aOut !== bOut) return aOut - bOut;
        if ((a.total ?? 9999) !== (b.total ?? 9999)) return (a.total ?? 9999) - (b.total ?? 9999);
        return (a.tiebreak ?? 9999) - (b.tiebreak ?? 9999);
      });
  }, [participants, players]);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveScores() {
      try {
        setSyncStatus("Refreshing live scores...");
        const res = await fetch("/api/leaderboard");
        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Live score request failed");
        }

        const liveMap = new Map();
        for (const row of data.players || []) {
          liveMap.set(normalizeName(row.name), row);
        }

        if (!cancelled) {
          setPlayers((current) =>
            current.map((player) => {
              const live = liveMap.get(normalizeName(player.name));
              if (!live) return player;

              return {
                ...player,
                score: typeof live.score === "number" ? live.score : player.score,
                madeCut: typeof live.madeCut === "boolean" ? live.madeCut : player.madeCut
              };
            })
          );

          setLastUpdated(data.fetchedAt || new Date().toISOString());
          setSyncStatus("Live scores synced");
        }
      } catch (err) {
        if (!cancelled) {
          setSyncStatus(`Live sync failed: ${err.message}`);
        }
      }
    }

    loadLiveScores();
    const id = setInterval(loadLiveScores, 60000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const updatePlayer = (name, field, value) => {
    setPlayers((prev) =>
      prev.map((p) => (p.name === name ? { ...p, [field]: value } : p))
    );
  };

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif", maxWidth: 1000 }}>
      <h1>Masters Pool</h1>

      <div style={{ marginBottom: 16, padding: 12, background: "#f4f4f4", borderRadius: 8 }}>
        <div><strong>Status:</strong> {syncStatus}</div>
        <div><strong>Last updated:</strong> {lastUpdated || "—"}</div>
      </div>

      <h2>Leaderboard</h2>
      <div style={{ marginBottom: 24 }}>
        {leaderboard.map((p, idx) => (
          <div key={p.name} style={{ marginBottom: 8 }}>
            #{idx + 1} {p.name} — {p.out ? "OUT" : p.total ?? "Need 5 made cuts"}
            {"  "}
            {!p.out && p.tiebreak != null ? `(6th: ${p.tiebreak})` : ""}
          </div>
        ))}
      </div>

      <h2>Scores</h2>
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
