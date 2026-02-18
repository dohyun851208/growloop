const MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite')
  .replace(/^models\//, '')
  .replace(/\\[rn]/g, '')
  .replace(/[\r\n]/g, '')
  .trim();
const PROVIDER_TIMEOUT_MS = Math.max(5000, Number(process.env.GEMINI_PROVIDER_TIMEOUT_MS || 55000) || 55000);

export const config = {
  runtime: 'edge',
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no'
};
const ENCODER = new TextEncoder();

function getApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
}

function toHttpStatus(code, fallback = 502) {
  if (code === 'auth_error') return 500;
  if (code === 'bad_request') return 400;
  if (code === 'quota_exceeded') return 429;
  if (code === 'provider_timeout') return 504;
  if (code === 'provider_unavailable') return 503;
  if (code === 'network_error') return 502;
  if (code === 'parse_error') return 502;
  if (code === 'empty_response') return 502;
  return fallback;
}

function sseChunk(event, data) {
  return ENCODER.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function createSseSender(writer) {
  let writeQueue = Promise.resolve();
  return (event, data) => {
    writeQueue = writeQueue.then(() => writer.write(sseChunk(event, data)));
    return writeQueue;
  };
}

export default async function handler(req) {
  const startedAt = Date.now();
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, code: 'method_not_allowed', error: 'Use POST.' }), {
      status: 405,
      headers: JSON_HEADERS
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, code: 'auth_error', error: 'Server is missing GEMINI_API_KEY.' }), {
      status: 500,
      headers: JSON_HEADERS
    });
  }

  let body;
  try { body = await req.json(); } catch { body = null; }
  const promptText = body?.promptText;
  if (!promptText || typeof promptText !== 'string') {
    return new Response(JSON.stringify({ ok: false, code: 'bad_request', error: 'promptText must be a non-empty string.' }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  const generationConfig = body?.generationConfig || undefined;
  const wantsSse = body?.stream === true || String(req.headers.get('accept') || '').toLowerCase().includes('text/event-stream');
  if (wantsSse) {
    return streamGeminiResponse({ promptText, generationConfig, apiKey, startedAt });
  }

  const result = await requestGeminiText({ promptText, generationConfig, apiKey, startedAt });
  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, code: result.code, error: result.error }), {
      status: toHttpStatus(result.code, result.status || 502),
      headers: JSON_HEADERS
    });
  }

  return new Response(JSON.stringify({ ok: true, text: result.text }), {
    status: 200,
    headers: JSON_HEADERS
  });
}

function streamGeminiResponse({ promptText, generationConfig, apiKey, startedAt }) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const send = createSseSender(writer);
  const keepaliveMs = 10000;
  let keepaliveTimer = null;

  (async () => {
    try {
      await send('ready', { ok: true, model: MODEL });
      keepaliveTimer = setInterval(() => {
        send('keepalive', { t: Date.now() }).catch(() => { });
      }, keepaliveMs);

      const result = await requestGeminiStream({
        promptText,
        generationConfig,
        apiKey,
        startedAt,
        onToken: async (token) => {
          if (token) await send('token', { text: token });
        }
      });
      if (!result.ok) {
        await send('error', { code: result.code, error: result.error });
        return;
      }

      await send('done', { ok: true, text: result.text });
    } catch (e) {
      await send('error', {
        code: 'network_error',
        error: e?.message || 'Network error while calling Gemini.'
      }).catch(() => { });
    } finally {
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      try { await writer.close(); } catch { }
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: SSE_HEADERS
  });
}

function extractSseDataFrame(frame) {
  if (!frame) return null;
  const lines = String(frame).split('\n');
  const dataLines = [];
  for (const rawLine of lines) {
    const line = String(rawLine || '').trimEnd();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  return dataLines.join('\n');
}

function extractTextFromGeminiChunk(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  let text = '';
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (part && typeof part.text === 'string') text += part.text;
    }
  }
  return text;
}

