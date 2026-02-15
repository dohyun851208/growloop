const DEFAULT_MODEL = normalizeModelName(process.env.GEMINI_MODEL);

function normalizeModelName(rawModel) {
  const fallback = 'gemini-flash-latest';
  if (!rawModel || typeof rawModel !== 'string') return fallback;

  let model = rawModel.trim();
  if (!model) return fallback;

  // Accept values like "models/gemini-flash-latest" as well.
  if (model.startsWith('models/')) {
    model = model.slice('models/'.length).trim();
  }
  return model || fallback;
}

function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapProviderError(status, providerMessage) {
  if (status === 400) return { code: 'bad_request', error: providerMessage || 'Invalid Gemini request.' };
  if (status === 401 || status === 403) {
    return { code: 'auth_error', error: providerMessage || 'Gemini authentication failed.' };
  }
  if (status === 429) return { code: 'quota_exceeded', error: 'Gemini quota exceeded.' };
  if (status >= 500) return { code: 'provider_unavailable', error: 'Gemini service unavailable.' };
  return { code: 'provider_error', error: providerMessage || `Gemini request failed (${status}).` };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, code: 'method_not_allowed', error: 'Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, code: 'auth_error', error: 'Server is missing GEMINI_API_KEY.' });
  }

  const body = typeof req.body === 'string' ? safeJsonParse(req.body) : req.body;
  const promptText = body?.promptText;
  const generationConfig = body?.generationConfig;

  if (!promptText || typeof promptText !== 'string') {
    return res.status(400).json({ ok: false, code: 'bad_request', error: 'promptText must be a non-empty string.' });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    ...(generationConfig ? { generationConfig } : {})
  };

  try {
    const providerRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const raw = await providerRes.text();
    const data = safeJsonParse(raw);

    if (!providerRes.ok) {
      const providerMessage = data?.error?.message;
      const mapped = mapProviderError(providerRes.status, providerMessage);
      return res.status(providerRes.status).json({ ok: false, ...mapped });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== 'string') {
      return res.status(502).json({ ok: false, code: 'empty_response', error: 'Gemini returned an empty response.' });
    }

    return res.status(200).json({ ok: true, text });
  } catch (error) {
    return res.status(502).json({ ok: false, code: 'network_error', error: error?.message || 'Network error while calling Gemini.' });
  }
}
