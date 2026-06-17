const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, 'dist', 'apps', 'api', 'src', 'main.js'),
  path.join(__dirname, 'dist', 'main.js'),
];

const entrypoint = candidates.find(candidate => fs.existsSync(candidate));

if (!entrypoint) {
  console.error('Unable to locate compiled API entrypoint. Expected one of:');
  for (const candidate of candidates) {
    console.error(`- ${candidate}`);
  }
  process.exit(1);
}

require(entrypoint);
