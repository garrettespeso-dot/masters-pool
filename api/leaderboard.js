import * as cheerio from "cheerio";
import { DEFAULT_PARTICIPANTS } from "../src/participants.js";

const LEADERBOARD_URL = "https://www.espn.com/golf/leaderboard";

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
    .replace("j j spaun", "jj spaun")
    .replace("jj spaun", "jj spaun");
}

const POOL_GOLFERS = new Set(
  DEFAULT_PARTICIPANTS.flatMap((entry) =>
    Object.values(entry.picks).flat().map(normalizeName)
  )
);

function parseScore(raw) {
  const s = String(raw || "").trim().toUpperCase();

  if (!s) return null;
  if (s === "E") return 0;
  if (["CUT", "WD", "DQ", "MDF"].includes(s)) return null;

  const n = Number(s.replace("+", ""));
  if (!Number.isFinite(n)) return null;

  if (n < -20 || n > 20) return null;
  return n;
}

function inferMadeCut(position, status, score) {
  const text = `${position || ""} ${status || ""}`.toUpperCase();
  if (text.includes("CUT") || text.includes("WD") || text.includes("DQ") || text.includes("MDF")) {
    return false;
  }
  return typeof score === "number";
}

function extractRowsFromText(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const results = [];

  for (const line of lines) {
    // Skip obvious non-player lines
    if (
      /^(POS|PLAYER|SCORE|TODAY|THRU|R1|R2|R3|R4|TOT|ROUND|PROJECTED CUT)/i.test(line) ||
      /Masters Tournament|Leaderboard|Watch on ESPN|Current Weather/i.test(line)
    ) {
      continue;
    }

    // Find any pool golfer name appearing in the line
    for (const golfer of POOL_GOLFERS) {
      const pretty = golfer
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      if (!normalizeName(line).includes(golfer)) continue;

      // Try to pull the score immediately around the name from the raw line
      // Examples from ESPN text:
      // "T7 ... Scottie Scheffler -2 E 1 70"
      // "T29 ... Adam Scott +1 +1 7 72"
      const scoreMatch = line.match(
        new RegExp(
          `${pretty.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s+([E]|[+-]\\d+|CUT|WD|DQ|MDF)`,
          "i"
        )
      );

      const score = parseScore(scoreMatch?.[1] || "");
      const madeCut = inferMadeCut("", "", score);

      results.push({
        name: pretty,
        normalizedName: golfer,
        score,
        madeCut,
        rawLine: line
      });

      break;
    }
  }

  const deduped = new Map();
  for (const row of results) {
    if (!row.normalizedName) continue;

    const existing = deduped.get(row.normalizedName);
    if (!existing) {
      deduped.set(row.normalizedName, row);
      continue;
    }

    // Prefer rows with a valid score
    if (existing.score == null && row.score != null) {
      deduped.set(row.normalizedName, row);
    }
  }

  return [...deduped.values()];
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
    const $ = cheerio.load(html);

    // Use page text instead of recursively mining every JSON blob.
    const pageText = $("body").text();
    const players = extractRowsFromText(pageText);

    if (!players.length) {
      return res.status(500).json({
        ok: false,
        error: "Could not extract any pool golfers from leaderboard page."
      });
    }

    return res.status(200).json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      source: LEADERBOARD_URL,
      count: players.length,
      players: players.map((p) => ({
        name: p.name,
        normalizedName: p.normalizedName,
        score: p.score,
        madeCut: p.madeCut
      }))
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Unknown server error"
    });
  }
}
