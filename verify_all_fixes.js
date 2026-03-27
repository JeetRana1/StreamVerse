#!/usr/bin/env node
/**
 * Final Comprehensive Fix Verification
 */

console.log('═══════════════════════════════════════════════════════════════');
console.log('  🔍 COMPREHENSIVE FIX VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

const fs = require('fs');
const path = require('path');

const checks = [
    {
        name: 'Script.js Fallback Port',
        file: 'C:\\Users\\Jeet\\Music\\WTEHMOVIESCONSUMETAPITEST\\script.js',
        check: (content) => content.includes("'http://localhost:3001/meta/tmdb'") && !content.includes("'http://localhost:3000/meta/tmdb'"),
        desc: 'Hardcoded fallback uses port 3001'
    },
    {
        name: 'Config.js Port 3001',
        file: 'C:\\Users\\Jeet\\Music\\WTEHMOVIESCONSUMETAPITEST\\config.js',
        check: (content) => (content.match(/localhost:3001/g) || []).length >= 4,
        desc: 'All API endpoints set to port 3001'
    },
    {
        name: 'Start_site.js Config Gen',
        file: 'C:\\Users\\Jeet\\Music\\WTEHMOVIESCONSUMETAPITEST\\start_site.js',
        check: (content) => content.includes('LOCAL_API_BASE:') && content.includes('LOCAL_META_API_BASE:'),
        desc: 'Server generates LOCAL_API_BASE and LOCAL_META_API_BASE'
    },
    {
        name: 'API .env PORT Setting',
        file: 'c:\\Users\\Jeet\\Videos\\fewfwewfd\\api.consumet.org\\.env',
        check: (content) => /^PORT=3001/m.test(content),
        desc: 'API configured for port 3001'
    },
    {
        name: 'Frontend .env API Base',
        file: 'C:\\Users\\Jeet\\Music\\WTEHMOVIESCONSUMETAPITEST\\.env',
        check: (content) => content.includes('SITE_API_BASE=http://localhost:3001'),
        desc: 'Frontend configured to use port 3001 API'
    }
];

let passed = 0;
let failed = 0;

checks.forEach(({name, file, check, desc}) => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        const result = check(content);
        
        if (result) {
            console.log(`✅ ${name}`);
            console.log(`   └─ ${desc}\n`);
            passed++;
        } else {
            console.log(`❌ ${name}`);
            console.log(`   └─ ${desc}\n`);
            failed++;
        }
    } catch (err) {
        console.log(`⚠️  ${name}`);
        console.log(`   └─ Error: ${err.message}\n`);
        failed++;
    }
});

console.log('═══════════════════════════════════════════════════════════════');
console.log(`Results: ${passed}/${checks.length} passed\n`);

if (failed === 0) {
    console.log('✅ ALL FIXES VERIFIED!\n');
    console.log('📝 Next Steps for User:');
    console.log('   1. Open http://localhost:8080 in your browser');
    console.log('   2. Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)');
    console.log('   3. Hard refresh to clear the JavaScript cache');
    console.log('   4. Check DevTools Console for any errors');
    console.log('   5. Verify requests now go to localhost:3001\n');
    console.log('✅ 404 errors should now be gone!');
} else {
    console.log('⚠️  Some fixes may not be in place');
    console.log(`Review the ${failed} failed check(s) above`);
}

console.log('\n═══════════════════════════════════════════════════════════════\n');
