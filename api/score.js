import { kv } from "@vercel/kv";

/*
  POST /api/score
  Body: { wallet: string, score: number }
  Response: { best: number, items: [{ wallet, best }] } // top 100
*/
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { wallet, score } = req.body || {};
    const w = String(wallet || "").trim();
    const s = Math.max(0, Number(score || 0)) | 0;

    if (!w || w.length > 256) {
      return res.status(400).json({ error: "invalid wallet" });
    }

    // Only update if new score beats previous best
    const current = await kv.zscore("dtfo:lb", w);
    const currentBest = current != null ? Number(current) : 0;

    let newBest = currentBest;
    if (s > currentBest) {
      await kv.zadd("dtfo:lb", { score: s, member: w });
      newBest = s;
    }

    // Return fresh top 100
    const raw = await kv.zrange("dtfo:lb", 0, 99, {
      rev: true,
      withScores: true
    });

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

    return res.status(200).json({ best: newBest, items });
  } catch (e) {
    console.error("score error:", e);
    return res.status(500).json({ best: 0, items: [] });
  }
}
