const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function configError(response) {
  return response.status(503).json({ error: "Database is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel." });
}

async function supabase(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export default async function handler(request, response) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return configError(response);
  try {
    if (request.method === "GET") {
      const upstream = await supabase("loop_state?id=eq.default&select=payload");
      const rows = await upstream.json().catch(() => []);
      if (!upstream.ok) return response.status(upstream.status).json({ error: "Database read failed" });
      return response.status(200).json({ db: rows[0]?.payload || null });
    }
    if (request.method === "PUT") {
      const payload = request.body?.db;
      if (!payload || typeof payload !== "object") return response.status(400).json({ error: "Invalid database payload" });
      const upstream = await supabase("loop_state", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: "default", payload, updated_at: new Date().toISOString() }) });
      if (!upstream.ok) return response.status(upstream.status).json({ error: "Database write failed" });
      return response.status(200).json({ ok: true });
    }
    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return response.status(502).json({ error: "Could not reach Supabase. Check SUPABASE_URL and project status." });
  }
}