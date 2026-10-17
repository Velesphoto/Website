// Veles Photography contact form -> email to andrew@velesphoto.com
// Cloudflare Worker using the Email Service "send_email" binding (see wrangler.jsonc).

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

// Single-line fields: strip line breaks so nobody can inject extra email headers.
const line = (v, max) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
    if (!allowed.includes(origin)) return json({ error: 'Forbidden' }, 403, cors);

    let d;
    try { d = await request.json(); } catch { return json({ error: 'Bad request' }, 400, cors); }

    // Honeypot: real visitors never fill this hidden field, bots usually do.
    if (d.website) return json({ ok: true }, 200, cors);

    const name = line(d.name, 100);
    const email = line(d.email, 200);
    const phone = line(d.phone, 50);
    const service = line(d.service, 100) || 'General';
    const message = String(d.message ?? '').trim().slice(0, 4000);

    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: 'Please enter your name and a valid email address.' }, 400, cors);
    }

    const text = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || '(not given)'}`,
      `Service: ${service}`,
      '',
      'Property address and details:',
      message || '(none)',
    ].join('\n');

    try {
      await env.EMAIL.send({
        to: env.TO_EMAIL,
        from: { email: env.FROM_EMAIL, name: 'Veles Photography Website' },
        replyTo: email,
        subject: `Shoot request: ${service} (${name})`,
        text,
      });
    } catch (e) {
      console.error('send failed', e && e.code, e && e.message);
      return json({ error: 'We could not send your request just now.' }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  },
};
