/**
 * Generate a simple 256x256 PNG icon for the application.
 * Creates a purple square with "OZ" text (Odoo ZIPConverter).
 * Uses raw PNG encoding - no external dependencies.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const BG_R = 0x71, BG_G = 0x4B, BG_B = 0x67; // Odoo purple #714B67

// Create raw pixel data (RGBA)
const pixels = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;

    // Rounded rectangle background (radius 32)
    const margin = 16;
    const radius = 32;
    const inRect = x >= margin && x < SIZE - margin && y >= margin && y < SIZE - margin;
    const inCorner = (cx, cy) => {
      const dx = x - cx;
      const dy = y - cy;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    };

    let inside = false;
    if (inRect) {
      inside = true;
    } else {
      // Check rounded corners
      if (x < margin + radius && y < margin + radius) inside = inCorner(margin + radius, margin + radius);
      else if (x >= SIZE - margin - radius && y < margin + radius) inside = inCorner(SIZE - margin - radius - 1, margin + radius);
      else if (x < margin + radius && y >= SIZE - margin - radius) inside = inCorner(margin + radius, SIZE - margin - radius - 1);
      else if (x >= SIZE - margin - radius && y >= SIZE - margin - radius) inside = inCorner(SIZE - margin - radius - 1, SIZE - margin - radius - 1);
    }

    if (inside) {
      pixels[idx] = BG_R;
      pixels[idx + 1] = BG_G;
      pixels[idx + 2] = BG_B;
      pixels[idx + 3] = 255;
    } else {
      // Transparent
      pixels[idx] = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
      pixels[idx + 3] = 0;
    }
  }
}

// Draw simple "OZ" letters using block pixels
function drawBlock(cx, cy, w, h, r, g, b) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) {
        const idx = (py * SIZE + px) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = 255;
      }
    }
  }
}

// Letter O (centered at ~85, size ~80x90)
const ox = 48, oy = 80, ow = 70, oh = 90, thick = 14;
drawBlock(ox, oy, ow, thick, 255, 255, 255);           // top
drawBlock(ox, oy + oh - thick, ow, thick, 255, 255, 255); // bottom
drawBlock(ox, oy, thick, oh, 255, 255, 255);            // left
drawBlock(ox + ow - thick, oy, thick, oh, 255, 255, 255); // right

// Letter Z (centered at ~155, size ~70x90)
const zx = 138, zy = 80, zw = 70, zh = 90;
drawBlock(zx, zy, zw, thick, 255, 255, 255);           // top
drawBlock(zx, zy + zh - thick, zw, thick, 255, 255, 255); // bottom
// Diagonal (approximate with blocks)
for (let i = 0; i < zh - thick * 2; i++) {
  const progress = i / (zh - thick * 2);
  const bx = Math.round(zx + zw - thick - progress * (zw - thick));
  const by = zy + thick + i;
  drawBlock(bx, by, thick, 1, 255, 255, 255);
}

// Encode as PNG
function createPNG(width, height, rgbaData) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: add filter byte (0 = None) before each row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    rgbaData.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  // CRC32
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return crc ^ 0xFFFFFFFF;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const png = createPNG(SIZE, SIZE, pixels);
const outputPath = path.join(__dirname, '../assets/icon.png');
fs.writeFileSync(outputPath, png);
console.log(`Icon generated: ${outputPath} (${png.length} bytes)`);
