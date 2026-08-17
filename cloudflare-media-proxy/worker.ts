/**
 * FluxiumLab — Media Proxy Worker
 *
 * Moves HLS playlist + video-segment proxying from the Google Cloud VM to the
 * Cloudflare edge, eliminating VM egress/billing for streamed bytes.
 *
 * Supports the same two request shapes the FluxiumLab frontend already emits:
 *   1. Path-based (HLS manifests + segments):
 *        /proxy/hls/{host}{path}?referer=...&cookid=...&segment=1
 *   2. Query-based (generic / images / vm hashes returned by providers):
 *        /proxy?url=...&referer=...&origin=...&cookie=...
 *        /utils/proxy?url=...&referer=...
 *
 * Behaviors:
 *   - URL protocol validation (http/https only)
 *   - Unwraps nested /utils/proxy URLs
 *   - Strips If-None-Match / If-Modified-Since to prevent origin 304s
 *   - Forwards Referer / Origin / User-Agent / Range / Cookie (case-insensitive)
 *   - Applies the same referer rewrites as the VM proxy (anikoto CDN -> megaplay)
 *   - Fully unbuffered streaming (upstream body -> response body)
 *   - Strict CORS headers + instant OPTIONS preflight
 */

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_REFERER = 'https://streameeeeee.site/';

/** Worker environment bindings. MEDIA_PROXY_KEY is optional — set via `wrangler secret put`. */
interface Env {
  MEDIA_PROXY_KEY?: string;
  MEDIA_PROXY_TOKEN_SECRET?: string;
}