async function requestGeminiStream({ promptText, generationConfig, apiKey, startedAt, onToken }) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    ...(generationConfig ? { generationConfig } : {})
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:streamGenerateContent?alt=sse`;
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => {
    try { controller.abort(); } catch { }
  }, PROVIDER_TIMEOUT_MS);

  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timeoutTimer);
    const msg = String(e?.message || e || '').toLowerCase();
    const isTimeout = e?.name === 'AbortError' || msg.includes('aborted') || msg.includes('timed out');
    if (isTimeout) {
      console.warn('[gemini] provider timeout', {
        model: MODEL,
        promptChars: String(promptText).length,
        timeoutMs: PROVIDER_TIMEOUT_MS
      });
      return { ok: false, code: 'provider_timeout', error: 'AI provider timed out.', status: 504 };
    }
    return { ok: false, code: 'network_error', error: e?.message || 'Network error while calling Gemini.', status: 502 };
  }

  if (!geminiRes.ok) {
    clearTimeout(timeoutTimer);
    const errText = await geminiRes.text().catch(() => '');
    let errMsg = `Gemini stream request failed (${geminiRes.status}).`;
    try { errMsg = JSON.parse(errText)?.error?.message || errMsg; } catch { }

    let code = 'provider_error';
    if (geminiRes.status === 401 || geminiRes.status === 403) code = 'auth_error';
    else if (geminiRes.status === 429) code = 'quota_exceeded';
    else if (geminiRes.status >= 500) code = 'provider_unavailable';
    else if (geminiRes.status === 400) code = 'bad_request';

    return { ok: false, code, error: errMsg, status: geminiRes.status };
  }

  const reader = geminiRes.body?.getReader?.();
  if (!reader) {
    clearTimeout(timeoutTimer);
    return { ok: false, code: 'parse_error', error: 'AI 스트림 응답을 읽을 수 없습니다.', status: 502 };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
      } else {
        buffer += decoder.decode(value, { stream: true });
      }

      buffer = buffer.replace(/\r\n/g, '\n');
      let splitAt = buffer.indexOf('\n\n');
      while (splitAt !== -1) {
        const frame = buffer.slice(0, splitAt);
        buffer = buffer.slice(splitAt + 2);

        const dataFrame = extractSseDataFrame(frame);
        if (dataFrame && dataFrame !== '[DONE]') {
          let payloadChunk = null;
          try { payloadChunk = JSON.parse(dataFrame); } catch { payloadChunk = null; }
          if (payloadChunk) {
            const chunkTextRaw = extractTextFromGeminiChunk(payloadChunk);
            if (chunkTextRaw) {
              let appendText = chunkTextRaw;
              if (fullText && chunkTextRaw.startsWith(fullText)) {
                appendText = chunkTextRaw.slice(fullText.length);
              }
              if (appendText) {
                fullText += appendText;
                if (typeof onToken === 'function') await onToken(appendText);
              }
            }
          }
        }

        splitAt = buffer.indexOf('\n\n');
      }

      if (done) break;
    }
  } catch (e) {
    const msg = String(e?.message || e || '').toLowerCase();
    const isTimeout = e?.name === 'AbortError' || msg.includes('aborted') || msg.includes('timed out');
    if (isTimeout) {
      return { ok: false, code: 'provider_timeout', error: 'AI provider timed out.', status: 504 };
    }
    return { ok: false, code: 'network_error', error: e?.message || 'Network error while reading Gemini stream.', status: 502 };
  } finally {
    clearTimeout(timeoutTimer);
    try { reader.releaseLock(); } catch { }
  }

  const text = String(fullText || '').trim();
  if (!text) {
    return { ok: false, code: 'empty_response', error: 'AI 응답이 비어 있습니다.', status: 502 };
  }

  console.info('[gemini] stream success', {
    model: MODEL,
    promptChars: String(promptText).length,
    outChars: text.length,
    elapsedMs: Date.now() - startedAt
  });
  return { ok: true, text };
}

async function requestGeminiText({ promptText, generationConfig, apiKey, startedAt }) {
  const payload = {
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    ...(generationConfig ? { generationConfig } : {})
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  let geminiRes;
  const controller = new AbortController();
  try {
    geminiRes = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }, PROVIDER_TIMEOUT_MS, controller);
  } catch (e) {
    const msg = String(e?.message || e || '').toLowerCase();
    const isTimeout = e?.name === 'AbortError' || msg.includes('aborted') || msg.includes('timed out');
    if (isTimeout) {
      console.warn('[gemini] provider timeout', {
        model: MODEL,
        promptChars: String(promptText).length,
        timeoutMs: PROVIDER_TIMEOUT_MS
      });
      return { ok: false, code: 'provider_timeout', error: 'AI provider timed out.', status: 504 };
    }
    return { ok: false, code: 'network_error', error: e?.message || 'Network error while calling Gemini.', status: 502 };
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    let errMsg = `Gemini request failed (${geminiRes.status}).`;
    try { errMsg = JSON.parse(errText)?.error?.message || errMsg; } catch { }

    let code = 'provider_error';
    if (geminiRes.status === 401 || geminiRes.status === 403) code = 'auth_error';
    else if (geminiRes.status === 429) code = 'quota_exceeded';
    else if (geminiRes.status >= 500) code = 'provider_unavailable';
    else if (geminiRes.status === 400) code = 'bad_request';

    return { ok: false, code, error: errMsg, status: geminiRes.status };
  }

  let data;
  try {
    data = await geminiRes.json();
  } catch {
    return { ok: false, code: 'parse_error', error: 'AI 응답을 파싱할 수 없습니다.', status: 502 };
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  let text = '';
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p && typeof p.text === 'string') text += p.text;
    }
  }
  text = String(text || '').trim();

  if (!text) {
    return { ok: false, code: 'empty_response', error: 'AI 응답이 비어 있습니다.', status: 502 };
  }

  console.info('[gemini] success', {
    model: MODEL,
    promptChars: String(promptText).length,
    outChars: text.length,
    elapsedMs: Date.now() - startedAt
  });
  return { ok: true, text };
}

async function fetchWithTimeout(url, options, timeoutMs, controller) {
  let timer = null;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { controller?.abort(); } catch { }
        reject(new Error(`Fetch timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([fetch(url, options), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
