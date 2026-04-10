import * as cheerio from "cheerio";

const LEADERBOARD_URL =
  "https://www.espn.com/golf/leaderboard/_/tournamentId/401703489";

function normalizeName(name) {
  return String(name || "")
    .replace(/\(a\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizePoolName(name) {
  return normalizeName(name)
    .replace("jordon spieth", "jordan spieth")
    .replace("sungae im", "sungjae im")
    .replace("ludvig åberg", "ludvig aberg")
    .replace("nicolai højgaard", "nicolai hojgaard");
}

function parseScore(raw) {
  const value = String(raw || "").trim().toUpperCase();

  if (!value) return null;
  if (value === "E") return 0;
  if (["CUT", "WD", "DQ", "MDF"].includes(value)) return null;

  const num = Number(value.replace("+", ""));
  if (!Number.isFinite(num)) return null;

  // reject absurd values from bad parsing
  if (num < -30 || num > 40) return null;

  return num;
}

function inferMadeCut({ position, status, score }) {
  const text = `${position || ""} ${status || ""}`.toUpperCase();

  if (text.includes("CUT") || text.includes("WD") || text.includes("DQ") || text.includes("MDF")) {
    return false;
  }

  if (typeof score === "number") return true;

  return false;
}

function dedupePlayers(players) {
  const map = new Map();

  for (const player of players) {
    const key = normalizePoolName(player.name);
    if (!key) continue;

    const existing = map.get(key);

    if (!existing) {
      map.set(key, player);
      continue;
    }

    // Prefer row with a valid score over one without.
    const existingHasScore = typeof existing.score === "number";
    const currentHasScore = typeof player.score === "number";

    if (!existingHasScore && currentHasScore) {
      map.set(key, player);
      continue;
    }

    // Prefer more informative status if scores are equal quality.
    const existingStatusLen = String(existing.status || "").length;
    const currentStatusLen = String(player.status || "").length;

    if (currentHasScore === existingHasScore && currentStatusLen > existingStatusLen) {
      map.set(key, player);
    }
  }

  return [...map.values()];
}

function isLikelyPlayerName(text) {
  const value = String(text || "").trim();

  if (!value) return false;
  if (value.length < 5) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (/\b(THRU|POS|SCORE|TODAY|R1|R2|R3|R4|TEE|START|LEADERBOARD)\b/i.test(value)) return false;

  const parts = value.split(" ");
  return parts.length >= 2 && parts.length <= 4;
}

function extractFromEmbeddedJson(html) {
  const results = [];

  const scriptMatches = [
    ...html.matchAll(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;/g),
    ...html.matchAll(/window\.__espnfitt__\s*=\s*({[\s\S]*?})\s*;/g)
  ];

  for (const match of scriptMatches) {
    try {
      const parsed = JSON.parse(match[1]);

      const visit = (node) => {
        if (!node || typeof node !== "object") return;

        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }

        const rawName =
          node.displayName ||
          node.shortName ||
          node.name ||
          node.athlete?.displayName ||
          node.playerName;

        const rawScore =
          node.score ??
          node.totalScore ??
          node.tournamentScore ??
          node.toPar ??
          node.displayValue;

        const rawPosition =
          node.position?.displayName ||
          node.position?.abbreviation ||
          node.position ||
          node.rank;

        const rawStatus =
          node.status?.type?.name ||
          node.status?.name ||
          node.status ||
          node.state;

        if (isLikelyPlayerName(rawName)) {
          const score = parseScore(rawScore);
          results.push({
            name: String(rawName).trim(),
            score,
            position: rawPosition ? String(rawPosition).trim() : "",
            status: rawStatus ? String(rawStatus).trim() : "",
            madeCut: inferMadeCut({
              position: rawPosition,
              status: rawStatus,
              score
            })
          });
        }

        Object.values(node).forEach(visit);
      };

      visit(parsed);
    } catch {
      // ignore and continue
    }
  }

  return dedupePlayers(results);
}

function extractFromHtmlTables(html) {
  const $ = cheerio.load(html);
  const results = [];

  $("table tr").each((_, row) => {
    const cells = $(row)
      .find("td, th")
      .map((__, cell) => $(cell).text().trim())
      .get()
      .filter(Boolean);

    if (cells.length < 4) return;

    const name = cells.find(isLikelyPlayerName);
    if (!name) return;

    const scoreCell = cells.find((value) => /^(E|[+-]?\d+|CUT|WD|DQ|MDF)$/i.test(value));
    const positionCell = cells.find((value) => /^(T?\d+|CUT|WD|DQ|MDF)$/i.test(value));

    const score = parseScore(scoreCell);

    results.push({
      name,
      score,
      position: positionCell || "",
      status: "",
      madeCut: inferMadeCut({
        position: positionCell,
        status: "",
        score
      })
    });
  });

  return dedupePlayers(results);
}

function validatePlayers(players) {
  return players.filter((player) => {
    if (!player.name) return false;

    const normalized = normalizePoolName(player.name);
    if (!normalized) return false;

    // Reject obviously broken rows.
    if (
      normalized.includes("leaderboard") ||
      normalized.includes("tee time") ||
      normalized.includes("score") ||
      normalized.includes("position")
    ) {
      return false;
    }

    return true;
  });
}

export default async function handler(req, res) {
  try {
    const response = await fetch(LEADERBOARD_URL, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: `Leaderboard fetch failed: ${response.status}`
      });
    }

    const html = await response.text();

    let players = extractFromEmbeddedJson(html);

    if (!players.length) {
      players = extractFromHtmlTables(html);
    }

    players = validatePlayers(players);

    if (!players.length) {
      return res.status(500).json({
        ok: false,
        error: "Could not parse leaderboard data from source."
      });
    }

    return res.status(200).json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      source: LEADERBOARD_URL,
      count: players.length,
      players: players.map((player) => ({
        name: player.name,
        normalizedName: normalizePoolName(player.name),
        score: player.score,
        madeCut: player.madeCut,
        position: player.position,
        status: player.status
      }))
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Unknown server error"
    });
  }
}
