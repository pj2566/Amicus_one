// Single entry point for all AI calls.
// LLM_PROVIDER=vertex (default) → Gemini on Vertex AI, authenticated via ADC (no API key).
// LLM_PROVIDER=groq            → Groq, with optional second key for rate-limit rotation.

const provider = (process.env.LLM_PROVIDER || 'vertex').toLowerCase();

// ── Vertex AI (Gemini) ─────────────────────────────────────
let vertexClient = null;
const getVertexClient = () => {
  if (!vertexClient) {
    const { GoogleGenAI } = require('@google/genai');
    vertexClient = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      // asia-south1 (Mumbai) keeps client documents in India; newer models may only be on 'global'
      location: process.env.GOOGLE_CLOUD_LOCATION || 'asia-south1'
    });
  }
  return vertexClient;
};

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
// Thinking tokens count against maxOutputTokens, so it is off by default to keep
// the existing max_tokens values meaningful. Set e.g. 1024 to enable, or 'none' to
// omit the setting entirely (required for models that only accept a thinking level).
const GEMINI_THINKING_BUDGET = parseInt(process.env.GEMINI_THINKING_BUDGET || '0', 10);

const vertexChat = async ({ system, messages, maxTokens, temperature }) => {
  const config = { maxOutputTokens: maxTokens, temperature };
  if (system) config.systemInstruction = system;
  if (!Number.isNaN(GEMINI_THINKING_BUDGET)) {
    config.thinkingConfig = { thinkingBudget: GEMINI_THINKING_BUDGET };
  }

  try {
    const res = await getVertexClient().models.generateContent({
      model: GEMINI_MODEL,
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      config
    });
    return res.text || '';
  } catch (err) {
    // Normalise so callers can keep checking err.status === 429
    if (!err.status && /RESOURCE_EXHAUSTED|429/.test(err.message || '')) err.status = 429;
    throw err;
  }
};

// ── Groq (fallback) ────────────────────────────────────────
const groqKeys = [
  process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2
].filter(Boolean);
let groqKeyIndex = 0;

const groqChat = async ({ system, messages, maxTokens, temperature }, retryCount = 0) => {
  const Groq = require('groq-sdk');
  const client = new Groq({ apiKey: groqKeys[groqKeyIndex] });
  try {
    const result = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      max_tokens: maxTokens,
      temperature
    });
    return result.choices[0]?.message?.content || '';
  } catch (err) {
    if (err.status === 429 && retryCount < groqKeys.length - 1) {
      groqKeyIndex = (groqKeyIndex + 1) % groqKeys.length;
      console.log(`🔄 Rotated to Groq key ${groqKeyIndex + 1}`);
      return groqChat({ system, messages, maxTokens, temperature }, retryCount + 1);
    }
    throw err;
  }
};

// messages: [{ role: 'user' | 'assistant', content }]
const chat = ({ system, messages, maxTokens = 3000, temperature = 0.3 }) => {
  const args = { system, messages, maxTokens, temperature };
  return provider === 'groq' ? groqChat(args) : vertexChat(args);
};

console.log(`🤖 LLM provider: ${provider === 'groq' ? 'Groq' : `Vertex AI (${GEMINI_MODEL})`}`);

module.exports = { chat };
