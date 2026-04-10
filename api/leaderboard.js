const SCORES_CSV_URL = "https:docs.google.com/spreadsheets/d/e/2PACX-1vTPyE3LzoKrkl6eJr-hoEHoVlOCPcLXe7lmuMvK1o9mjuvziDJ8f8X_W6-2NyxCR8J1zN2lTB64qF/pub?output=csv";

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

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || ""]));
  });
}

function parseScore(value) {
  const s = String(value || "").trim().toUpperCase();
  if (!s) return null;
  if (s === "E") return 0;
  const n = Number(s.replace("+", ""));
  return Number.isFinite(n) ? n : null;
}

function parseMadeCut(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

export default async function handler(req, res) {
  try {
    const response = await fetch(SCORES_CSV_URL, {
      headers: { "cache-control": "no-cache" }
    });

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: `Could not fetch Google Sheet CSV: ${response.status}`
      });
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    const players = rows
      .map((row) => ({
        name: row.player || "",
        normalizedName: normalizeName(row.player || ""),
        score: parseScore(row.score),
        madeCut: parseMadeCut(row.madeCut)
      }))
      .filter((row) => row.name);

    return res.status(200).json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      count: players.length,
      players
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Unknown server error"
    });
  }
}
