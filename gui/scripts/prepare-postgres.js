/**
 * Prepare portable PostgreSQL binaries for electron-builder packaging.
 * Copies required binaries from a local PostgreSQL installation
 * into gui/postgres/ for bundling with the Electron app.
 */

const fs = require('fs');
const path = require('path');

const DEST_DIR = path.resolve(__dirname, '../postgres');

// Binaries we need (without .exe extension)
const REQUIRED_BINS = [
  'postgres',
  'pg_ctl',
  'initdb',
  'psql',
  'pg_dump',
  'pg_isready',
];

// DLLs required by the binaries above
const REQUIRED_DLLS = [
  'libpq.dll',
  'libcrypto-3-x64.dll',
  'libssl-3-x64.dll',
  'libiconv-2.dll',
  'libintl-9.dll',
  'libwinpthread-1.dll',
  'libxml2.dll',
  'liblz4.dll',
  'libzstd.dll',
  'zlib1.dll',
  // ICU libraries (needed by initdb for locale support)
  'icudt*.dll',
  'icuin*.dll',
  'icuuc*.dll',
];

// Share files needed by initdb and postgres
const REQUIRED_SHARE = [
  'postgresql.conf.sample',
  'pg_hba.conf.sample',
  'pg_ident.conf.sample',
  'postgres.bki',
  'information_schema.sql',
  'system_constraints.sql',
  'system_functions.sql',
  'system_views.sql',
  'snowball_create.sql',
  'sql_features.txt',
  'errcodes.txt',
];

const REQUIRED_SHARE_DIRS = [
  'timezone',
  'timezonesets',
  'tsearch_data',
];

/**
 * Find a PostgreSQL installation on the system.
 */
function findPostgresInstall() {
  const searchPaths = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ];

  for (const base of searchPaths) {
    if (!base) continue;
    const pgBase = path.join(base, 'PostgreSQL');
    if (!fs.existsSync(pgBase)) continue;

    // Find versions, newest first
    const versions = fs.readdirSync(pgBase)
      .filter(d => /^\d+$/.test(d))
      .sort((a, b) => parseInt(b) - parseInt(a));

    for (const ver of versions) {
      const pgDir = path.join(pgBase, ver);
      const binDir = path.join(pgDir, 'bin');
      const psql = path.join(binDir, 'psql.exe');
      if (fs.existsSync(psql)) {
        return { dir: pgDir, version: ver };
      }
    }
  }

  return null;
}

/**
 * Copy a directory recursively.
 */
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

/**
 * Match files against a glob pattern with simple wildcard support.
 */
function matchGlob(filename, pattern) {
  if (!pattern.includes('*')) return filename === pattern;
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
  return regex.test(filename);
}

// ===== Main =====

// Check if already prepared
const versionFile = path.join(DEST_DIR, '.pg-version');
if (fs.existsSync(versionFile)) {
  const existing = fs.readFileSync(versionFile, 'utf-8').trim();
  console.log(`PostgreSQL binaries already prepared (v${existing}). Delete gui/postgres/ to re-prepare.`);
  process.exit(0);
}

// Find local installation
const pgInstall = findPostgresInstall();
if (!pgInstall) {
  console.error('ERROR: No PostgreSQL installation found.');
  console.error('Install PostgreSQL or provide binaries manually in gui/postgres/');
  process.exit(1);
}

console.log(`Found PostgreSQL ${pgInstall.version} at ${pgInstall.dir}`);

const srcBinDir = path.join(pgInstall.dir, 'bin');
const srcLibDir = path.join(pgInstall.dir, 'lib');
const srcShareDir = path.join(pgInstall.dir, 'share');

// Clean destination
if (fs.existsSync(DEST_DIR)) {
  fs.rmSync(DEST_DIR, { recursive: true });
}

const destBinDir = path.join(DEST_DIR, 'bin');
const destLibDir = path.join(DEST_DIR, 'lib');
const destShareDir = path.join(DEST_DIR, 'share');

fs.mkdirSync(destBinDir, { recursive: true });
fs.mkdirSync(destLibDir, { recursive: true });
fs.mkdirSync(destShareDir, { recursive: true });

let totalSize = 0;

// Copy required executables
for (const bin of REQUIRED_BINS) {
  const src = path.join(srcBinDir, `${bin}.exe`);
  const dest = path.join(destBinDir, `${bin}.exe`);
  if (!fs.existsSync(src)) {
    console.error(`WARNING: Required binary not found: ${src}`);
    continue;
  }
  fs.copyFileSync(src, dest);
  const size = fs.statSync(dest).size;
  totalSize += size;
  console.log(`  bin/${bin}.exe (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

// Copy required DLLs (from bin/ directory where they typically live)
const binFiles = fs.readdirSync(srcBinDir);
for (const pattern of REQUIRED_DLLS) {
  const matches = binFiles.filter(f => matchGlob(f, pattern));
  for (const file of matches) {
    const src = path.join(srcBinDir, file);
    const dest = path.join(destBinDir, file);
    fs.copyFileSync(src, dest);
    const size = fs.statSync(dest).size;
    totalSize += size;
    console.log(`  bin/${file} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

// Copy lib/ directory (server extension modules needed by postgres)
if (fs.existsSync(srcLibDir)) {
  // Only copy essential .dll files from lib/
  const libFiles = fs.readdirSync(srcLibDir).filter(f => f.endsWith('.dll'));
  for (const file of libFiles) {
    const src = path.join(srcLibDir, file);
    const dest = path.join(destLibDir, file);
    fs.copyFileSync(src, dest);
    totalSize += fs.statSync(dest).size;
  }
  console.log(`  lib/ (${libFiles.length} modules)`);
}

// Copy required share files
for (const file of REQUIRED_SHARE) {
  const src = path.join(srcShareDir, file);
  const dest = path.join(destShareDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    totalSize += fs.statSync(dest).size;
  }
}

// Copy required share directories
for (const dir of REQUIRED_SHARE_DIRS) {
  const src = path.join(srcShareDir, dir);
  const dest = path.join(destShareDir, dir);
  if (fs.existsSync(src)) {
    copyDir(src, dest);
    console.log(`  share/${dir}/`);
  }
}

// Also copy extension/ directory (needed for contrib extensions referenced by Odoo)
const srcExtDir = path.join(srcShareDir, 'extension');
if (fs.existsSync(srcExtDir)) {
  copyDir(srcExtDir, path.join(destShareDir, 'extension'));
  console.log('  share/extension/');
}

// Write version marker
fs.writeFileSync(versionFile, pgInstall.version, 'utf-8');

// Calculate total size
function getDirSize(dir) {
  let size = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(p);
    } else {
      size += fs.statSync(p).size;
    }
  }
  return size;
}

const finalSize = getDirSize(DEST_DIR);
console.log(`\nPostgreSQL ${pgInstall.version} binaries prepared in gui/postgres/`);
console.log(`Total size: ${(finalSize / 1024 / 1024).toFixed(1)} MB`);
