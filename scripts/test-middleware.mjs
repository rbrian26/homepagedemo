import { onRequest } from '../functions/ta-demo/_middleware.js';
import assert from 'node:assert';

const store = new Map();
const env = {
  SESSION_SECRET: 'testsecret', ADMIN_KEY: 'adm',
  TA_DEMO_USERS: JSON.stringify([{ pw: 'maple-river-42', name: 'Chris Reite', org: 'Penn State' }, { pw: 'old-one-11', name: 'Old', org: 'X', expires: '2020-01-01' }]),
  DEMO_LOG: { put: async (k, v) => store.set(k, v), list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }), get: async (k) => JSON.parse(store.get(k)) },
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
console.log('all middleware tests passed');
