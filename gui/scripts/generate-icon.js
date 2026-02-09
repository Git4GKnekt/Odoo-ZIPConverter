/**
 * Generate app icon using SVG → PNG via sharp.
 * Run: node scripts/generate-icon.js
 */
const sharp = require('sharp');
const path = require('path');

const SIZE = 512;
const PAD = 40;

// Odoo purple palette
const BG = '#714B67';
const BG_LIGHT = '#875A7B';
const WHITE = '#FFFFFF';
const WHITE_DIM = 'rgba(255,255,255,0.6)';

const svg = `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BG}" />
      <stop offset="100%" stop-color="${BG_LIGHT}" />
    </linearGradient>
    <!-- Subtle shadow for depth -->
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.3)" />
    </filter>
  </defs>

  <!-- Rounded background -->
  <rect x="${PAD / 2}" y="${PAD / 2}" width="${SIZE - PAD}" height="${SIZE - PAD}" rx="48" ry="48" fill="url(#bg)" />

  <!-- ZIP icon: small archive shape at top -->
  <g transform="translate(${SIZE / 2}, 135)" filter="url(#shadow)">
    <!-- Archive/zip shape -->
    <rect x="-52" y="-40" width="104" height="80" rx="8" fill="none" stroke="${WHITE}" stroke-width="3.5" />
    <!-- Zip teeth pattern (center line) -->
    <line x1="0" y1="-40" x2="0" y2="40" stroke="${WHITE}" stroke-width="2" stroke-dasharray="8,6" />
    <!-- Tab on top -->
    <rect x="-30" y="-50" width="60" height="14" rx="4" fill="none" stroke="${WHITE}" stroke-width="3" />
  </g>

  <!-- "Odoo" text -->
  <text x="${SIZE / 2}" y="265" text-anchor="middle"
        font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="72" font-weight="300" fill="${WHITE}" letter-spacing="2">
    Odoo
  </text>

  <!-- "ZIP" text -->
  <text x="${SIZE / 2}" y="345" text-anchor="middle"
        font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="80" font-weight="700" fill="${WHITE}" letter-spacing="6">
    ZIP
  </text>

  <!-- Divider line -->
  <line x1="${SIZE / 2 - 60}" y1="368" x2="${SIZE / 2 + 60}" y2="368"
        stroke="${WHITE_DIM}" stroke-width="1.5" />

  <!-- "Converter" subtitle -->
  <text x="${SIZE / 2}" y="405" text-anchor="middle"
        font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="32" font-weight="300" fill="${WHITE_DIM}" letter-spacing="4">
    Converter
  </text>
</svg>
`;

async function generate() {
  const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
  await sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .png()
    .toFile(outPath);
  console.log(`Icon saved to ${outPath} (${SIZE}x${SIZE})`);
}

generate().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
