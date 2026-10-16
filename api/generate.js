// Vercel Serverless Function - runs on the SERVER, not in the browser.
// Your API key lives here as a secret (process.env.ANTHROPIC_API_KEY)
// and is never sent to the visitor's browser.

// --- simple in-memory rate limit (per server instance) ---
const hits = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 8; // max 8 generations per minute per IP

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count += 1;
  hits.set(ip, rec);
  return rec.count > MAX_PER_WINDOW;
}

const SYSTEM =
  "You are a senior color-systems designer. The user gives a mood, theme, or a few keywords. " +
  "Design ONE cohesive, good-looking, accessible color system for a digital product. " +
  "Return ONLY valid JSON (no markdown, no backticks, no commentary) in exactly this shape: " +
  '{"name": string, "colors": {' +
  '"primary": {"hex":"#RRGGBB","label":string},' +
  '"onPrimary": {"hex":"#RRGGBB","label":"Button text"},' +
  '"secondary": {"hex":"#RRGGBB","label":string},' +
  '"accent": {"hex":"#RRGGBB","label":string},' +
  '"onAccent": {"hex":"#RRGGBB","label":"Button text"},' +
  '"background": {"hex":"#RRGGBB","label":string},' +
  '"surface": {"hex":"#RRGGBB","label":string},' +
  '"textPrimary": {"hex":"#RRGGBB","label":string},' +
  '"textSecondary": {"hex":"#RRGGBB","label":string}}}. ' +
  "Every hex is a real 6-digit code. 'name' is 2-3 words. Colors must look cohesive and pleasant together. " +
  "Accessibility (all must pass): textPrimary >=4.5:1 on background (aim 7:1); onPrimary >=4.5:1 on primary; onAccent >=4.5:1 on accent. " +
  "surface sits just above background. Make each generation distinct.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    "unknown";
  if (rateLimited(ip)) {
    return res
      .status(429)
      .json({ error: "Too many requests. Give it a moment and try again." });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Server is missing its API key." });
  }

  let prompt = "";
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    prompt = (body.prompt || "").toString().slice(0, 200);
  } catch (_) {
    return res.status(400).json({ error: "Bad request." });
  }
  if (!prompt.trim()) {
    return res.status(400).json({ error: "Say something to generate from." });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res
        .status(502)
        .json({ error: "Generator upstream error.", detail });
    }

    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Generator failed. Try again." });
  }
}
