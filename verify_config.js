#!/usr/bin/env node
/**
 * Verify that the config server correctly injects port 3001
 */
const http = require('http');

async function test() {
    console.log('🔍 Testing config.js generation from start_site.js server...\n');
    
    try {
        const response = await new Promise((resolve, reject) => {
            const req = http.get('http://localhost:8080/config.js', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({status: res.statusCode, data, headers: res.headers}));
            });
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Connection timeout'));
            });
        });

        console.log(`Status: ${response.status}`);
        console.log(`Content-Type: ${response.headers['content-type']}`);
        console.log(`Cache-Control: ${response.headers['cache-control']}\n`);
        
        console.log('📝 Config content:\n');
        console.log(response.data);
        console.log('\n');
        
        // Verify key values
        const checks = [
            { key: 'localhost:3001', found: response.data.includes('localhost:3001'), desc: 'Port 3001 in config' },
            { key: 'LOCAL_API_BASE', found: response.data.includes('LOCAL_API_BASE'), desc: 'LOCAL_API_BASE defined' },
            { key: 'LOCAL_META_API_BASE', found: response.data.includes('LOCAL_META_API_BASE'), desc: 'LOCAL_META_API_BASE defined' },
            { key: 'no-store', found: response.data.includes('no-store') || response.headers['cache-control']?.includes('no-store'), desc: 'No-cache header' }
        ];
        
        console.log('✅ Verification Results:\n');
        checks.forEach(({key, found, desc}) => {
            console.log(`${found ? '✓' : '✗'} ${desc}`);
        });
        
        const allPass = checks.every(c => c.found);
        console.log(`\n${allPass ? '✅ All checks passed!' : '❌ Some checks failed!'}`);
        process.exit(allPass ? 0 : 1);
        
    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
        console.error('\nNote: Make sure start_site.js is running on port 8080');
        process.exit(1);
    }
}

test();
