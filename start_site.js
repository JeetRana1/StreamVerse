const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { Readable } = require('stream');
const { spawn } = require('child_process');

const DEFAULT_SITE_PORT = 3005;
const SITE_DIR = __dirname;
const API_DIR = 'C:\\Users\\Jeet\\Videos\\fewfwewfd\\api.consumet.org';
const ENV_PATH = path.join(SITE_DIR, '.env');
const API_ENV_PATH = path.join(API_DIR, '.env');

function parseDotEnv(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

const envFromFile = parseDotEnv(ENV_PATH);
for (const [k, v] of Object.entries(envFromFile)) {
    if (!Object.prototype.hasOwnProperty.call(process.env, k)) {
        process.env[k] = v;
    }
}

const apiEnvFromFile = parseDotEnv(API_ENV_PATH);
const API_PORT = Number(process.env.API_PORT || apiEnvFromFile.PORT || 3000);
const SITE_API_BASE = process.env.SITE_API_BASE || `http://127.0.0.1:${API_PORT}`;
const SITE_META_API_BASE = process.env.SITE_META_API_BASE || `${SITE_API_BASE.replace(/\/$/, '')}/meta/tmdb`;
const SITE_STREAM_API_BASE =
    process.env.SITE_STREAM_API_BASE ||
    apiEnvFromFile.STREAM_API ||
    'https://convinced-nara-personal122-7da52759.koyeb.app/api/v1';
const WIREGUARD_ENDPOINT = process.env.WIREGUARD_ENDPOINT || '';
const START_LOCAL_API = String(process.env.START_LOCAL_API || 'false').toLowerCase() === 'true';
const SITE_MEDIA_PROXY_BASE =
    process.env.SITE_MEDIA_PROXY_BASE ||
    'https://fluxiumlab-media-proxy.jeetrana790.workers.dev';
const SITE_MEDIA_PROXY_KEY = process.env.SITE_MEDIA_PROXY_KEY || '';

function asJsString(value) {
    return JSON.stringify(String(value || ''));
}

function buildClientConfigScript() {
    return `window.__STREAMVERSE_CONFIG__ = {
  API_BASE: ${asJsString(SITE_API_BASE)},
  META_API_BASE: ${asJsString(SITE_META_API_BASE)},
  LOCAL_API_BASE: ${asJsString(SITE_META_API_BASE)},
  LOCAL_META_API_BASE: ${asJsString(SITE_META_API_BASE)},
    STREAM_API_BASE: ${asJsString(SITE_STREAM_API_BASE)},
  SAME_ORIGIN_MEDIA_PROXY: true,
  MEDIA_PROXY_BASE: ${asJsString(SITE_MEDIA_PROXY_BASE)},
  MEDIA_PROXY_KEY: ${asJsString(SITE_MEDIA_PROXY_KEY)},
  WIREGUARD_ENDPOINT: ${asJsString(WIREGUARD_ENDPOINT)}
};
`;
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

function readJsonBody(req, maxBytes = 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error('Payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!chunks.length) {
                resolve({});
                return;
            }
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                resolve(parsed && typeof parsed === 'object' ? parsed : {});
            } catch (err) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

let apiProc = null;

function isPortInUse(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(600);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => {
            resolve(false);
        });
        socket.connect(port, host);
    });
}

async function startApiServer() {
    if (!START_LOCAL_API) {
        console.log('[INFO] START_LOCAL_API=false, skipping local Consumet startup.');
        return;
    }

    if (!fs.existsSync(path.join(API_DIR, 'package.json'))) {
        console.warn(`[WARN] API project not found at: ${API_DIR}`);
        return;
    }

    const alreadyRunning = await isPortInUse(API_PORT);
    if (alreadyRunning) {
        console.log(`[INFO] API port ${API_PORT} already in use. Assuming API is already running.`);
        return;
    }

    console.log(`[INFO] Starting Consumet API on port ${API_PORT}...`);
    apiProc = spawn('npm', ['start'], {
        cwd: API_DIR,
        env: {
            ...process.env,
            PORT: String(API_PORT),
        },
        stdio: 'inherit',
        shell: true,
    });

    apiProc.on('exit', (code) => {
        if (code !== 0) {
            console.warn(`[WARN] API process exited with code ${code}.`);
        }
    });
}

function stopApiServer() {
    if (!apiProc || apiProc.killed) return;
    try {
        apiProc.kill();
    } catch (_) {
        // ignore
    }
}

process.on('SIGINT', () => {
    stopApiServer();
    process.exit(0);
});

process.on('SIGTERM', () => {
    stopApiServer();
    process.exit(0);
});

startApiServer().catch((err) => {
    console.error('[ERROR] Failed to initialize API startup:', err);
});

