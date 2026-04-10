import * as cheerio from "cheerio";

const LEADERBOARD_URL =
  "https://www.espn.com/golf/leaderboard?season=2025&tournamentId=401811941";

function normalizeName(name) {
  return String(name || "")
    .replace(/\(a\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toScoreValue(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase();
  if (!s) return null;
  if (s === "E") return 0;
  if (s === "CUT" || s === "WD" || s === "DQ") return null;
  const n = Number(s.replace("+", ""));
  return Number.isFinite(n) ? n : null;
}

function inferMadeCut(statusText, posText, totalScore) {
  const raw = `${statusText || ""} ${posText || ""}`.toUpperCase();
  if (raw.includes("CUT") || raw.includes("WD") || raw.includes("DQ")) return false;
  if (typeof totalScore === "number") return true;
  return false;
}

function tryParseJsonBlob(html) {
  const blobs = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(/<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/gi),
    ...html.matchAll(/<script[^>]*>\s*window\.__espnfitt__\s*=\s*([\s\S]*?)<\/script>/gi)
  ];

  for (const match of blobs) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const rows = [];
      const visit = (obj) => {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          obj.forEach(visit);
          return;
        }

        const possibleName =
          obj.displayName || obj.shortName || obj.name || obj.athlete?.displayName;
        const possibleScore =
          obj.score ?? obj.totalScore ?? obj.tournamentScore ?? obj.toPar;
        const possiblePos =
          obj.position?.displayName || obj.position?.abbreviation || obj.position || obj.rank;
        const possibleStatus =
          obj.status?.type?.name || obj.status?.name || obj.status;

        if (possibleName) {
          rows.push({
            name: String(possibleName).trim(),
            score: toScoreValue(possibleScore),
            madeCut: inferMadeCut(possibleStatus, possiblePos, toScoreValue(possibleScore)),
            position: possiblePos ? String(possiblePos) : "",
            status: possibleStatus ? String(possibleStatus) : ""
          });
        }

        Object.values(obj).forEach(visit);
      };

      visit(parsed);

      const deduped = new Map();
      for (const row of rows) {
        const key = normalizeName(row.name);
        if (!key) continue;
        if (!deduped.has(key)) deduped.set(key, row);
      }

      if (deduped.size > 10) {
        return [...deduped.values()];
      }
    } catch {
      // keep trying
    }
  }

  return null;
}

function tryParseHtmlTable(html) {
  const $ = cheerio.load(html);
  const results = [];

  $("table tr").each((_, tr) => {
    const cells = $(tr)
      .find("td, th")
      .map((__, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;

    // Heuristic: find a likely player name cell.
    const nameCell = cells.find((c) => /^[A-Z][A-Za-z'. -]+$/.test(c) && c.split(" ").length >= 2);
    if (!nameCell) return;

    const scoreCell = cells.find((c) => /^(E|[+-]?\d+|CUT|WD|DQ)$/i.test(c));
    const posCell = cells.find((c) => /^T?\d+$/.test(c) || /CUT|WD|DQ/i.test(c));

    results.push({
      name: nameCell,
      score: toScoreValue(scoreCell),
      madeCut: inferMadeCut("", posCell, toScoreValue(scoreCell)),
      position: posCell || "",
      status: ""
    });
  });

  const deduped = new Map();
  for (const row of results) {
    const key = normalizeName(row.name);
    if (!key) continue;
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return deduped.size > 10 ? [...deduped.values()] : null;
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
        error: `Leaderboard fetch failed with status ${response.status}`
      });
    }

    const html = await response.text();

    let players = tryParseJsonBlob(html);
    if (!players) players = tryParseHtmlTable(html);

    if (!players || !players.length) {
      return res.status(500).json({
        ok: false,
        error: "Could not parse leaderboard data. The source page format may have changed."
      });
    }

    return res.status(200).json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      source: LEADERBOARD_URL,
      players
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Unknown server error"
    });
  }
}
