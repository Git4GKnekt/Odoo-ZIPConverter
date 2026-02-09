/**
 * Generate app icon using SVG → PNG via sharp.
 * Run: node scripts/generate-icon.js
 */
const sharp = require('sharp');
const path = require('path');

const SIZE = 512;
const PAD = 32;

// Odoo purple palette
const BG = '#714B67';
const BG_LIGHT = '#875A7B';
const WHITE = '#FFFFFF';
const WHITE_DIM = 'rgba(255,255,255,0.55)';

const svg = `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BG}" />
      <stop offset="100%" stop-color="${BG_LIGHT}" />
    </linearGradient>
  </defs>

  <!-- Rounded background -->
  <rect x="${PAD / 2}" y="${PAD / 2}" width="${SIZE - PAD}" height="${SIZE - PAD}" rx="48" ry="48" fill="url(#bg)" />

  <!-- "Odoo" — large, light weight -->
  <text x="${SIZE / 2}" y="220" text-anchor="middle"
        font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="110" font-weight="300" fill="${WHITE}" letter-spacing="2">
    Odoo
  </text>

  <!-- "ZIP" — extra large, bold -->
  <text x="${SIZE / 2}" y="345" text-anchor="middle"
        font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="130" font-weight="700" fill="${WHITE}" letter-spacing="8">
    ZIP
  </text>

  <!-- Thin divider -->
  <line x1="${SIZE / 2 - 80}" y1="370" x2="${SIZE / 2 + 80}" y2="370"
        stroke="${WHITE_DIM}" stroke-width="1.5" />

  <!-- "Converter" subtitle -->
  <text x="${SIZE / 2}" y="415" text-anchor="middle"
        font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="42" font-weight="300" fill="${WHITE_DIM}" letter-spacing="6">
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
