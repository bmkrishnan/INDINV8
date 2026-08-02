// Vercel serverless function — POST /api/send-email
// Sends lead-capture (from Tanya) and contact-form emails via Resend.
// Requires env var RESEND_API_KEY set in the Vercel project settings.
// NOTE: the "from" address must be on a domain verified in your Resend account
// (e.g. notifications@innov8-labs.in) — until verified, Resend only allows
// sending to the account owner's own email using the sandbox "onboarding@resend.dev" sender.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server' });
    return;
  }

  try {
    const { type, name, company, organisation, email, phone, intent, message } = req.body || {};
    const isLead = type === 'lead';

    const subject = isLead
      ? `New lead from Tanya — ${name || 'Unknown'} (${intent || 'unspecified'})`
      : `New contact form submission — ${name || 'Unknown'}`;

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

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
