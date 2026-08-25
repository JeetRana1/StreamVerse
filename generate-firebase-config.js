const fs = require('fs');
const path = require('path');

const fields = [
    ['apiKey', 'FIREBASE_API_KEY'],
    ['authDomain', 'FIREBASE_AUTH_DOMAIN'],
    ['projectId', 'FIREBASE_PROJECT_ID'],
    ['storageBucket', 'FIREBASE_STORAGE_BUCKET'],
    ['messagingSenderId', 'FIREBASE_MESSAGING_SENDER_ID'],
    ['appId', 'FIREBASE_APP_ID'],
];

const missing = fields.filter(([, envName]) => !String(process.env[envName] || '').trim());
if (missing.length) {
    throw new Error(`Missing Firebase environment variables: ${missing.map(([, envName]) => envName).join(', ')}`);
}

const config = Object.fromEntries(fields.map(([key, envName]) => [key, process.env[envName].trim()]));
const output = `window.streamVerseFirebaseConfig = ${JSON.stringify(config, null, 4)};\n`;
fs.writeFileSync(path.join(__dirname, 'firebaseConfig.js'), output, 'utf8');

const publicDir = path.join(__dirname, 'public');
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
const excludedEntries = new Set([
    'public',
    'node_modules',
    '.git',
    '.vercel',
    '.env',
    '.env.vercel',
    'firebase-service-account.json',
]);
for (const entry of fs.readdirSync(__dirname)) {
    if (excludedEntries.has(entry)) continue;
    fs.cpSync(
        path.join(__dirname, entry),
        path.join(publicDir, entry),
        { recursive: true },
    );
}
fs.writeFileSync(path.join(publicDir, 'firebaseConfig.js'), output, 'utf8');
console.log('Generated public output and firebaseConfig.js from environment variables.');
