import { onRequest } from '../functions/ta-demo/_middleware.js';
import assert from 'node:assert';

const store = new Map();
const env = {
  SESSION_SECRET: 'testsecret', ADMIN_KEY: 'adm',
  TA_DEMO_USERS: JSON.stringify([{ pw: 'maple-river-42', name: 'Chris Reite', org: 'Penn State' }, { pw: 'old-one-11', name: 'Old', org: 'X', expires: '2020-01-01' }]),
  DEMO_LOG: { put: async (k, v) => store.set(k, v), delete: async (k) => store.delete(k), list: async ({ prefix } = {}) => ({ keys: [...store.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name })) }), get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null) },
};
const run = (path, init = {}) => onRequest({ request: new Request('https://x.test' + path, init), env, waitUntil: () => {}, next: async () => new Response('PROTECTED') });
const form = (o) => ({ method: 'POST', body: new URLSearchParams(o) });

let r = await run('/ta-demo/logo.png'); assert.equal(await r.text(), 'PROTECTED');
r = await run('/ta-demo/'); assert.equal(r.status, 200); assert.ok((await r.text()).includes('Your password'), 'login page when anonymous');
r = await run('/ta-demo/index.html'); assert.equal(r.status, 401, 'static asset blocked');
r = await run('/ta-demo/_login', form({ pw: 'wrong' })); assert.equal(r.status, 401);
r = await run('/ta-demo/_login', form({ pw: 'old-one-11' })); assert.equal(r.status, 401, 'expired');
r = await run('/ta-demo/_login', form({ pw: ' Maple-River-42 ' })); assert.equal(r.status, 303);
const cookie = r.headers.get('Set-Cookie').split(';')[0];
r = await run('/ta-demo/', { headers: { Cookie: cookie } }); assert.equal(await r.text(), 'PROTECTED');
r = await run('/ta-demo/_me', { headers: { Cookie: cookie } }); assert.equal((await r.json()).name, 'Chris Reite');
r = await run('/ta-demo/', { headers: { Cookie: cookie.slice(0, -2) + 'xx' } }); assert.ok((await r.text()).includes('Your password'), 'tampered cookie rejected');
r = await run('/ta-demo/_event', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'play', detail: 'Series: V1' }) }); assert.equal(r.status, 200);
r = await run('/ta-demo/_event', { method: 'POST', body: '{}' }); assert.equal(r.status, 401, 'event needs session');
r = await run('/ta-demo/_request', form({ name: 'Pat', email: 'pat@u.edu', org: 'U' })); assert.equal(r.status, 200);
r = await run('/ta-demo/_request', form({ name: 'Bot', email: 'b@u.edu', org: 'U', website: 'spam' })); assert.equal(r.status, 400);
r = await run('/ta-demo/_admin?key=nope'); assert.equal(r.status, 401);
r = await run('/ta-demo/_admin?key=adm'); const t = await r.text(); assert.ok(t.includes('Chris Reite') && t.includes('Series: V1') && t.includes('pat@u.edu'));
r = await run('/ta-demo/_admin?key=adm&format=csv'); assert.ok((await r.text()).startsWith('time,type'));

// --- admin-created logins
const adm = (o) => run('/ta-demo/_admin', form({ key: 'adm', ...o }));
r = await run('/ta-demo/_admin', form({ key: 'nope', action: 'add', name: 'X', org: 'Y' })); assert.equal(r.status, 401, 'admin POST needs key');
r = await adm({ action: 'add', name: 'Dana Lee', org: 'State U', email: 'dana@state.edu' }); assert.equal(r.status, 303);
const id = new URL(r.headers.get('Location'), 'https://x.test').searchParams.get('created');
const rec = JSON.parse(store.get('user:' + id)); assert.ok(/^[a-z]+-[a-z]+-\d\d$/.test(rec.pw));
r = await run(`/ta-demo/_admin?key=adm&created=${id}`); const t2 = await r.text(); assert.ok(t2.includes(rec.pw) && t2.includes('Dana Lee') && t2.includes('Active'), 'invite shown');
r = await run('/ta-demo/_login', form({ pw: rec.pw.toUpperCase() })); assert.equal(r.status, 303, 'admin-made login works');
const c2 = r.headers.get('Set-Cookie').split(';')[0];
r = await run('/ta-demo/', { headers: { Cookie: c2 } }); assert.equal(await r.text(), 'PROTECTED');
await adm({ action: 'revoke', id });
r = await run('/ta-demo/', { headers: { Cookie: c2 } }); assert.equal(r.status, 401, 'revoked session cut off');
r = await run('/ta-demo/_login', form({ pw: rec.pw })); assert.equal(r.status, 401, 'revoked cannot sign in');
await adm({ action: 'restore', id });
r = await run('/ta-demo/_login', form({ pw: rec.pw })); assert.equal(r.status, 303, 'restored');
await adm({ action: 'expires', id, expires: '2020-01-01' });
r = await run('/ta-demo/_login', form({ pw: rec.pw })); assert.equal(r.status, 401, 'expired');
await adm({ action: 'delete', id }); assert.ok(!store.has('user:' + id));
r = await adm({ action: 'add', name: '', org: '' }); assert.ok(r.headers.get('Location').includes('err='));
console.log('all middleware tests passed');
