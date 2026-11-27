// SPDX-License-Identifier: MIT
// Dependency-free, streaming ZIP reader that works on any Blob (browser File or Node Blob).
// Only the central directory and the entries we actually need are read, so multi-GB IPAs
// are analysed without loading the whole file into memory.

const SIG_EOCD = 0x06054b50;
const SIG_Z64_LOC = 0x07064b50;
const SIG_Z64_EOCD = 0x06064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

export class ZipError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZipError';
  }
}

async function readBytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

const utf8 = new TextDecoder('utf-8');

export async function openZip(blob) {
  const size = blob.size;
  if (size < 22) throw new ZipError('File is too small to be an APK, AAB or IPA archive.');
  const tailLen = Math.min(size, 65557 + 20);
  const tailStart = size - tailLen;
  const tail = await readBytes(blob, tailStart, size);
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('Not a valid APK/AAB/IPA: the ZIP end-of-central-directory record was not found.');

  let total = dv.getUint16(eocd + 10, true);
  let cdSize = dv.getUint32(eocd + 12, true);
  let cdOffset = dv.getUint32(eocd + 16, true);
  let zip64 = false;

  if (eocd >= 20 && dv.getUint32(eocd - 20, true) === SIG_Z64_LOC) {
    const z64Off = Number(dv.getBigUint64(eocd - 20 + 8, true));
    const z = await readBytes(blob, z64Off, z64Off + 56);
    const zd = new DataView(z.buffer, z.byteOffset, z.byteLength);
    if (zd.getUint32(0, true) === SIG_Z64_EOCD) {
      total = Number(zd.getBigUint64(32, true));
      cdSize = Number(zd.getBigUint64(40, true));
      cdOffset = Number(zd.getBigUint64(48, true));
      zip64 = true;
    }
  }
  if (cdOffset + cdSize > size) throw new ZipError('Archive is truncated or corrupt (central directory out of range).');

  const cd = await readBytes(blob, cdOffset, cdOffset + cdSize);
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries = [];
  let p = 0;
  for (let n = 0; n < total && p + 46 <= cd.length; n++) {
    if (cv.getUint32(p, true) !== SIG_CEN) throw new ZipError('Corrupt central directory.');
    const flags = cv.getUint16(p + 8, true);
    const method = cv.getUint16(p + 10, true);
    const crc = cv.getUint32(p + 16, true);
    let compressedSize = cv.getUint32(p + 20, true);
    let uncompressedSize = cv.getUint32(p + 24, true);
    const nlen = cv.getUint16(p + 28, true);
    const xlen = cv.getUint16(p + 30, true);
    const clen = cv.getUint16(p + 32, true);
    let localHeaderOffset = cv.getUint32(p + 42, true);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nlen));
    let x = p + 46 + nlen;
    const xend = x + xlen;
    while (x + 4 <= xend) {
      const id = cv.getUint16(x, true);
      const sz = cv.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        if (uncompressedSize === 0xffffffff) { uncompressedSize = Number(cv.getBigUint64(q, true)); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = Number(cv.getBigUint64(q, true)); q += 8; }
        if (localHeaderOffset === 0xffffffff) { localHeaderOffset = Number(cv.getBigUint64(q, true)); q += 8; }
      }
      x += 4 + sz;
    }
    entries.push({
      name,
      method,
      flags,
      crc,
      compressedSize,
      size: uncompressedSize,
      localHeaderOffset,
      encrypted: (flags & 1) === 1,
      isDirectory: name.endsWith('/'),
    });
    p += 46 + nlen + xlen + clen;
  }
  return new ZipArchive(blob, entries, { cdOffset, cdSize, zip64, size });
}

export class ZipArchive {
  constructor(blob, entries, meta) {
    this.blob = blob;
    this.entries = entries;
    this.meta = meta;
    this.byName = new Map(entries.map((e) => [e.name, e]));
    this._dataOffsets = new Map();
  }

  get(name) { return this.byName.get(name) || null; }
  has(name) { return this.byName.has(name); }
  files() { return this.entries.filter((e) => !e.isDirectory); }
  filter(re) { return this.files().filter((e) => re.test(e.name)); }

  async dataOffset(entry) {
    if (this._dataOffsets.has(entry.name)) return this._dataOffsets.get(entry.name);
    const h = await readBytes(this.blob, entry.localHeaderOffset, entry.localHeaderOffset + 30);
    const hv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    if (hv.getUint32(0, true) !== SIG_LOC) throw new ZipError(`Corrupt local header for ${entry.name}`);
    const off = entry.localHeaderOffset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    this._dataOffsets.set(entry.name, off);
    return off;
  }

  /** Stream the decompressed bytes of an entry. onChunk(chunk, offset) may return false to stop. */
  async stream(entry, onChunk, { maxBytes = Infinity } = {}) {
    if (entry.encrypted) throw new ZipError(`${entry.name} is encrypted and cannot be read.`);
    const start = await this.dataOffset(entry);
    let s = this.blob.slice(start, start + entry.compressedSize).stream();
    if (entry.method === 8) s = s.pipeThrough(new DecompressionStream('deflate-raw'));
    else if (entry.method !== 0) throw new ZipError(`Unsupported compression method ${entry.method} for ${entry.name}`);
    const reader = s.getReader();
    let got = 0;
    try {
      while (got < maxBytes) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = got + value.length > maxBytes ? value.subarray(0, maxBytes - got) : value;
        const off = got;
        got += chunk.length;
        if ((await onChunk(chunk, off)) === false) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return got;
  }

  async read(entry, opts = {}) {
    if (typeof entry === 'string') entry = this.get(entry);
    if (!entry) return null;
    const parts = [];
    let total = 0;
    await this.stream(entry, (c) => { parts.push(c.slice()); total += c.length; }, opts);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of parts) { out.set(c, o); o += c.length; }
    return out;
  }

  async readText(entry, opts) {
    const b = await this.read(entry, opts);
    return b ? utf8.decode(b) : null;
  }

  /** Raw (still compressed) bytes from the archive itself, e.g. the APK Signing Block. */
  readRaw(start, end) { return readBytes(this.blob, start, end); }
}
