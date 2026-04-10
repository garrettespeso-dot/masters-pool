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

const POOL_GOLFERS = Array.from(
  new Set(
    DEFAULT_PARTICIPANTS.flatMap((entry) =>
      Object.values(entry.picks).flat().map((name) => ({
        raw: String(name).trim(),
        normalized: normalizeName(name),
      }))
    )
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

function titleCaseFromNormalized(name) {
  return name
    .split(" ")
    .map((part) => {
      if (part === "jj") return "J.J.";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function extractPlayersFromPageText(pageText) {
  const lines = pageText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const found = new Map();

  for (const line of lines) {
    const normalizedLine = normalizeName(line);

    for (const golfer of POOL_GOLFERS) {
      if (!normalizedLine.includes(golfer.normalized)) continue;

      const idx = normalizedLine.indexOf(golfer.normalized);
      const tail = line.slice(Math.max(0, idx));

      // Find the first score token after the name.
      const scoreMatch = tail.match(/\b(E|[+-]\d+|CUT|WD|DQ|MDF)\b/i);
      if (!scoreMatch) continue;

      const score = parseScore(scoreMatch[1]);
      const upperLine = line.toUpperCase();
      const madeCut =
        !upperLine.includes("CUT") &&
        !upperLine.includes("WD") &&
        !upperLine.includes("DQ") &&
        !upperLine.includes("MDF") &&
        typeof score === "number";

      const existing = found.get(golfer.normalized);
      if (!existing || (existing.score == null && score != null)) {
        found.set(golfer.normalized, {
          name: golfer.raw,
          normalizedName: golfer.normalized,
          score,
          madeCut,
          rawLine: line,
        });
      }
    }
  }

  return Array.from(found.values());
}

export default async function handler(req, res) {
  try {
    const response = await fetch(LEADERBOARD_URL, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: `Leaderboard fetch failed: ${response.status}`,
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const pageText = $("body").text();

    const players = extractPlayersFromPageText(pageText);

    return res.status(200).json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      source: LEADERBOARD_URL,
      count: players.length,
      players,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Unknown server error",
    });
  }
}
