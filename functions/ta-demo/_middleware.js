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
  const payload = b64u(enc.encode(JSON.stringify({ n: user.name, o: user.org, ...(user.id ? { u: user.id } : {}), e: Date.now() + DAYS * 864e5 })));
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
const hex = (bytes) => [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
const norm = (pw) => String(pw).trim().toLowerCase();
const userActive = (u) => !!u && !u.revoked && (!u.expires || new Date(u.expires + 'T23:59:59') > new Date());
async function findUser(env, pw) {
  const want = await sha(norm(pw));
  let hit = null;
  for (const u of users(env)) { // secret-based logins (kept for backward compatibility)
    const ok = same(want, await sha(norm(u.pw)));
    if (ok && userActive(u)) hit = u;
  }
  if (!hit && env.DEMO_LOG) { // logins created in the admin page
    const id = hex(want);
    const u = await env.DEMO_LOG.get('user:' + id, 'json');
    if (userActive(u)) hit = { ...u, id };
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

const WORDS = ['maple','river','harbor','cedar','lantern','summit','meadow','compass','willow','ember','tidewater','granite','orchard','beacon','juniper','canyon','sparrow','amber','quartz','driftwood','falcon','pebble','thistle','marble','copper','violet','cobalt','saddle','prairie','lagoon','walnut','hazel','sailor','timber','velvet','anchor','cricket','mosaic','nectar','plume','rowan','sunset','tundra','umber','wicker','yonder','zephyr','bramble','cascade','dune','echo','fjord','glacier','heron','indigo','jasmine','kettle','lilac','mustard','nutmeg','otter','poppy','raven','spruce'];
const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const makePw = () => `${WORDS[rnd(WORDS.length)]}-${WORDS[rnd(WORDS.length)]}-${WORDS[rnd(WORDS.length)]}-${10 + rnd(90)}`;
const inviteText = (u, origin) => `Subject: Threat assessment training preview for ${u.org}

Hi ${String(u.name).split(' ')[0]},

Here's the private preview we talked about: the full threat assessment training, the upcoming Campus Culture Builder video series, and licensing options.

${origin}/ta-demo/
Your password: ${u.pw}

Feel free to ask me for a password for any colleagues who should see it. Happy to walk through it on a call too: calendly.com/rachelbrian

Rachel`;

async function adminPage(ctx, url) {
  const { env, request } = ctx;
  const post = request.method === 'POST' ? await request.formData() : null;
  const key = (post && String(post.get('key') || '')) || url.searchParams.get('key') || '';
  if (!env.ADMIN_KEY || !same(await sha(key), await sha(env.ADMIN_KEY))) {
    return html('<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:Quicksand,system-ui;padding:40px"><form method="get"><b>Admin key</b><br><input name="key" type="password" autofocus> <button>Open</button></form>', 401);
  }
  const base = `${url.pathname}?key=${encodeURIComponent(key)}`;
  const kv = env.DEMO_LOG;

  if (post && kv) {
    const act = String(post.get('action') || '');
    const clip = (k, n) => String(post.get(k) || '').trim().slice(0, n);
    if (act === 'add') {
      const name = clip('name', 120), org = clip('org', 160), email = clip('email', 200);
      let expires = clip('expires', 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) expires = '';
      if (!name || !org) return new Response(null, { status: 303, headers: { Location: `${base}&err=${encodeURIComponent('Name and school are both needed.')}#add` } });
      let pw, id;
      do { pw = makePw(); id = hex(await sha(norm(pw))); } while (await kv.get('user:' + id));
      await kv.put('user:' + id, JSON.stringify({ pw, name, org, email, ...(expires ? { expires } : {}), created: new Date().toISOString() }));
      return new Response(null, { status: 303, headers: { Location: `${base}&created=${id}#invite` } });
    }
    const id = clip('id', 80).replace(/[^a-f0-9]/g, '');
    const u = id && await kv.get('user:' + id, 'json');
    if (u) {
      if (act === 'revoke') await kv.put('user:' + id, JSON.stringify({ ...u, revoked: true }));
      if (act === 'restore') { const { revoked, ...rest } = u; await kv.put('user:' + id, JSON.stringify(rest)); }
      if (act === 'delete') await kv.delete('user:' + id);
      if (act === 'expires') { const d = clip('expires', 10); const { expires, ...rest } = u; await kv.put('user:' + id, JSON.stringify(/^\d{4}-\d{2}-\d{2}$/.test(d) ? { ...rest, expires: d } : rest)); }
    }
    return new Response(null, { status: 303, headers: { Location: `${base}#people` } });
  }

  const rows = [];
  const logins2 = [];
  if (kv) {
    const list = await kv.list({ prefix: 'evt:', limit: 1000 });
    const vals = await Promise.all(list.keys.map((k) => kv.get(k.name, 'json')));
    rows.push(...vals.filter(Boolean).sort((a, b) => (a.t < b.t ? 1 : -1)));
    const ul = await kv.list({ prefix: 'user:', limit: 1000 });
    const uv = await Promise.all(ul.keys.map(async (k) => { const v = await kv.get(k.name, 'json'); return v && { ...v, id: k.name.slice(5) }; }));
    logins2.push(...uv.filter(Boolean).sort((a, b) => ((a.created || '') < (b.created || '') ? 1 : -1)));
  }
  if (url.searchParams.get('format') === 'csv') {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['time,type,name,org,email,detail,country', ...rows.map((r) => [r.t, r.type, r.name, r.org, r.email, r.detail, r.country].map(q).join(','))].join('\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="ta-demo-log.csv"', 'Cache-Control': 'no-store' } });
  }
  const logins = rows.filter((r) => r.type === 'login');
  const byPerson = {};
  for (const r of rows) { if (!r.name) continue; const p = (byPerson[r.name + '|' + r.org] ??= { name: r.name, org: r.org, logins: 0, plays: 0, last: r.t }); if (r.type === 'login') p.logins++; if (r.type === 'play') p.plays++; if (r.t > p.last) p.last = r.t; }
  const stat = (name, org) => byPerson[name + '|' + org] || { logins: 0, plays: 0, last: '' };
  const fmt = (t) => t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
  const fmtD = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { dateStyle: 'medium' });

  const created = url.searchParams.get('created');
  const cu = created && logins2.find((u) => u.id === created);
  const err = url.searchParams.get('err') || '';
  const have = new Set(logins2.map((u) => (u.email || '').toLowerCase()).filter(Boolean));
  const seenReq = new Set();
  const reqs = rows.filter((r) => r.type === 'request' && r.email && !have.has(r.email.toLowerCase()) && !seenReq.has(r.email.toLowerCase()) && seenReq.add(r.email.toLowerCase())).slice(0, 20);
  const hid = (id) => `<input type="hidden" name="key" value="${esc(key)}"><input type="hidden" name="id" value="${esc(id)}">`;
  const pf = (n) => esc(url.searchParams.get(n) || '');
  const origin = env.PUBLIC_URL || 'https://blueseatstudios.com';
  const secretUsers = users(env);

  return html(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TA demo admin</title>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap" rel="stylesheet">
<style>body{font-family:Quicksand,system-ui;margin:0;background:#f4f9fc;color:#12303d}header{background:#096f9c;color:#fff;padding:22px 32px}h1{margin:0;font-size:24px}main{padding:28px 32px;max-width:1100px;margin:auto}
.stats{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px}.s{background:#fff;border-radius:16px;padding:18px 24px;min-width:140px}.s b{display:block;font-size:32px;color:#096f9c}
.card{background:#fff;border-radius:16px;padding:20px 24px;margin-bottom:28px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;margin-bottom:32px}th,td{text-align:left;padding:12px 16px;border-bottom:1px solid #e6eff4;font-size:14px;vertical-align:middle}th{background:#e8f3f9}
h2{margin:0 0 12px}a{color:#096f9c;font-weight:700}
input,textarea{font:inherit;padding:10px 12px;border:2px solid #cfe0ea;border-radius:10px;background:#fff}input:focus,textarea:focus{outline:none;border-color:#096f9c}
label{display:block;font-size:12px;font-weight:700;color:#5a7685;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em}
.f{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}.f>div{flex:1;min-width:160px}.f input{width:100%;box-sizing:border-box}
.btn{background:#f97c53;color:#fff;border:0;border-radius:999px;padding:11px 22px;font:inherit;font-weight:700;cursor:pointer}.btn.sm{padding:6px 14px;font-size:13px}.btn.ghost{background:#e8f3f9;color:#096f9c}.btn.red{background:#fff;color:#b3402a;border:2px solid #f0c9bd}
.err{background:#fdeee9;color:#b3402a;padding:10px 14px;border-radius:10px;margin-bottom:12px;font-weight:700}
.ok{background:#e8f6ee;border:2px solid #2e9d5c;border-radius:14px;padding:18px 20px;margin-bottom:28px}.ok textarea{width:100%;box-sizing:border-box;height:250px;margin:10px 0}
.tag{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;background:#e8f6ee;color:#1e7a45}.tag.off{background:#fdeee9;color:#b3402a}.tag.sec{background:#eef0f2;color:#5a7685}
form.inline{display:inline;margin:0}.acts{white-space:nowrap}code{background:#eef5f9;padding:2px 6px;border-radius:6px}</style></head><body>
<header><h1>Threat Assessment demo admin</h1></header><main>
${cu ? `<div class="ok" id="invite"><b>Login created for ${esc(cu.name)} (${esc(cu.org)}).</b> Copy this invite email:<textarea id="inv" readonly>${esc(inviteText(cu, origin))}</textarea><button class="btn" type="button" onclick="navigator.clipboard.writeText(document.getElementById('inv').value);this.textContent='Copied'">Copy invite</button></div>` : ''}
<div class="stats"><div class="s"><b>${logins2.length + secretUsers.length}</b>logins</div><div class="s"><b>${logins.length}</b>sign-ins</div><div class="s"><b>${rows.filter((r) => r.type === 'play').length}</b>video plays</div><div class="s"><b>${rows.filter((r) => r.type === 'request').length}</b>access requests</div></div>
<div class="card" id="add"><h2>Add a person</h2>${err ? `<div class="err">${esc(err)}</div>` : ''}${kv ? '' : '<div class="err">DEMO_LOG storage isn\'t connected, so logins can\'t be saved.</div>'}
<form method="post" class="f"><input type="hidden" name="key" value="${esc(key)}"><input type="hidden" name="action" value="add">
<div><label>Name</label><input name="name" value="${pf('name')}" required></div><div><label>School / organization</label><input name="org" value="${pf('org')}" required></div>
<div><label>Email (optional)</label><input name="email" type="email" value="${pf('email')}"></div><div style="flex:0 0 170px"><label>Access ends (optional)</label><input name="expires" type="date"></div>
<button class="btn">Create login</button></form></div>
${reqs.length ? `<h2>Access requests</h2><table><tr><th>Name</th><th>Organization</th><th>Email</th><th>Asked by</th><th></th></tr>${reqs.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.org)}</td><td>${esc(r.email)}</td><td>${esc(r.referrer)}</td><td><a href="${esc(base)}&name=${encodeURIComponent(r.name || '')}&org=${encodeURIComponent(r.org || '')}&email=${encodeURIComponent(r.email || '')}#add">Create login</a></td></tr>`).join('')}</table>` : ''}
<h2 id="people">People with access</h2><table><tr><th>Name</th><th>Organization</th><th>Status</th><th>Sign-ins</th><th>Plays</th><th>Last seen</th><th></th></tr>${logins2.map((u) => { const st = stat(u.name, u.org); const exp = u.expires && new Date(u.expires + 'T23:59:59') < new Date(); return `<tr><td>${esc(u.name)}</td><td>${esc(u.org)}</td><td>${u.revoked ? '<span class="tag off">Revoked</span>' : exp ? '<span class="tag off">Expired</span>' : '<span class="tag">Active</span>'}${u.expires ? `<br><small>ends ${esc(fmtD(u.expires))}</small>` : ''}</td><td>${st.logins}</td><td>${st.plays}</td><td>${esc(fmt(st.last))}</td><td class="acts"><a href="${esc(base)}&created=${u.id}#invite">Invite</a> <form class="inline" method="post"><input type="hidden" name="action" value="${u.revoked ? 'restore' : 'revoke'}">${hid(u.id)}<button class="btn sm ghost">${u.revoked ? 'Restore' : 'Revoke'}</button></form> <form class="inline" method="post" onsubmit="return confirm('Delete this login for good?')"><input type="hidden" name="action" value="delete">${hid(u.id)}<button class="btn sm red">Delete</button></form></td></tr>`; }).join('')}${secretUsers.map((u) => { const st = stat(u.name, u.org); return `<tr><td>${esc(u.name)}</td><td>${esc(u.org)}</td><td><span class="tag sec">Set in Cloudflare</span></td><td>${st.logins}</td><td>${st.plays}</td><td>${esc(fmt(st.last))}</td><td></td></tr>`; }).join('') || ''}${!logins2.length && !secretUsers.length ? '<tr><td colspan=7>No logins yet. Add one above.</td></tr>' : ''}</table>
<h2>Activity <a href="${esc(base)}&format=csv">Download CSV</a></h2><table><tr><th>When</th><th>Event</th><th>Who</th><th>Detail</th></tr>${rows.slice(0, 300).map((r) => `<tr><td>${esc(fmt(r.t))}</td><td>${esc(r.type)}</td><td>${esc(r.name)}${r.org ? ' · ' + esc(r.org) : ''}${r.email ? '<br>' + esc(r.email) : ''}</td><td>${esc(r.detail)}</td></tr>`).join('') || '<tr><td colspan=4>Nothing yet</td></tr>'}</table>
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
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const tries = env.DEMO_LOG ? Number(await env.DEMO_LOG.get('rl:' + ip)) || 0 : 0;
    if (tries >= 10) return html(loginPage('<div class="err">Too many attempts. Please wait 15 minutes and try again, or email licensing@blueseatstudios.com.</div>'), 429);
    const user = await findUser(env, String(form.get('pw') || ''));
    if (!user) {
      if (env.DEMO_LOG) await env.DEMO_LOG.put('rl:' + ip, String(tries + 1), { expirationTtl: 900 });
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
  if (ses.u && env.DEMO_LOG && !userActive(await env.DEMO_LOG.get('user:' + ses.u, 'json'))) {
    return html(loginPage('<div class="err">Your access has ended. Please contact licensing@blueseatstudios.com.</div>'), 401, { 'Set-Cookie': `${COOKIE}=; Path=/ta-demo; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  }

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