const server = http.createServer((req, res) => {
    if (req.url && req.url.startsWith('/utils/proxy')) {
        const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const targetUrl = requestUrl.searchParams.get('url');
        const referer = requestUrl.searchParams.get('referer') || '';

        if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Missing or invalid url');
            return;
        }

        const headers = {};
        if (req.headers.range) headers.Range = req.headers.range;
        if (referer) headers.Referer = referer;
        headers['User-Agent'] = req.headers['user-agent'] || 'Mozilla/5.0';

        fetch(targetUrl, { headers })
            .then((upstreamRes) => {
                const responseHeaders = {};
                for (const [key, value] of upstreamRes.headers.entries()) {
                    if (/^(content-type|content-length|content-range|accept-ranges|cache-control|last-modified|etag)$/i.test(key)) {
                        responseHeaders[key] = value;
                    }
                }
                responseHeaders['Access-Control-Allow-Origin'] = '*';
                responseHeaders['Cross-Origin-Resource-Policy'] = 'cross-origin';
                responseHeaders['Cache-Control'] = responseHeaders['cache-control'] || 'public, max-age=3600';
                res.writeHead(upstreamRes.status, responseHeaders);
                if (!upstreamRes.body) {
                    res.end();
                    return;
                }
                Readable.fromWeb(upstreamRes.body).pipe(res);
            })
            .catch((err) => {
                res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(err.message || 'Proxy failed');
            });
        return;
    }

    if (req.url === '/api/getStream') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, message: 'Method not allowed' }));
            return;
        }

        readJsonBody(req)
            .then(async (body) => {
                const payload = {
                    file: body?.file,
                    key: body?.key,
                    referer: body?.referer,
                    id: body?.id,
                    source: body?.source,
                };

                if (!payload.file || !payload.key) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, message: 'Missing file or key' }));
                    return;
                }

                const targetBase = String(SITE_STREAM_API_BASE || '').replace(/\/$/, '');
                const upstreamRes = await fetch(`${targetBase}/getStream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const text = await upstreamRes.text();
                const contentType = upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8';
                res.writeHead(upstreamRes.status, { 'Content-Type': contentType });
                res.end(text);
            })
            .catch((err) => {
                res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, message: err.message || 'getStream proxy failed' }));
            });
        return;
    }

    if (req.url === '/config.js') {
        res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        res.end(buildClientConfigScript(), 'utf-8');
        return;
    }

    const requestPath = String(req.url || '/').split('?')[0] || '/';
    const routeMap = {
        '/': 'index.html',
        '/player': 'player.html',
        '/anime': 'player.html',
        '/anime/player': 'player.html',
        '/anime/player.html': 'player.html',
        '/manga': 'manga.html',
        '/favicon.ico': 'logo.png',
    };
    let filePath = path.join(SITE_DIR, routeMap[requestPath] || requestPath.replace(/^\/+/, ''));
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    if (extname === '.mp4') {
        fs.stat(filePath, (error, stats) => {
            if (error || !stats.isFile()) {
                res.writeHead(404);
                res.end('Video not found');
                return;
            }
            const range = req.headers.range;
            if (range) {
                const match = /bytes=(\d*)-(\d*)/.exec(range);
                const start = match?.[1] ? Number(match[1]) : 0;
                const end = match?.[2] ? Number(match[2]) : stats.size - 1;
                if (start >= stats.size || end < start) {
                    res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
                    res.end();
                    return;
                }
                const safeEnd = Math.min(end, stats.size - 1);
                res.writeHead(206, {
                    'Content-Type': contentType,
                    'Content-Length': safeEnd - start + 1,
                    'Content-Range': `bytes ${start}-${safeEnd}/${stats.size}`,
                    'Accept-Ranges': 'bytes',
                });
                fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
                return;
            }
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Accept-Ranges': 'bytes',
            });
            fs.createReadStream(filePath).pipe(res);
        });
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            const headers = { 'Content-Type': contentType };
            if (extname === '.html') {
                headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
                headers['Pragma'] = 'no-cache';
                headers['Expires'] = '0';
            }
            res.writeHead(200, headers);
            res.end(content, 'utf-8');
        }
    });
});

function listenSite(startPort) {
    server.listen(startPort, () => {
        console.log(`Site running at http://localhost:${startPort}`);
        console.log(`API expected at ${SITE_META_API_BASE}`);
    });

    server.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            const nextPort = startPort + 1;
            console.warn(`[WARN] Port ${startPort} is in use, retrying on ${nextPort}...`);
            listenSite(nextPort);
            return;
        }
        console.error('[ERROR] Failed to start site server:', err);
        process.exit(1);
    });
}

const sitePort = Number(process.env.SITE_PORT) || DEFAULT_SITE_PORT;
listenSite(sitePort);
