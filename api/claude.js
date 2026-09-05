export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return response.status(503).json({ error: "AI is not configured. Add GEMINI_API_KEY in Vercel project settings." });
  }

  try {
    const { model, max_tokens: maxTokens, system, messages = [] } = request.body || {};
    const userMessage = messages.find((message) => message.role === "user");
    const parts = (userMessage?.content || []).map((block) => {
      if (block.type === "text") return { text: block.text };
      if (block.type === "image") {
        return { inlineData: { mimeType: block.source.media_type, data: block.source.data } };
      }
      if (block.type === "document") {
        return { inlineData: { mimeType: block.source.media_type, data: block.source.data } };
      }
      return null;
    }).filter(Boolean);

    const selectedModel = (model || process.env.GEMINI_MODEL || "gemini-3.6-flash").replace(/^models\//, "");
    const models = [selectedModel, process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash"].filter((value, index, list) => list.indexOf(value) === index);
    const payload = {
      systemInstruction: { parts: [{ text: system || "You are a helpful assistant." }] },
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: maxTokens || 4096, temperature: 0.2, responseMimeType: "application/json" },
    };

    let body = {};
    let upstream;
    for (const candidateModel of models) {
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      body = await upstream.json().catch(() => ({}));
      if (upstream.ok || ![429, 500, 502, 503, 504].includes(upstream.status)) break;
    }
    if (!upstream?.ok) {
      return response.status(upstream?.status || 502).json({ error: body?.error?.message || "Gemini request failed" });
    }
    const text = (body?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n");
    return response.status(200).json({ content: [{ text }] });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "AI service unavailable" });
  }
}