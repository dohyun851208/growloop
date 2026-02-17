export const config = { runtime: 'edge' };

const MODEL = (process.env.GEMINI_MODEL || 'gemini-flash-latest').replace(/^models\//, '').trim();

function getApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, code: 'method_not_allowed', error: 'Use POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, code: 'auth_error', error: 'Server is missing GEMINI_API_KEY.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try { body = await req.json(); } catch { body = null; }
  const promptText = body?.promptText;
  if (!promptText || typeof promptText !== 'string') {
    return new Response(JSON.stringify({ ok: false, code: 'bad_request', error: 'promptText must be a non-empty string.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const generationConfig = body?.generationConfig || undefined;
  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    ...(generationConfig ? { generationConfig } : {})
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:streamGenerateContent?alt=sse`;

  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, code: 'network_error', error: e.message || 'Network error while calling Gemini.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    let errMsg = `Gemini request failed (${geminiRes.status}).`;
    try { errMsg = JSON.parse(errText)?.error?.message || errMsg; } catch {}

    let code = 'provider_error';
    if (geminiRes.status === 401 || geminiRes.status === 403) code = 'auth_error';
    else if (geminiRes.status === 429) code = 'quota_exceeded';
    else if (geminiRes.status >= 500) code = 'provider_unavailable';
    else if (geminiRes.status === 400) code = 'bad_request';

    return new Response(JSON.stringify({ ok: false, code, error: errMsg }), {
      status: geminiRes.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // SSE 스트림을 클라이언트로 그대로 전달
  const stream = new ReadableStream({
    async start(controller) {
      const reader = geminiRes.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (e) {
        // 스트림 중간 에러 시 에러 이벤트 전송
        const errChunk = new TextEncoder().encode(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        controller.enqueue(errChunk);
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
