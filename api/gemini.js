import https from 'node:https';
import { URL } from 'node:url';

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

function getApiKey() {
  // Support common env var names to reduce deployment misconfig.
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
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

function getModelCandidates(baseModel) {
  const candidates = [baseModel];
  if (baseModel.includes('latest')) {
    candidates.push(baseModel.replace('-latest', ''));
  }
  // Safe fallbacks for current Gemini API naming.
  candidates.push('gemini-2.0-flash', 'gemini-1.5-flash');
  return Array.from(new Set(candidates.filter(Boolean)));
}

function getApiCandidates(model) {
  const encModel = encodeURIComponent(model);
  return [
    `https://generativelanguage.googleapis.com/v1beta/models/${encModel}:generateContent`,
    `https://generativelanguage.googleapis.com/v1/models/${encModel}:generateContent`
  ];
}

async function postJsonText(url, apiKey, payload, timeoutMs = 15000) {
  const body = JSON.stringify(payload);

  // Prefer fetch when available (Node 18+, Edge runtime). Fallback to https for older runtimes.
  if (typeof fetch === 'function') {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Keep key out of URL to reduce accidental leakage.
          'x-goog-api-key': apiKey
        },
        body,
        ...(controller ? { signal: controller.signal } : {})
      });
      const text = await res.text();
      return { status: res.status, ok: res.ok, text };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return await new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: 'POST',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-goog-api-key': apiKey
        },
        timeout: timeoutMs
      },
      (res) => {
        res.setEncoding('utf8');
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          const status = res.statusCode || 0;
          resolve({ status, ok: status >= 200 && status < 300, text: raw });
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, code: 'method_not_allowed', error: 'Use POST.' });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({ ok: false, code: 'auth_error', error: 'Server is missing GEMINI_API_KEY.' });
  }

  const body = typeof req.body === 'string' ? safeJsonParse(req.body) : req.body;
  const promptText = body?.promptText;
  const generationConfig = body?.generationConfig;

  if (!promptText || typeof promptText !== 'string') {
    return res.status(400).json({ ok: false, code: 'bad_request', error: 'promptText must be a non-empty string.' });
  }

  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    ...(generationConfig ? { generationConfig } : {})
  };

  const models = getModelCandidates(DEFAULT_MODEL);
  let lastNetworkError = null;
  let lastProviderError = null;

  for (const model of models) {
    const urls = getApiCandidates(model);
    for (const url of urls) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const providerRes = await postJsonText(url, apiKey, payload, 15000);
          const raw = providerRes.text;
          const data = safeJsonParse(raw);

          if (!providerRes.ok) {
            const providerMessage = data?.error?.message;
            const mapped = mapProviderError(providerRes.status, providerMessage);
            lastProviderError = { status: providerRes.status, mapped };

            // Auth/quota errors won't be fixed by retrying model/version.
            if (providerRes.status === 401 || providerRes.status === 403 || providerRes.status === 429) {
              return res.status(providerRes.status).json({ ok: false, ...mapped });
            }

            // Retry once for transient provider failures.
            if (providerRes.status >= 500 && attempt === 0) continue;

            // Try next model/url for likely model/version mismatch.
            if (providerRes.status === 404 || providerRes.status === 400) break;

            // Otherwise keep exploring candidates; return the last error if all fail.
            break;
          }

          const candidate = data?.candidates?.[0];
          const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
          const text = parts
            .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
            .join('')
            .trim();
          const finishReason = candidate?.finishReason || null;

          if (!text || typeof text !== 'string') {
            lastProviderError = { status: 502, mapped: { code: 'empty_response', error: 'Gemini returned an empty response.' } };
            break;
          }

          return res.status(200).json({ ok: true, text, finishReason });
        } catch (error) {
          lastNetworkError = error;
          // retry once for transient network failures
          if (attempt === 0) continue;
        }
      }
    }
  }

  if (lastProviderError) {
    return res.status(lastProviderError.status).json({ ok: false, ...lastProviderError.mapped });
  }

  return res.status(502).json({
    ok: false,
    code: 'network_error',
    error: lastNetworkError?.message || 'Network error while calling Gemini.'
  });
}
