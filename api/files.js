const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabase(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

export default async function handler(request, response) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return response.status(503).json({ error: "Database is not configured." });
  if (request.method === "GET") {
    const id = String(request.query?.id || "");
    if (!id) return response.status(400).json({ error: "File id is required" });
    const upstream = await supabase(`loop_files?id=eq.${encodeURIComponent(id)}&select=payload`);
    const rows = await upstream.json().catch(() => []);
    if (!upstream.ok) return response.status(upstream.status).json({ error: "File read failed" });
    return response.status(200).json({ file: rows[0]?.payload || null });
  }
  if (request.method === "PUT") {
    const { id, file } = request.body || {};
    if (!id || !file) return response.status(400).json({ error: "File id and payload are required" });
    const upstream = await supabase("loop_files", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id, payload: file, updated_at: new Date().toISOString() }) });
    if (!upstream.ok) return response.status(upstream.status).json({ error: "File write failed" });
    return response.status(200).json({ ok: true });
  }
  return response.status(405).json({ error: "Method not allowed" });
}