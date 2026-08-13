const streamVerseLocalHost = window.location.hostname || '127.0.0.1';
const streamVerseLocalApi = `http://${streamVerseLocalHost.includes(':') ? `[${streamVerseLocalHost}]` : streamVerseLocalHost}:3000`;

window.__STREAMVERSE_CONFIG__ = {
  API_BASE: 'https://streamverse-api.duckdns.org',
  META_API_BASE: 'https://streamverse-api.duckdns.org/meta/tmdb',
  LOCAL_API_BASE: `${streamVerseLocalApi}/meta/tmdb`,
  LOCAL_META_API_BASE: `${streamVerseLocalApi}/meta/tmdb`,
  LOCAL_MEDIA_PROXY_BASE: streamVerseLocalApi,
  PROD_API_BASE: 'https://streamverse-api.duckdns.org/meta/tmdb',
  PROD_META_API_BASE: 'https://streamverse-api.duckdns.org/meta/tmdb',
  FALLBACK_API_BASE: 'https://consumet-api.vercel.app/meta/tmdb',
SAME_ORIGIN_MEDIA_PROXY: false,
  MEDIA_PROXY_BASE: 'https://fluxiumlab-media-proxy.jeetrana790.workers.dev',
  MEDIA_PROXY_KEY: ''
};

