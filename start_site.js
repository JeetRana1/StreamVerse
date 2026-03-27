const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const DEFAULT_SITE_PORT = 8080;
const SITE_DIR = 'C:\\Users\\Jeet\\Music\\WTEHMOVIESCONSUMETAPITEST';
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
const WIREGUARD_ENDPOINT = process.env.WIREGUARD_ENDPOINT || '';
const START_LOCAL_API = String(process.env.START_LOCAL_API || 'false').toLowerCase() === 'true';

function asJsString(value) {
    return JSON.stringify(String(value || ''));
}

function buildClientConfigScript() {
    return `window.__STREAMVERSE_CONFIG__ = {
  API_BASE: ${asJsString(SITE_API_BASE)},
  META_API_BASE: ${asJsString(SITE_META_API_BASE)},
  LOCAL_API_BASE: ${asJsString(SITE_META_API_BASE)},
  LOCAL_META_API_BASE: ${asJsString(SITE_META_API_BASE)},
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
    if (req.url === '/config.js') {
        res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        res.end(buildClientConfigScript(), 'utf-8');
        return;
    }

    let filePath = path.join(SITE_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

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
