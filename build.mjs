import { readFileSync, writeFileSync } from 'node:fs';

const parts = ['rig', 'engine', 'castle', 'boot'].map((n) => readFileSync(`src/${n}.js`, 'utf8'));
writeFileSync('office.js', `(() => {\n${parts.join('\n')}\n})();\n`);
console.log('office.js built');
