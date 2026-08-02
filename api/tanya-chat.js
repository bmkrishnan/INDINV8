// Vercel serverless function — POST /api/tanya-chat
// Proxies chat messages to the Claude API so Tanya works once deployed
// (window.claude.complete only exists inside the design-tool preview sandbox).
// Requires env var ANTHROPIC_API_KEY set in the Vercel project settings.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
    return;
  }

  try {
    const { system, message, maxTokens } = req.body || {};
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens || 80,
        system: system || '',
        messages: [{ role: 'user', content: message }]
      })
    });

    if (!anthropicResp.ok) {
      const detail = await anthropicResp.text();
      res.status(502).json({ error: 'Anthropic API error', detail });
      return;
    }

    const data = await anthropicResp.json();
    const text = (data.content || []).map((b) => b.text || '').join('').trim();
    res.status(200).json({ reply: text });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown server error' });
  }
}
