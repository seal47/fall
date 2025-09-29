import { kv } from "@vercel/kv";

/*
  GET /api/best?wallet=...
  Response: { wallet, best }
*/
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const walletRaw = Array.isArray(req.query.wallet)
    ? req.query.wallet[0]
    : req.query.wallet;
  const wallet = (walletRaw || "").trim();

  if (!wallet) {
    return res.status(400).json({ error: "wallet required" });
  }

  try {
    const score = await kv.zscore("dtfo:lb", wallet);
    return res
      .status(200)
      .json({ wallet, best: score != null ? Number(score) : 0 });
  } catch (e) {
    console.error("best error:", e);
    return res.status(500).json({ wallet, best: 0 });
  }
}
