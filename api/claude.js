export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return response.status(503).json({ error: "AI is not configured. Add ANTHROPIC_API_KEY in Vercel project settings." });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(request.body),
    });
    const body = await upstream.json();
    if (!upstream.ok) {
      return response.status(upstream.status).json({ error: body?.error?.message || "Anthropic request failed" });
    }
    return response.status(200).json(body);
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "AI service unavailable" });
  }
}