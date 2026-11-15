import { getStore } from "@netlify/blobs";

const MAX = 300000; // metros: limite de sanidade
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const okId = (s) => /^[a-z0-9-]{8,64}$/.test(s || "");
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16);

async function hash(id) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function all(store) {
  const { blobs } = await store.list();
  const arr = await Promise.all(
    blobs.slice(0, 300).map((b) => store.get(b.key, { type: "json" }).catch(() => null))
  );
  return arr.filter(Boolean).sort((a, b) => b.best - a.best || a.t - b.t);
}

export default async (req) => {
  const store = getStore({ name: "anaturbo", consistency: "strong" });

  if (req.method === "GET") {
    const me = new URL(req.url).searchParams.get("me");
    const mine = okId(me) ? await hash(me) : null;
    const list = await all(store);
    const top = list.slice(0, 30).map((x) => ({ k: x.k, name: x.name, best: x.best, mine: x.k === mine }));
    const i = mine ? list.findIndex((x) => x.k === mine) : -1;
    const m = i >= 0 ? { k: list[i].k, name: list[i].name, best: list[i].best, rank: i + 1 } : null;
    return json({ top, me: m, total: list.length });
  }

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "json" }, 400); }
    if (!okId(b.id)) return json({ error: "id" }, 400);
    const k = await hash(b.id);
    const old = await store.get(k, { type: "json" });
    const name = cleanName(b.name);

    if (b.dist === undefined) {
      if (!old) return json({ error: "none" }, 409);
      old.name = name || old.name;
      await store.setJSON(k, old);
      return json({ ok: true, k });
    }

    const d = Math.floor(Number(b.dist));
    if (!Number.isFinite(d) || d < 0 || d > MAX) return json({ error: "dist" }, 400);
    const prev = old?.best || 0;
    await store.setJSON(k, {
      k,
      name: name || old?.name || "Anônimo",
      best: Math.max(prev, d),
      t: d > prev ? Date.now() : old?.t || Date.now(),
    });
    return json({ ok: true, k, best: Math.max(prev, d) });
  }

  return json({ error: "method" }, 405);
};

export const config = { path: "/api/ranking" };
