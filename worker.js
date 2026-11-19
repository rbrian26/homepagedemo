// Runs only for /ta-demo/* (see run_worker_first in wrangler.jsonc); everything else is served straight from dist/.
import { onRequest } from './functions/ta-demo/_middleware.js';

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/ta-demo' || pathname.startsWith('/ta-demo/')) {
      return onRequest({ request, env, waitUntil: (p) => ctx.waitUntil(p), next: () => env.ASSETS.fetch(request) });
    }
    return env.ASSETS.fetch(request);
  },
};
