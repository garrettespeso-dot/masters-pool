import React, { useEffect, useMemo, useState } from "react";
import { DEFAULT_PARTICIPANTS } from "./participants";

const BUCKETS = ["Bucket 1", "Bucket 2", "Bucket 3", "Bucket 4", "Bucket 5"];

function normalizeName(name) {
  return String(name || "")
    .replace(/\(a\)/gi, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace("jordon spieth", "jordan spieth")
    .replace("sungae im", "sungjae im")
    .replace("ludvig åberg", "ludvig aberg")
    .replace("nicolai højgaard", "nicolai hojgaard")
    .replace("j j spaun", "jj spaun");
}

function flattenPicks(picks) {
  return BUCKETS.flatMap((bucket) => picks[bucket] || []);
}

const DEFAULT_PLAYERS = Array.from(
  new Map(
    DEFAULT_PARTICIPANTS.flatMap((entry) =>
      flattenPicks(entry.picks).map((name) => [
        normalizeName(name),
        {
          name,
          score: 0,
          madeCut: false,
        },
      ])
    )
  ).values()
);

function computeEntry(entry, players) {
  const playerMap = Object.fromEntries(
    players.map((player) => [normalizeName(player.name), player])
  );

  const selected = flattenPicks(entry.picks)
    .map((name) => playerMap[normalizeName(name)])
    .filter(Boolean);

  const madeCutPlayers = selected.filter((player) => player.madeCut);

  const sortedScores = madeCutPlayers
    .map((player) => Number(player.score))
    .filter((score) => !Number.isNaN(score))
    .sort((a, b) => a - b);

  const countedScores = sortedScores.slice(0, 5);
  const total =
    countedScores.length === 5
      ? countedScores.reduce((sum, score) => sum + score, 0)
      : null;

  const tiebreak = sortedScores.length >= 6 ? sortedScores[5] : null;

  return {
    ...entry,
    madeCutCount: madeCutPlayers.length,
    countedScores,
    total,
    tiebreak,
    out: madeCutPlayers.length < 5,
  };
}

function cardStyle() {
  return {
    background: "#ffffff",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
    border: "1px solid #cce3d6",
  };
}

export default function App() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [syncStatus, setSyncStatus] = useState("Waiting for first live update...");
  const [lastUpdated, setLastUpdated] = useState("");

  const leaderboard = useMemo(() => {
    return DEFAULT_PARTICIPANTS.map((entry) => computeEntry(entry, players)).sort(
      (a, b) => {
        if (a.out !== b.out) return a.out ? 1 : -1;
        if ((a.total ?? 9999) !== (b.total ?? 9999)) {
          return (a.total ?? 9999) - (b.total ?? 9999);
        }
        return (a.tiebreak ?? 9999) - (b.tiebreak ?? 9999);
      }
    );
  }, [players]);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveScores() {
      try {
        setSyncStatus("Refreshing live scores...");
        const response = await fetch("/api/leaderboard");
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Live score request failed");
        }

        const liveMap = new Map(
          (data.players || []).map((player) => [
            normalizeName(player.normalizedName || player.name),
            player,
          ])
        );

        if (!cancelled) {
          setPlayers((current) =>
            current.map((player) => {
             const live =
               liveMap.get(normalizeName(player.name)) ||
               liveMap.get(normalizeName(player.name).replace("jj spaun", "j j spaun"));

             if (!live) return player;

             const liveScore = Number(live.score);
             const reasonableScore =
               Number.isFinite(liveScore) &&
               liveScore >= -20 &&
               liveScore <= 20;

             return {
               ...player,
               score: reasonableScore ? liveScore : player.score,
               madeCut: reasonableScore ? true : player.madeCut,
             };
           })
         );
          
          setLastUpdated(data.fetchedAt || new Date().toISOString());
          setSyncStatus("Live scores synced");
        }
      } catch (error) {
        if (!cancelled) {
          setSyncStatus(`Live sync failed: ${error.message}`);
        }
      }
    }

    loadLiveScores();
    const intervalId = setInterval(loadLiveScores, 60000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const updatePlayer = (name, field, value) => {
    setPlayers((current) =>
      current.map((player) =>
        normalizeName(player.name) === normalizeName(name)
          ? { ...player, [field]: value }
          : player
      )
    );
  };

  const leaderName = leaderboard.find((entry) => !entry.out)?.name || "";

  return (
    <div
      style={{
        background: "#e8f5e9",
        minHeight: "100vh",
        padding: 20,
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1
            style={{
              fontSize: 48,
              margin: "0 0 10px 0",
              fontWeight: 800,
              color: "#0b3d2e",
            }}
          >
            Masters Pool
          </h1>

          <div
            style={{
              ...cardStyle(),
              background: "#0b3d2e",
              color: "#f2c94c",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Live Status
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong>Status:</strong> {syncStatus}
            </div>
            <div>
              <strong>Last updated:</strong> {lastUpdated || "—"}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div style={cardStyle()}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
              Leader
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>
              {leaderName || "—"}
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
              Entries
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>
              {leaderboard.length}
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
              Golfers Tracked
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{players.length}</div>
          </div>
        </div>

        <div style={{ ...cardStyle(), marginBottom: 24 }}>
          <h2 style={{ marginTop: 0, fontSize: 34 }}>Leaderboard</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {[
                    "Rank",
                    "Participant",
                    "Status",
                    "Made Cut",
                    "Best 5 Total",
                    "6th Score",
                    "Counting Scores",
                  ].map((header) => (
                    <th
                      key={header}
                      style={{
                        textAlign: "left",
                        padding: 14,
                        borderBottom: "1px solid #e5e7eb",
                        fontSize: 14,
                        color: "#6b7280",
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {leaderboard.map((entry, idx) => {
                  const isLeader = idx === 0 && !entry.out;

                  return (
                    <tr
                      key={entry.name}
                      style={{
                        background: isLeader ? "#d1fae5" : "white",
                        borderLeft: isLeader ? "6px solid #f2c94c" : "none",
                      }}
                    >
                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid #e5e7eb",
                          fontWeight: 700,
                          verticalAlign: "middle",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {idx === 0 && <span style={{ fontSize: 18 }}>🥇</span>}
                          {idx === 1 && <span style={{ fontSize: 18 }}>🥈</span>}
                          {idx === 2 && <span style={{ fontSize: 18 }}>🥉</span>}
                          <span>#{idx + 1}</span>
                        </div>
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid #e5e7eb",
                          fontWeight: 700,
                        }}
                      >
                        {isLeader && <span style={{ marginRight: 6 }}>👑</span>}
                        {entry.name}
                      </td>

                      <td
                        style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: entry.out ? "#fdecea" : "#d1fae5",
                            color: entry.out ? "#b91c1c" : "#0b3d2e",
                          }}
                        >
                          {entry.out ? "OUT" : "ACTIVE"}
                        </span>
                      </td>

                      <td
                        style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}
                      >
                        {entry.madeCutCount}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid #e5e7eb",
                          fontWeight: 700,
                        }}
                      >
                        {entry.total ?? "—"}
                      </td>

                      <td
                        style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}
                      >
                        {entry.tiebreak ?? "—"}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid #e5e7eb",
                          color: "#374151",
                          fontSize: 14,
                        }}
                      >
                        {entry.countedScores?.join(", ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: 34 }}>Scores</h2>

          <div style={{ display: "grid", gap: 12 }}>
            {players.map((player) => (
              <div
                key={player.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 1fr) 90px 120px",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: "#f9fafb",
                }}
              >
                <div style={{ fontWeight: 700 }}>{player.name}</div>

                <input
                  type="number"
                  value={player.score}
                  onChange={(e) =>
                    updatePlayer(
                      player.name,
                      "score",
                      Number(e.target.value || 0)
                    )
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 16,
                  }}
                />

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={player.madeCut}
                    onChange={(e) =>
                      updatePlayer(player.name, "madeCut", e.target.checked)
                    }
                  />
                  Made cut
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
