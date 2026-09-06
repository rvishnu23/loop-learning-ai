export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    return response.status(503).json({ error: "AI is not configured. Add OPENROUTER_API_KEY in Vercel project settings." });
  }

  try {
    const { model, max_tokens: maxTokens, system, messages = [] } = request.body || {};
    const userMessage = messages.find((message) => message.role === "user");
    const textBlocks = (userMessage?.content || []).filter((block) => block.type === "text");
    const userText = textBlocks.map((block) => block.text || "").join("\n") || "Please respond.";
    const selectedModel = model || process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct";
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://loop-learning-ai.vercel.app",
        "X-Title": "Loop Learning AI",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: system || "You are a helpful assistant." },
          { role: "user", content: userText },
        ],
        max_tokens: maxTokens || 4096,
        temperature: 0.2,
      }),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return response.status(upstream.status).json({ error: body?.error?.message || "OpenRouter request failed" });
    }
    const text = body?.choices?.[0]?.message?.content || "";
    return response.status(200).json({ content: [{ text }] });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "AI service unavailable" });
  }
}