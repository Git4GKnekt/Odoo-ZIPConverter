/**
 * Prepare backend for electron-builder packaging.
 * Copies compiled backend from project root dist/ into gui/dist/backend/
 * so it can be bundled inside the asar archive.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../../dist');
const destDir = path.resolve(__dirname, '../dist/backend');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Verify source exists
if (!fs.existsSync(srcDir)) {
  console.error('ERROR: Backend dist/ not found at', srcDir);
  console.error('Run "npm run build" in project root first.');
  process.exit(1);
}

// Clean destination
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true });
}

// Copy
copyDir(srcDir, destDir);

const fileCount = fs.readdirSync(destDir).length;
console.log(`Copied backend dist/ to gui/dist/backend/ (${fileCount} entries)`);
