import "dotenv/config";
import express from "express";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, ".data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const FILES_PATH = path.join(DATA_DIR, "files.json");

const emptyDB = () => ({
  teacherAccounts: [], classes: [], students: [], subjects: [],
  assessments: [], quizAttempts: [], practiceSessions: [], studentMaterials: [],
  officialAssessments: [], thresholds: { strong: 80, needsPractice: 50 },
});

async function ensureStorage() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await access(DB_PATH);
  } catch {
    await writeFile(DB_PATH, JSON.stringify(emptyDB(), null, 2));
  }
  try {
    await access(FILES_PATH);
  } catch {
    await writeFile(FILES_PATH, JSON.stringify({}, null, 2));
  }
}

async function readJson(filePath, fallback) {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

app.use(express.json({ limit: "20mb" }));

app.get("/api/db", async (_req, res) => {
  await ensureStorage();
  const db = await readJson(DB_PATH, emptyDB());
  res.json({ db });
});

app.put("/api/db", async (req, res) => {
  const payload = req.body?.db;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid database payload" });
  }
  await ensureStorage();
  await writeFile(DB_PATH, JSON.stringify(payload, null, 2));
  res.json({ ok: true });
});

app.get("/api/files", async (req, res) => {
  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "File id is required" });
  await ensureStorage();
  const files = await readJson(FILES_PATH, {});
  res.json({ file: files[id] || null });
});

app.put("/api/files", async (req, res) => {
  const { id, file } = req.body || {};
  if (!id || !file) return res.status(400).json({ error: "File id and payload are required" });
  await ensureStorage();
  const files = await readJson(FILES_PATH, {});
  files[id] = file;
  await writeFile(FILES_PATH, JSON.stringify(files, null, 2));
  res.json({ ok: true });
});

app.post("/api/claude", async (req, res) => {
  const { model, max_tokens: maxTokens, system, messages = [], provider: requestProvider } = req.body || {};
  const selectedProvider = String(requestProvider || process.env.AI_PROVIDER || (process.env.HF_MODEL ? "hf" : "gemini")).toLowerCase();
  console.log("AI route provider:", selectedProvider, "model:", model || process.env.HF_MODEL || process.env.GEMINI_MODEL);

  if (selectedProvider === "hf") {
    const userMessage = messages.find((message) => message.role === "user");
    const textBlocks = (userMessage?.content || []).filter((block) => block.type === "text");
    const userText = textBlocks.map((block) => block.text || "").join("\n") || "Please respond.";
    const prompt = [system || "You are a helpful assistant.", userText].filter(Boolean).join("\n\n");
    const hfModel = model || process.env.HF_MODEL || "google/gemma-2-2b-it";
    const hfUrl = `https://api-inference.huggingface.co/models/${encodeURIComponent(hfModel)}`;
    const headers = {
      "Content-Type": "application/json",
      ...(process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {}),
    };

    try {
      const upstream = await fetch(hfUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: maxTokens || 512,
            temperature: 0.2,
            return_full_text: false,
          },
          options: { wait_for_model: true },
        }),
      });

      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const msg = body?.error || body?.message || `Hugging Face request failed (${upstream.status})`;
        return res.status(upstream.status).json({ error: msg });
      }

      const text = Array.isArray(body)
        ? (body[0]?.generated_text || "")
        : (body?.generated_text || body?.error || "");

      return res.json({ content: [{ text }] });
    } catch (error) {
      return res.status(502).json({ error: error instanceof Error ? error.message : "AI service unavailable" });
    }
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: "AI is not configured. Add GEMINI_API_KEY to your environment." });
  }

  const userMessage = messages.find((message) => message.role === "user");
  const parts = (userMessage?.content || []).map((block) => {
    if (block.type === "text") return { text: block.text };
    if (block.type === "image" || block.type === "document") {
      return { inlineData: { mimeType: block.source.media_type, data: block.source.data } };
    }
    return null;
  }).filter(Boolean);

  const selectedModel = (model || process.env.GEMINI_MODEL || "gemini-2.5-flash").replace(/^models\//, "");
  const models = [selectedModel, process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"].filter((value, index, list) => list.indexOf(value) === index);

  let fatalError = null;
  for (const candidateModel of models) {
    try {
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system || "You are a helpful assistant." }] },
          contents: [{ role: "user", parts }],
          generationConfig: { maxOutputTokens: maxTokens || 4096, temperature: 0.2, responseMimeType: "application/json" },
        }),
      });

      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const msg = body?.error?.message || `Gemini request failed (${upstream.status})`;
        if ([429, 500, 502, 503, 504].includes(upstream.status)) {
          fatalError = msg;
          continue;
        }
        return res.status(upstream.status).json({ error: msg });
      }

      const text = (body?.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("\n");
      return res.json({ content: [{ text }] });
    } catch (error) {
      fatalError = error instanceof Error ? error.message : "AI service unavailable";
    }
  }

  return res.status(502).json({ error: fatalError || "AI service unavailable" });
});

app.listen(port, () => {
  console.log(`Loop Learning AI server running on http://localhost:${port}`);
});
