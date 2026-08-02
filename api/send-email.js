// Vercel serverless function — POST /api/send-email
// Sends lead-capture (from Tanya) and contact-form emails via Resend.
// Requires env var RESEND_API_KEY set in the Vercel project settings.
// NOTE: the "from" address must be on a domain verified in your Resend account.

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 5; // max requests per IP per window
const rateLimitStore = new Map(); // best-effort only — resets on cold start

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = { name: 100, company: 100, organisation: 100, email: 150, phone: 30, intent: 30, message: 3000 };

function clean(str, max) {
  if (str == null) return '';
  return String(str).trim().slice(0, max);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests — please try again later.' });
    return;
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server' });
    return;
  }

  try {
    const body = req.body || {};
    const { type } = body;
    const isLead = type === 'lead';

    // Honeypot: hidden field bots tend to fill, humans never see it.
    if (body.website) {
      res.status(200).json({ ok: true }); // silently accept, don't send
      return;
    }

    const name = clean(body.name, MAX_LEN.name);
    const email = clean(body.email, MAX_LEN.email);
    const company = clean(body.company, MAX_LEN.company);
    const organisation = clean(body.organisation, MAX_LEN.organisation);
    const phone = clean(body.phone, MAX_LEN.phone);
    const intent = clean(body.intent, MAX_LEN.intent);
    const message = clean(body.message, MAX_LEN.message);

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'A valid email is required' });
      return;
    }
    if (isLead && !company) {
      res.status(400).json({ error: 'Company is required for lead capture' });
      return;
    }
    if (!isLead && !message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const subject = isLead
      ? `New lead from Tanya — ${name} (${intent || 'unspecified'})`
      : `New contact form submission — ${name}`;

    const html = isLead
      ? `
        <h2>New lead captured by Tanya</h2>
        <p><b>Name:</b> ${escapeHtml(name)}</p>
        <p><b>Company:</b> ${escapeHtml(company)}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Phone:</b> ${escapeHtml(phone)}</p>
        <p><b>Intent:</b> ${escapeHtml(intent || 'unspecified')}</p>
        <p style="color:#888; font-size:13px;">Captured via Tanya on ind.innov8-labs.in</p>
      `
      : `
        <h2>New contact form submission</h2>
        <p><b>Name:</b> ${escapeHtml(name)}</p>
        <p><b>Organisation:</b> ${escapeHtml(organisation)}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Message:</b><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        <p style="color:#888; font-size:13px;">Submitted via the contact form on ind.innov8-labs.in</p>
      `;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Ind Innov8 Website <onboarding@resend.dev>',
        to: [process.env.LEAD_NOTIFY_EMAIL || 'krish@innov8-labs.com'],
        reply_to: email || undefined,
        subject,
        html
      })
    });

    if (!resendResp.ok) {
      const detail = await resendResp.text();
      res.status(502).json({ error: 'Resend API error', detail });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown server error' });
  }
}
