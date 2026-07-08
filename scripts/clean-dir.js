const fs = require('fs');
const path = require('path');

const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/clean-dir.js <directory>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const absoluteTarget = path.resolve(root, target);

if (!absoluteTarget.startsWith(root + path.sep)) {
  console.error(`Refusing to clean outside the repository: ${target}`);
  process.exit(1);
}

fs.rmSync(absoluteTarget, { recursive: true, force: true });
fs.mkdirSync(absoluteTarget, { recursive: true });
