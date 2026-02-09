/**
 * Generate app icon: "Odoo" + "ZIP" in Odoo purple with Jimp.
 * Run: node scripts/generate-icon.js
 */
const Jimp = require('jimp');
const path = require('path');

async function generateIcon() {
  const size = 512;
  const bg = 0x714B67FF; // Odoo purple

  const image = new Jimp(size, size, bg);

  // Load fonts
  const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

  // Measure text
  const odooW = Jimp.measureText(fontLarge, 'Odoo');
  const odooH = Jimp.measureTextHeight(fontLarge, 'Odoo', size);
  const zipW = Jimp.measureText(fontLarge, 'ZIP');
  const zipH = Jimp.measureTextHeight(fontLarge, 'ZIP', size);
  const convW = Jimp.measureText(fontSmall, 'Converter');
  const convH = Jimp.measureTextHeight(fontSmall, 'Converter', size);

  // Vertical layout: center all three lines
  const gap = 12;
  const totalH = odooH + gap + zipH + gap + convH;
  const startY = Math.floor((size - totalH) / 2);

  // Draw centered text
  image.print(fontLarge, Math.floor((size - odooW) / 2), startY, 'Odoo');
  image.print(fontLarge, Math.floor((size - zipW) / 2), startY + odooH + gap, 'ZIP');
  image.print(fontSmall, Math.floor((size - convW) / 2), startY + odooH + gap + zipH + gap, 'Converter');

  // Save 512x512 (electron-builder requires at least 256x256)
  const outPath = path.join(__dirname, '..', 'assets', 'icon.png');
  await image.writeAsync(outPath);
  console.log(`Icon saved to ${outPath} (${size}x${size})`);
}

generateIcon().catch(err => {
  console.error('Failed to generate icon:', err);
  process.exit(1);
});
