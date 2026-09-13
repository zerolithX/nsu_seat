import * as cheerio from "cheerio";

const SOURCE_URL = "https://rds4.northsouth.ac.bd/offered_courses";

export default async function handler(req, res) {
  try {
    const upstream = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: "Upstream fetch failed", status: upstream.status });
      return;
    }

    const html = await upstream.text();
    const $ = cheerio.load(html);

    // Pull the "Last Synced: ..." line if present anywhere on the page
    let lastSynced = null;
    const bodyText = $("body").text();
    const syncMatch = bodyText.match(/Last Synced:\s*([^\n]+?)(?:\s{2,}|$)/i);
    if (syncMatch) lastSynced = syncMatch[1].trim();

    const rows = [];
    $("table tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 6) return;
      const vals = cells
        .map((_, td) => $(td).text().replace(/\s+/g, " ").trim())
        .get();

      // Layout: #, Course, Section, Faculty, Time, Room, Seats Available
      const [num, course, section, faculty, time, room, seatsRaw] = vals;
      if (!course || seatsRaw === undefined) return;

      const seats = parseInt(seatsRaw, 10);
      if (Number.isNaN(seats)) return;

      rows.push({
        num: num || null,
        course,
        section,
        faculty,
        time,
        room,
        seats,
      });
    });

    if (rows.length === 0) {
      res.status(502).json({ error: "Parsed zero rows — page structure may have changed" });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=45, stale-while-revalidate=90");
    res.status(200).json({
      lastSynced,
      fetchedAt: new Date().toISOString(),
      count: rows.length,
      rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}
