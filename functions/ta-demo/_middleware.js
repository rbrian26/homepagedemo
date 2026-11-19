// Cloudflare Pages Function: gates everything under /ta-demo/*
// Env (Pages > Settings > Variables and Secrets):
//   TA_DEMO_USERS   JSON array: [{"pw":"maple-river-42","name":"Chris Reite","org":"Penn State","expires":"2027-01-31"}]
//   SESSION_SECRET  long random string
//   ADMIN_KEY       password for /ta-demo/_admin
//   RESEND_API_KEY  (optional) for email alerts;  NOTIFY_TO, NOTIFY_FROM
// KV binding (optional but needed for the dashboard): DEMO_LOG
import { loginPage } from './_login-page.js';

const COOKIE = 'ta_session';
const DAYS = 14;
const enc = new TextEncoder();

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sign(secret, data) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data))));
}
async function sha(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
function same(a, b) { let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0); return d === 0; }

async function makeSession(env, user) {
  const payload = b64u(enc.encode(JSON.stringify({ n: user.name, o: user.org, e: Date.now() + DAYS * 864e5 })));
  return `${payload}.${await sign(env.SESSION_SECRET, payload)}`;
}
async function readSession(env, request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m || !env.SESSION_SECRET) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig || !same(enc.encode(sig), enc.encode(await sign(env.SESSION_SECRET, payload)))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    return s.e > Date.now() ? s : null;
  } catch { return null; }
}

function users(env) { try { return JSON.parse(env.TA_DEMO_USERS || '[]'); } catch { return []; } }
async function findUser(env, pw) {
  const want = await sha(pw.trim().toLowerCase());
  let hit = null;
  for (const u of users(env)) { // no early exit: constant work per attempt
    const ok = same(want, await sha(String(u.pw).trim().toLowerCase()));
    if (ok && (!u.expires || new Date(u.expires + 'T23:59:59') > new Date())) hit = u;
  }
  return hit;
}