function base64UrlBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function isValidMediaProxyToken(token: string, secret: string): Promise<boolean> {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const data = base64UrlBytes(payload);
    const parsed = JSON.parse(new TextDecoder().decode(data));
    if (!Number.isFinite(Number(parsed?.exp)) || Number(parsed.exp) < Math.floor(Date.now() / 1000)) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, base64UrlBytes(signature), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

// Hosts that reject the provider-site referer but accept the Megaplay origin
// (AniKoto subtitle/CDN hosts). Mirrors the VM proxy behaviour.
const MEGAPLAY_REFERER_DOMAINS =
  /(?:shiora|mikora)\.(?:top|site|club|net)|lostproject\.club|(?:megap|vidtub)\.(?:shiora\.(?:top|site)|akirax\.buzz)|megap\.(?:mikora|norami|akirax)\.(?:top|buzz)|cdn\.mewstream\.|livedns\./i;

const MEGAPLAY_REFERER = 'https://megaplay.buzz/';

/** Extract the first safe http/https upstream URL from a target string. */
function toSafeUrl(value: string): URL | null {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Unwrap nested proxy URLs (a proxied URL whose content is itself a proxied
 * URL string, e.g. ?url contains a /utils/proxy URL). Guards against loops.
 * Returns { url, referer } so an inner referer can propagate outward.
 */
function unwrapNested(url: string, referer: string): { url: string; referer: string } {
  let current = url;
  let currentReferer = referer;
  for (let i = 0; i < 6; i += 1) {
    const u = toSafeUrl(current);
    if (!u) break;
    if (!/\/utils\/proxy$/i.test(u.pathname)) break;

    const innerUrl = u.searchParams.get('url');
    if (!innerUrl) break;
    const innerReferer = u.searchParams.get('referer');
    current = innerUrl;
    if (!currentReferer && innerReferer) currentReferer = innerReferer;
  }
  return { url: current, referer: currentReferer };
}

function buildCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Build the outbound request headers, copying provider-supplied Referer /
 * Origin / User-Agent / Cookie case-insensitively and forwarding the client's
 * Range for video seeks. Explicitly omits cache-validation headers.
 */
function buildUpstreamHeaders(
  request: Request,
  { referer, origin, cookie }: { referer: string; origin: string; cookie: string },
): Headers {
  const headers = new Headers();
  headers.set('User-Agent', request.headers.get('User-Agent') || DEFAULT_USER_AGENT);

  if (referer) headers.set('Referer', referer);
  if (origin) headers.set('Origin', origin);
  if (cookie) headers.set('Cookie', cookie);

  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);

  return headers;
}

/** Pick passthrough query params for path-based /proxy/hls/{host}... requests. */
function pathBasedPassthroughQuery(raw: string): string {
  const query = raw.split('?')[1] || '';
  return query
    .split('&')
    .filter((part) => part && !/^(referer|segment|cookie)=/i.test(part))
    .join('&');
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // When a MEDIA_PROXY_KEY secret is configured, require it: via the
    // `?key=` query param or an `x-media-proxy-key` header. This keeps the
    // gateway unusable by the public — only your app knows the key.
    function unauthorized() {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...buildCorsHeaders() },
      });
    }

    // ---- Preflight: answer CORS OPTIONS instantly. ----
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...buildCorsHeaders(), 'Content-Length': '0' },
      });
    }

    // Prevent cache-validation requests from reaching the origin with a 304.
    // (Implemented here as an explicit guard; also done via header stripping.)
    if (request.headers.has('If-None-Match') || request.headers.has('If-Modified-Since')) {
      const headers = new Headers(request.headers);
      headers.delete('If-None-Match');
      headers.delete('If-Modified-Since');
      request = new Request(request, { headers });
    }

    // ---- Auth gate: enforce the shared key if configured. ----
    const expectedKey = String(env?.MEDIA_PROXY_KEY || '').trim();
    const tokenSecret = String(env?.MEDIA_PROXY_TOKEN_SECRET || '').trim();
    if (tokenSecret) {
      const providedToken = String(url.searchParams.get('token') || '');
      if (!(await isValidMediaProxyToken(providedToken, tokenSecret))) return unauthorized();
    } else if (expectedKey) {
      const providedKey =
        String(url.searchParams.get('key') || '') ||
        String(request.headers.get('x-media-proxy-key') || '');
      if (providedKey !== expectedKey) return unauthorized();
    }

    // ---- Resolve upstream target + forwarding params. ----
    let targetUrl = '';
    let referer = '';
    let origin = '';
    let cookie = '';
    let isHlsPath = false;

    const pathParam = String(url.searchParams.get('url') || '');
    if (pathParam) {
      // Query-based shape: /proxy?url=...&referer=...&origin=...&cookie=...
      targetUrl = pathParam;
      referer = String(url.searchParams.get('referer') || '');
      origin = String(url.searchParams.get('origin') || '');
      cookie = String(url.searchParams.get('cookie') || '');
    } else if (/^\/proxy\/hls\//i.test(url.pathname)) {
      // Path-based HLS shape: /proxy/hls/{host}{path}?referer=...&cookie=...&segment=1
      isHlsPath = true;
      const wildcard = url.pathname.replace(/^\/proxy\/hls\//i, '').trim();
      referer = String(url.searchParams.get('referer') || '');
      cookie = String(url.searchParams.get('cookie') || '');
      const passthrough = pathBasedPassthroughQuery(request.url);
      targetUrl = `https://${wildcard}${passthrough ? `?${passthrough}` : ''}`;
    }

    // Unwrap any nested proxy wraps.
    const unwrapped = unwrapNested(targetUrl, referer);
    targetUrl = unwrapped.url;
    if (!referer && unwrapped.referer) referer = unwrapped.referer;

    const target = toSafeUrl(targetUrl);
    if (!target) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid url' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...buildCorsHeaders() } },
      );
    }

    // ---- Referer resolution (mirrors VM proxy). ----
    const incomingReferer = (request.headers.get('Referer') || request.headers.get('Referrer') || '')
      .replace(/#.*$/, '');
    let requestReferer = (referer || incomingReferer || DEFAULT_REFERER).replace(/#.*$/, '');
    if (MEGAPLAY_REFERER_DOMAINS.test(target.hostname) && /anikoto\.cz/i.test(requestReferer)) {
      requestReferer = MEGAPLAY_REFERER;
    } else if (MEGAPLAY_REFERER_DOMAINS.test(target.hostname)) {
      requestReferer = MEGAPLAY_REFERER;
    }

    if (!origin) {
      try {
        origin = `${target.protocol}//${target.host}`;
      } catch {
        origin = '';
      }
    }

    const upstreamHeaders = buildUpstreamHeaders(request, {
      referer: requestReferer,
      origin,
      cookie,
    });

    let upstream: Response;
    try {
      upstream = await fetch(target.toString(), { headers: upstreamHeaders });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || 'Upstream fetch failed' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...buildCorsHeaders() } },
      );
    }

    const upstreamBody = upstream.body;
    if (!upstreamBody) {
      // No body (e.g. 204) — forward status and headers only.
      const headers = new Headers(upstream.headers);
      Object.entries(buildCorsHeaders()).forEach(([k, v]) => headers.set(k, v));
      return new Response(null, { status: upstream.status, headers });
    }

    // ---- Build response headers. ----
    const responseHeaders = new Headers(upstream.headers);

    // Forward present content-type so HLS/m3u8 and video segments work.
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType) responseHeaders.set('Content-Type', contentType);

    // Detect playlists up front (also used below for manifest rewrite and
    // to set cache lifetimes). M3U8 manifests reference variant/audio/segment
    // URIs as RELATIVE paths (e.g. "index-f1-v1.m3u8?k=...&kx=...") — if streamed
    // verbatim, the browser would resolve them against the master URL and DROP
    // our auth/referer params, so these MUST be rewritten (see below).
    const isPlaylist =
      /(?:mpegurl|m3u8|hls)/i.test(contentType) ||
      /\.m3u8(?:[?#]|$)/i.test(target.toString());
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    // Free-tier friendly caching: manifests change every refresh so keep them
    // short-lived (hls.js re-fetches them anyway), but SEGMENTS are immutable
    // files — let the browser reuse them across seeks/re-buffers instead of
    // making another Worker request per segment. This is the plan-free way to
    // cut per-video Worker invocations (Cache API needs the paid plan).
    // NOTE: we FORCE these headers because upstream origins (e.g. hubstream)
    // often send `Cache-Control: private, no-store` which would otherwise kill
    // browser caching entirely and re-hit the Worker for every segment.
    if (isPlaylist) {
      // Short positive TTL: hls.js fetches the master/variant manifest multiple
      // times per session (level setup + audio resolution). A brief cache lets
      // the browser reuse the 2nd/3rd fetch instead of hitting the Worker again.
      // VOD manifests are static within a session; 30s keeps any edge/refresh
      // reasonably fresh without re-invoking the Worker on every sub-request.
      responseHeaders.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    } else {
      // Do not cache media responses at the edge. A cached 200 response can be
      // incorrectly reused for a later byte-range request, breaking playback
      // for large Archive.org files.
      responseHeaders.set('Cache-Control', 'no-store');
    }

    Object.entries(buildCorsHeaders()).forEach(([k, v]) => responseHeaders.set(k, v));

    if (isPlaylist) {
      const text = await upstream.text();
      const publicOrigin = url.origin;
      const authKey = String(env?.MEDIA_PROXY_KEY || '').trim();
      const authToken = String(url.searchParams.get('token') || '');
      const refererParam = requestReferer ? `&referer=${encodeURIComponent(requestReferer)}` : '';
      const rewriteUri = (line: string): string => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) return line;
        if (trimmed.startsWith('data:')) return line;
        let resolved: URL;
        try {
          const candidate = trimmed.includes('://') ? trimmed : new URL(trimmed, target.toString()).toString();
          resolved = new URL(candidate);
        } catch {
          return line;
        }
        const params = new URLSearchParams({ url: resolved.toString() });
        if (authToken) params.set('token', authToken);
        else if (authKey) params.set('key', authKey);
        if (requestReferer) params.set('referer', requestReferer);
        return `${publicOrigin}/proxy?${params.toString()}`;
      };
      const rewritten = text
        .split('\n')
        .map((line) => {
          const bare = line.replace(/\r$/, '');
          // Rewrite bare URI lines AND the URI="..." attribute (EXT-X-MEDIA
          // audio/subtitle renditions reference renditions via that attribute).
          const attrsRe = /(URI)="([^"]+)"/gi;
          let out = rewriteUri(bare);
          if (out === bare) {
            out = bare.replace(attrsRe, (match, attr, uriValue) => {
              const proxied = rewriteUri(uriValue);
              return proxied === uriValue ? match : `${attr}="${proxied}"`;
            });
          }
          return out === bare ? bare : `${out}\r`;
        })
        .join('\n');
      // Playlists are rewritten so content-length is no longer accurate.
      responseHeaders.delete('Content-Length');
      return new Response(rewritten, { status: upstream.status, headers: responseHeaders });
    }

    // Non-playlist (video segments / images): stream the upstream body directly
    // into the Response — no buffering, minimal memory, no extra VM egress.
    return new Response(upstreamBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
