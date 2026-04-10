import { DEFAULT_PARTICIPANTS } from "./participants";

import React, { useEffect, useMemo, useState } from "react";

const BUCKETS = ["Bucket 1", "Bucket 2", "Bucket 3", "Bucket 4", "Bucket 5"];

function normalizeName(name) {
  return String(name || "")
    .replace(/\(a\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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

function flattenPicks(picks) {
  return BUCKETS.flatMap((bucket) => picks[bucket] || []);
}

function computeEntry(entry, players) {
  const playerMap = Object.fromEntries(players.map((p) => [p.name, p]));
  const selected = flattenPicks(entry.picks)
    .map((name) => playerMap[normalizePoolName(name)])
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

function cardStyle() {
  return {
    background: "#ffffff",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
    border: "1px solid #e5e7eb"
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

        const reasonableScore =
          typeof live.score === "number" &&
          live.score >= -20 &&
          live.score <= 20;

        return {
          ...player,
          score: reasonableScore ? live.score : player.score,
          madeCut:
            typeof live.madeCut === "boolean"
              ? live.madeCut
              : reasonableScore
                ? true
                : player.madeCut
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

  const leaderName = leaderboard.find((p) => !p.out)?.name || "";

  return (
    <div
      style={{
        background: "#e8f5e9",
        minHeight: "100vh",
        padding: 20,
        fontFamily: "Arial, sans-serif",
        color: "#111827"
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 48, fontWeight: 800, color: "#0b3d2e" }}>
            Masters Pool
          </h1>
          <div
            style={{
              ...cardStyle(),
            background: "#0b3d2e",
            color: "#f2c94c"
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
            marginBottom: 24
          }}
        >
          <div style={cardStyle()}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>Leader</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{leaderName || "—"}</div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>Entries</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{leaderboard.length}</div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>Golfers Tracked</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{players.length}</div>
          </div>
        </div>

        <div style={{ ...cardStyle(), marginBottom: 24 }}>
          <h2 style={{ marginTop: 0, fontSize: 34 }}>Leaderboard</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Rank", "Participant", "Status", "Made Cut", "Best 5 Total", "6th Score"].map((header) => (
                    <th
                      key={header}
                      style={{
                        textAlign: "left",
                        padding: 14,
                        borderBottom: "1px solid #e5e7eb",
                        fontSize: 14,
                        color: "#6b7280"
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
          borderLeft: isLeader ? "6px solid #f2c94c" : "none"
        }}
      >
     <td
       style={{
         padding: 14,
         borderBottom: "1px solid #e5e7eb",
         fontWeight: 700,
         verticalAlign: "middle"
       }}
     >
       <div
         style={{
         display: "flex",
         alignItems: "center",
         gap: 8
       }}
     >
       {idx === 0 && <span style={{ fontSize: 18 }}>🥇</span>}
       {idx === 1 && <span style={{ fontSize: 18 }}>🥈</span>}
       {idx === 2 && <span style={{ fontSize: 18 }}>🥉</span>}
       <span>#{idx + 1}</span>
     </div>
   </td>

        <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>
          {entry.name}
        </td>

        <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
          <span
            style={{
              display: "inline-block",
              padding: "6px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: entry.out ? "#fdecea" : "#d1fae5",
              color: entry.out ? "#b91c1c" : "#0b3d2e"
            }}
          >
            {entry.out ? "OUT" : "ACTIVE"}
          </span>
        </td>

        <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
          {entry.madeCutCount}
        </td>

        <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>
          {entry.total ?? "—"}
        </td>

        <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
          {entry.tiebreak ?? "—"}
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
          <div
            style={{
              display: "grid",
              gap: 12
            }}
          >
            {players.map((p) => (
              <div
                key={p.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1fr) 90px 120px",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: "#f9fafb"
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>{p.bucket}</div>
                </div>

                <input
                  type="number"
                  value={p.score}
                  onChange={(e) => updatePlayer(p.name, "score", Number(e.target.value || 0))}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 16
                  }}
                />

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={p.madeCut}
                    onChange={(e) => updatePlayer(p.name, "madeCut", e.target.checked)}
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