async function record(ctx, type, who, extra = {}) {
  const { env, request } = ctx;
  const evt = { t: new Date().toISOString(), type, name: who?.name || extra.name || '', org: who?.org || extra.org || '', country: request.headers.get('CF-IPCountry') || '', ...extra };
  const jobs = [];
  if (env.DEMO_LOG) jobs.push(env.DEMO_LOG.put(`evt:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, JSON.stringify(evt), { expirationTtl: 60 * 60 * 24 * 400 }));
  const mailable = { login: 'logged in', request: 'requested access', badpw: null }[type];
  if (mailable && env.RESEND_API_KEY && env.NOTIFY_TO) {
    const line = `${evt.name || 'Someone'}${evt.org ? ' (' + evt.org + ')' : ''} ${mailable}${evt.email ? ' — ' + evt.email : ''}${evt.referrer ? ' [via ' + evt.referrer + ']' : ''}`;
    jobs.push(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.NOTIFY_FROM || 'Demo alerts <alerts@blueseatstudios.com>', to: [env.NOTIFY_TO], subject: `TA demo: ${line}`, text: `${line}\n${evt.t}\nCountry: ${evt.country}\n\nDashboard: ${new URL(request.url).origin}/ta-demo/_admin` }),
    }).catch(() => {}));
  }
  ctx.waitUntil(Promise.all(jobs));
}

const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...headers } });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function adminPage(ctx, url) {
  const { env } = ctx;
  const key = url.searchParams.get('key') || '';
  if (!env.ADMIN_KEY || !same(await sha(key), await sha(env.ADMIN_KEY))) {
    return html('<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:Quicksand,system-ui;padding:40px"><form><b>Admin key</b><br><input name="key" type="password" autofocus> <button>Open</button></form>', 401);
  }
  const rows = [];
  if (env.DEMO_LOG) {
    const list = await env.DEMO_LOG.list({ prefix: 'evt:', limit: 1000 });
    const vals = await Promise.all(list.keys.map((k) => env.DEMO_LOG.get(k.name, 'json')));
    rows.push(...vals.filter(Boolean).sort((a, b) => (a.t < b.t ? 1 : -1)));
  }
  if (url.searchParams.get('format') === 'csv') {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['time,type,name,org,email,detail,country', ...rows.map((r) => [r.t, r.type, r.name, r.org, r.email, r.detail, r.country].map(q).join(','))].join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="ta-demo-log.csv"', 'Cache-Control': 'no-store' } });
  }
  const logins = rows.filter((r) => r.type === 'login');
  const byPerson = {};
  for (const r of rows) { if (!r.name) continue; const p = (byPerson[r.name + '|' + r.org] ??= { name: r.name, org: r.org, logins: 0, plays: 0, last: r.t }); if (r.type === 'login') p.logins++; if (r.type === 'play') p.plays++; if (r.t > p.last) p.last = r.t; }
  const people = Object.values(byPerson).sort((a, b) => (a.last < b.last ? 1 : -1));
  const fmt = (t) => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  return html(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TA demo activity</title>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap" rel="stylesheet">
<style>body{font-family:Quicksand,system-ui;margin:0;background:#f4f9fc;color:#12303d}header{background:#096f9c;color:#fff;padding:22px 32px}h1{margin:0;font-size:24px}main{padding:28px 32px;max-width:1100px;margin:auto}
.stats{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px}.s{background:#fff;border-radius:16px;padding:18px 24px;min-width:140px}.s b{display:block;font-size:32px;color:#096f9c}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;margin-bottom:32px}th,td{text-align:left;padding:12px 16px;border-bottom:1px solid #e6eff4;font-size:14px}th{background:#e8f3f9}
h2{margin:0 0 12px}a{color:#096f9c;font-weight:700}</style></head><body>
<header><h1>Threat Assessment demo activity</h1></header><main>
<div class="stats"><div class="s"><b>${people.length}</b>people</div><div class="s"><b>${logins.length}</b>logins</div><div class="s"><b>${rows.filter((r) => r.type === 'play').length}</b>video plays</div><div class="s"><b>${rows.filter((r) => r.type === 'request').length}</b>access requests</div></div>
<h2>People</h2><table><tr><th>Name</th><th>Organization</th><th>Logins</th><th>Plays</th><th>Last seen</th></tr>${people.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.org)}</td><td>${p.logins}</td><td>${p.plays}</td><td>${esc(fmt(p.last))}</td></tr>`).join('') || '<tr><td colspan=5>Nothing yet</td></tr>'}</table>
<h2>Activity <a href="?key=${encodeURIComponent(key)}&format=csv">Download CSV</a></h2><table><tr><th>When</th><th>Event</th><th>Who</th><th>Detail</th></tr>${rows.slice(0, 300).map((r) => `<tr><td>${esc(fmt(r.t))}</td><td>${esc(r.type)}</td><td>${esc(r.name)}${r.org ? ' · ' + esc(r.org) : ''}${r.email ? '<br>' + esc(r.email) : ''}</td><td>${esc(r.detail)}</td></tr>`).join('') || '<tr><td colspan=4>Nothing yet</td></tr>'}</table>
</main></body></html>`);
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const sub = url.pathname.replace(/^\/ta-demo/, '').replace(/\/+$/, '') || '/';

  if (sub === '/logo.png') return ctx.next(); // public: used by the sign-in page
  if (sub === '/_admin') return adminPage(ctx, url);

  if (sub === '/_logout') return new Response(null, { status: 303, headers: { Location: '/ta-demo/', 'Set-Cookie': `${COOKIE}=; Path=/ta-demo; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });

  if (sub === '/_login' && request.method === 'POST') {
    const form = await request.formData();
    const user = await findUser(env, String(form.get('pw') || ''));
    if (!user) {
      await new Promise((r) => setTimeout(r, 500));
      await record(ctx, 'badpw', null, { detail: 'failed attempt' });
      return html(loginPage('<div class="err">That password didn\'t match. Check the email we sent, or request access below.</div>'), 401);
    }
    await record(ctx, 'login', user);
    return new Response(null, { status: 303, headers: { Location: '/ta-demo/', 'Set-Cookie': `${COOKIE}=${await makeSession(env, user)}; Path=/ta-demo; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax` } });
  }

  if (sub === '/_request' && request.method === 'POST') {
    const f = await request.formData();
    const clip = (k, n) => String(f.get(k) || '').trim().slice(0, n);
    const email = clip('email', 200);
    if (f.get('website') || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !clip('name', 120)) return html(loginPage('<div class="err">Please fill in name, email, and organization.</div>'), 400);
    const ses = await readSession(env, request);
    await record(ctx, 'request', null, { name: clip('name', 120), org: clip('org', 160), email, referrer: ses ? `${ses.n}, ${ses.o}` : '' });
    return html(loginPage('<div class="ok">Thanks. We\'ll email you a password shortly.</div>'));
  }

  const ses = await readSession(env, request);
  if (!ses) return html(loginPage(), request.method === 'GET' && sub === '/' ? 200 : 401);

  if (sub === '/_me') return json({ name: ses.n, org: ses.o });
  if (sub === '/_event' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    await record(ctx, String(b.type || 'play').slice(0, 20), { name: ses.n, org: ses.o }, { detail: String(b.detail || '').slice(0, 200) });
    return json({ ok: true });
  }

  const res = await ctx.next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}
