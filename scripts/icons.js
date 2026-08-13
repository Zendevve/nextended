/* Generates solid-color PNG icons for the extension using only Node built-ins. */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const out = Buffer.concat([Buffer.alloc(4), typeBytes, data]);
  const len = out.subarray(0, 0); // placeholder
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const full = Buffer.concat([length, typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(full.subarray(4)), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function pngRGBA(width, data) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(width, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows = [];
  for (let y = 0; y < width; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    row.set(data.subarray(y * width * 4, (y + 1) * width * 4), 1);
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function solidFill(width, r, g, b, a = 255) {
  const px = Buffer.alloc(width * width * 4);
  for (let i = 0; i < width * width * 4; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  }
  return pngRGBA(width, px);
}

const SIZES = [16, 32, 48, 128];
const BLUE = [13, 112, 255];
for (const size of SIZES) {
  const png = solidFill(size, ...BLUE);
  writeFileSync(resolve(`assets/icon-${size}.png`), png);
  console.log(`[icon] wrote assets/icon-${size}.png`);
}
