import { kv } from "@vercel/kv";

/*
  GET /api/leaderboard?limit=100
  Response: { items: [{ wallet, best }] }
*/
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limitRaw = Array.isArray(req.query.limit)
    ? req.query.limit[0]
    : req.query.limit;
  const limit = Math.max(1, Math.min(200, Number(limitRaw || 100)));

  try {
    const raw = await kv.zrange("dtfo:lb", 0, limit - 1, {
      rev: true,
      withScores: true
    });

    // Normalize Upstash/Vercel KV response into { wallet, best }[]
    let items = [];
    if (Array.isArray(raw) && raw.length > 0) {
      if (typeof raw[0] === "object" && raw[0] !== null && "member" in raw[0]) {
        items = raw.map((r) => ({
          wallet: String(r.member),
          best: Number(r.score || 0)
        }));
      } else {
        for (let i = 0; i < raw.length; i += 2) {
          items.push({ wallet: String(raw[i]), best: Number(raw[i + 1] || 0) });
        }
      }
    }

    return res.status(200).json({ items });
  } catch (e) {
    console.error("leaderboard error:", e);
    return res.status(500).json({ items: [] });
  }
}
