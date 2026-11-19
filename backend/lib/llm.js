// Single entry point for all AI calls.
// LLM_PROVIDER=vertex (default) → Gemini on Vertex AI, authenticated via ADC (no API key).
// LLM_PROVIDER=groq            → Groq, with optional second key for rate-limit rotation.

const provider = (process.env.LLM_PROVIDER || 'vertex').toLowerCase();

// ── Vertex AI (Gemini) ─────────────────────────────────────
// asia-south1 (Mumbai) keeps client documents in India; newer models may only be on 'global'
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'asia-south1';
const vertexClients = {};
const getVertexClient = (location = DEFAULT_LOCATION) => {
  if (!vertexClients[location]) {
    const { GoogleGenAI } = require('@google/genai');
    const opts = { vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location };
    // Local scripts only: GOOGLE_ACCESS_TOKEN=$(gcloud auth print-access-token) overrides ADC
    if (process.env.GOOGLE_ACCESS_TOKEN) {
      const { OAuth2Client } = require('google-auth-library');
      const authClient = new OAuth2Client();
      authClient.setCredentials({ access_token: process.env.GOOGLE_ACCESS_TOKEN });
      opts.googleAuthOptions = { authClient };
    }
    vertexClients[location] = new GoogleGenAI(opts);
  }
  return vertexClients[location];
};

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
// Thinking tokens count against maxOutputTokens, so it is off by default to keep
// the existing max_tokens values meaningful. Set e.g. 1024 to enable, or 'none' to
// omit the setting entirely (required for models that only accept a thinking level).
const GEMINI_THINKING_BUDGET = parseInt(process.env.GEMINI_THINKING_BUDGET || '0', 10);

const vertexChat = async ({ system, messages, maxTokens, temperature, json, model, location }) => {
  const config = { maxOutputTokens: maxTokens, temperature };
  if (system) config.systemInstruction = system;
  if (json) config.responseMimeType = 'application/json';
  if (!Number.isNaN(GEMINI_THINKING_BUDGET)) {
    config.thinkingConfig = { thinkingBudget: GEMINI_THINKING_BUDGET };
  }

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  try {
    const res = await getVertexClient(location).models.generateContent({ model: model || GEMINI_MODEL, contents, config });
    const finish = res.candidates?.[0]?.finishReason;
    // Gemini withholds output that repeats widely published text verbatim (statutes are on the web).
    // Retry once asking for paraphrase instead of returning an empty answer.
    if (!res.text && finish === 'RECITATION') {
      const retry = await getVertexClient(location).models.generateContent({
        model: model || GEMINI_MODEL,
        contents,
        config: { ...config, systemInstruction: `${system || ''}\n\nIMPORTANT: Do not reproduce long passages of statutes or other published text word for word. Paraphrase them, quoting at most a few key words at a time.` }
      });
      if (retry.text) return retry.text;
      throw new Error('The AI declined to answer because the reply would repeat published text verbatim');
    }
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

const groqChat = async (args, retryCount = 0) => {
  const { system, messages, maxTokens, temperature, json } = args;
  const Groq = require('groq-sdk');
  const client = new Groq({ apiKey: groqKeys[groqKeyIndex] });
  try {
    const result = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      max_tokens: maxTokens,
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {})
    });
    return result.choices[0]?.message?.content || '';
  } catch (err) {
    if (err.status === 429 && retryCount < groqKeys.length - 1) {
      groqKeyIndex = (groqKeyIndex + 1) % groqKeys.length;
      console.log(`🔄 Rotated to Groq key ${groqKeyIndex + 1}`);
      return groqChat(args, retryCount + 1);
    }
    throw err;
  }
};

// messages: [{ role: 'user' | 'assistant', content }]
// json: ask for a JSON response. model/location: per-call override (Vertex only).
const chat = ({ system, messages, maxTokens = 3000, temperature = 0.3, json = false, model, location }) => {
  const args = { system, messages, maxTokens, temperature, json, model, location };
  return provider === 'groq' ? groqChat(args) : vertexChat(args);
};

// Like chat() with json: true, but returns the parsed object (tolerates stray code fences)
const chatJSON = async args => {
  const text = await chat({ ...args, json: true });
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
};

// ── Transcription of scanned PDFs / images (Gemini reads Indian scripts natively) ──
const transcribe = async (buffer, mimeType) => {
  const res = await getVertexClient().models.generateContent({
    model: GEMINI_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: buffer.toString('base64') } },
        { text: 'Transcribe all text in this document exactly as written, in its original language and script, page by page. Keep paragraph breaks and numbering. Do not translate, summarise or add anything. Output only the text.' }
      ]
    }],
    config: { temperature: 0, maxOutputTokens: 32000, ...(Number.isNaN(GEMINI_THINKING_BUDGET) ? {} : { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET } }) }
  });
  return res.text || '';
};

// ── Embeddings (always Vertex — statute search index uses this model) ──
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_LOCATION = process.env.EMBEDDING_LOCATION || 'asia-south1';

const embed = async (text, taskType = 'RETRIEVAL_QUERY') => {
  const res = await getVertexClient(EMBEDDING_LOCATION).models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { taskType, outputDimensionality: 768 }
  });
  return res.embeddings[0].values;
};

console.log(`🤖 LLM provider: ${provider === 'groq' ? 'Groq' : `Vertex AI (${GEMINI_MODEL})`}`);

module.exports = { chat, chatJSON, embed, transcribe };
