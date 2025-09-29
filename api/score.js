import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

/*
  POST /api/score
  Body: { wallet: string, score: number }
  Response: { best: number, items: [{ wallet, best }] }
*/
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const w = String(body.wallet || "").trim();
    const s = Math.max(0, Number(body.score || 0)) | 0;

    if (!w || w.length > 256) return res.status(400).json({ error: "invalid wallet" });

    const current = await redis.zscore("dtfo:lb", w);
    const currentBest = current ? Number(current) : 0;

    let newBest = currentBest;
    if (s > currentBest) {
      await redis.zadd("dtfo:lb", { score: s, member: w });
      newBest = s;
    }

    const arr = await redis.zrange("dtfo:lb", 0, 99, {
      rev: true,
      withScores: true
    });

    const items = (arr || []).map((r) => ({
      wallet: String(r.member),
      best: Number(r.score || 0)
    }));

    return res.status(200).json({ best: newBest, items });
  } catch (e) {
    console.error("score error:", e);
    return res.status(500).json({ best: 0, items: [] });
  }
}