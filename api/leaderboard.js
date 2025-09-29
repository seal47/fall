import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

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
    const arr = await redis.zrange("dtfo:lb", 0, limit - 1, {
      rev: true,
      withScores: true
    }); // [{member, score}, ...]

    const items = (arr || []).map((r) => ({
      wallet: String(r.member),
      best: Number(r.score || 0)
    }));

    return res.status(200).json({ items });
  } catch (e) {
    console.error("leaderboard error:", e);
    return res.status(500).json({ items: [] });
  }
}