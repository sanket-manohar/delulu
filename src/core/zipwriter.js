// SPDX-License-Identifier: MIT
// Tiny ZIP writer (STORE method) used to export the docs pack and to build the in-browser samples.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

/**
 * @param {{name:string, data:Uint8Array|string, align?:number}[]} files
 * @param {{prefix?:Uint8Array}} [opts] optional bytes inserted before the central directory (e.g. an APK signing block)
 * @returns {Uint8Array}
 */
export function buildZip(files, opts = {}) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (b) => { chunks.push(b); offset += b.length; };

  for (const f of files) {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const name = enc.encode(f.name);
    const crc = crc32(data);
    let extraLen = 0;
    if (f.align) {
      const dataStart = offset + 30 + name.length;
      extraLen = (f.align - (dataStart % f.align)) % f.align;
    }
    const h = new Uint8Array(30 + name.length + extraLen);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);
    v.setUint16(8, 0, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    v.setUint16(28, extraLen, true);
    h.set(name, 30);
    const localOffset = offset;
    push(h);
    push(data);
    central.push({ name, crc, size: data.length, localOffset });
  }
  if (opts.prefix) push(opts.prefix);
  const cdStart = offset;
  for (const c of central) {
    const h = new Uint8Array(46 + c.name.length);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint32(16, c.crc, true);
    v.setUint32(20, c.size, true);
    v.setUint32(24, c.size, true);
    v.setUint16(28, c.name.length, true);
    v.setUint32(42, c.localOffset, true);
    h.set(c.name, 46);
    push(h);
  }
  const cdSize = offset - cdStart;
  const e = new Uint8Array(22);
  const ev = new DataView(e.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  push(e);

  const out = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
