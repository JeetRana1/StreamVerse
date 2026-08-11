# FluxiumLab — Cloudflare Media Proxy Worker

Offloads all HLS playlist + video-segment proxying from the **Google Cloud
e2-micro VM** to the **Cloudflare edge**, so streamed bytes never touch your VM
egress (and never generate surprise bandwidth bills).

The Worker accepts the **same two URL shapes** the FluxiumLab frontend already
produces, so it is a drop-in replacement:

| Shape | Example | Use |
|-------|---------|-----|
| Path-based (HLS) | `/proxy/hls/{host}{path}?referer=...&cookie=...&segment=1` | manifests + `.ts`/`.m4s` segments |
| Query-based | `/proxy?url=...&referer=...&origin=...&cookie=...` or `/utils/proxy?url=...` | generic / images / provider hashes |

## Files

- `worker.ts` — the Worker script (fetch handler, streaming, CORS, header work).
- `wrangler.toml` — Wrangler config (TS worker, compatibility date, workers.dev).
- `package.json` / `tsconfig.json` — local dev + typecheck deps.

---

## Step-by-step setup (Cloudflare Workers)

### 0. Prerequisites
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up).
- [Node.js](https://nodejs.org) 18+. Locally installed.

### 1. Install deps
```bash
cd cloudflare-media-proxy
npm install
```

### 2. Authenticate Wrangler
```bash
npx wrangler login
```
A browser opens and you authorize Cloudflare.

### 3. Test locally (optional)
```bash
npm run dev
# then visit:
#   http://127.0.0.1:8787/proxy?url=https%3A%2F%2Fexample.com%2Fvideo.m3u8
```

### 4. Deploy
```bash
npm run deploy
```
On first deploy Wrangler asks you to create a Worker. Pick the **"Free"** plan
(no charges — Workers Free = 100,000 requests/day, enough for a streaming proxy).

When done you get a URL like:
```
https://fluxiumlab-media-proxy.<your-subdomain>.workers.dev
```

### 5. Smoke-test the deployed URL
```bash
# Path-based HLS shape:
curl -i "https://fluxiumlab-media-proxy.<sub>.workers.dev/proxy/hls/example.com/video.m3u8"

# Query-based shape:
curl -i "https://fluxiumlab-media-proxy.<sub>.workers.dev/proxy?url=https%3A%2F%2Fexample.com%2Fv.m3u8&referer=https%3A%2F%2Fexample.com/"
```
Confirm you get `200`, `content-type: application/vnd.apple.mpegurl`, and
`access-control-allow-origin: *`.

---

## Connect it to FluxiumLab (frontend)

Your frontend picks the media proxy origin in **`player.html` →
`getMediaProxyOrigin()`**, which reads, in order:

1. `LOCAL_MEDIA_PROXY_BASE` (from `config.js`) when `apiSource === 'local'`
2. `activeApiBase` / `API_BASE` (currently your VM)
3. `PROXY_GATEWAY_BASE`

To route streaming through Cloudflare instead of the VM, set
`PROXY_GATEWAY_BASE` to your Worker domain.

**Option A — via `config.js`** (`StreamVerse/config.js`):
```js
window.__STREAMVERSE_CONFIG__ = {
  API_BASE: 'http://192.168.1.159:3000',          // metadata/watch (stays on VM)
  LOCAL_MEDIA_PROXY_BASE: 'http://127.0.0.1:3000', // local dev proxy (unchanged)
  MEDIA_PROXY_BASE: 'https://fluxiumlab-media-proxy.<your-subdomain>.workers.dev',
  SAME_ORIGIN_MEDIA_PROXY: false,
};
```

**Option B — via `start_site.js` env** (if you deploy the site server):
```js
const SITE_MEDIA_PROXY_BASE = process.env.SITE_MEDIA_PROXY_BASE
  || 'https://fluxiumlab-media-proxy.<your-subdomain>.workers.dev';
// inject into the client config script so getMediaProxyOrigin() uses it.
```

**Important:** only flip media streaming to Cloudflare. Keep
`API_BASE` (metadata / watch / search) on your VM — those are lightweight
JSON requests and are what the Worker is *not* for.

### What this offloads
Before: every `.ts` segment + `.m3u8` fetch flowed through the VM (`/proxy`,
`/proxy/hls`, `/utils/proxy`), each byte counted as VM egress.
After: the browser talks directly to the Cloudflare edge Worker; the VM
handles only metadata/watch calls. Streaming egress on the VM goes to ~0.

---

## Common questions

**Does the Free plan stream a lot?**
Cloudflare Workers Free allows 100,000 requests/day and streams bodies without
counting them as Worker invocations when using the standard `fetch` streaming
pattern used here. For very heavy SLS traffic you can move to Paid ($5/mo) for
a higher request ceiling — still vastly cheaper than e2-micro egress.

**Why remove `If-None-Match` / `If-Modified-Since`?**
Provider CDNs sometimes answer a conditional GET with `304 Not Modified`,
which breaks playlist reloads / segment re-requests. Stripping them forces a
fresh `200` body.

**CORS?**
Every response (including `OPTIONS` preflights and `400/502` errors) returns:
`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`,
`Access-Control-Allow-Headers: *`.

**Range/video seeks?**
The client `Range` header is forwarded upstream, and upstream `content-range`,
`content-length`, and `content-type` are passed through so seeking + adaptive
playback work.