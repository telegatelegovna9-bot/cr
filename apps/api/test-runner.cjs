const fs = require('fs');
const path = require('path');

require('ts-node/register/transpile-only');

function findByName(startDir, fileName) {
  const entries = fs.readdirSync(startDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(startDir, entry.name);

    if (entry.isFile() && entry.name === fileName) {
      return entryPath;
    }

    if (entry.isDirectory()) {
      const nested = findByName(entryPath, fileName);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

const testFiles = process.argv.slice(2);

if (testFiles.length === 0) {
  console.error('No test files provided.');
  process.exitCode = 1;
  process.exit();
}

for (const testFile of testFiles) {
  const directPath = path.resolve(process.cwd(), testFile);
  const resolved = fs.existsSync(directPath)
    ? directPath
    : findByName(process.cwd(), path.basename(testFile));

  if (!resolved) {
    console.error(`Unable to locate test file: ${testFile}`);
    process.exitCode = 1;
    continue;
  }

  require(resolved);
}
