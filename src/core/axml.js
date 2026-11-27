// SPDX-License-Identifier: MIT
// Android binary XML (AXML) parser + a small encoder (used for tests and the built-in sample APK).
// Output tree: { tag, attrs: {name: value}, children: [] }

const RES_STRING_POOL = 0x0001;
const RES_XML = 0x0003;
const RES_XML_START_NS = 0x0100;
const RES_XML_END_NS = 0x0101;
const RES_XML_START_ELEMENT = 0x0102;
const RES_XML_END_ELEMENT = 0x0103;
const RES_XML_RESOURCE_MAP = 0x0180;

// Fallback when attribute names were stripped by packers/obfuscators.
export const ANDROID_ATTR_IDS = {
  0x01010001: 'label',
  0x01010002: 'icon',
  0x01010003: 'name',
  0x01010006: 'permission',
  0x0101000f: 'debuggable',
  0x01010010: 'exported',
  0x0101020c: 'minSdkVersion',
  0x0101021b: 'versionCode',
  0x0101021c: 'versionName',
  0x01010270: 'targetSdkVersion',
  0x01010272: 'testOnly',
  0x01010280: 'allowBackup',
  0x010104ea: 'extractNativeLibs',
  0x010104ec: 'usesCleartextTraffic',
  0x01010527: 'networkSecurityConfig',
};
const ATTR_NAME_TO_ID = Object.fromEntries(Object.entries(ANDROID_ATTR_IDS).map(([k, v]) => [v, Number(k)]));

function parseStringPool(dv, buf, p) {
  const count = dv.getUint32(p + 8, true);
  const flags = dv.getUint32(p + 16, true);
  const stringsStart = dv.getUint32(p + 20, true);
  const hsize = dv.getUint16(p + 2, true);
  const isUtf8 = (flags & 0x100) !== 0;
  const out = new Array(count);
  const base = p + stringsStart;
  const td8 = new TextDecoder('utf-8');
  const td16 = new TextDecoder('utf-16le');
  for (let i = 0; i < count; i++) {
    let o = base + dv.getUint32(p + hsize + i * 4, true);
    try {
      if (isUtf8) {
        let n = buf[o++];
        if (n & 0x80) o++; // char length (2 bytes)
        let len = buf[o++];
        if (len & 0x80) len = ((len & 0x7f) << 8) | buf[o++];
        out[i] = td8.decode(buf.subarray(o, o + len));
      } else {
        let len = dv.getUint16(o, true); o += 2;
        if (len & 0x8000) { len = ((len & 0x7fff) << 16) | dv.getUint16(o, true); o += 2; }
        out[i] = td16.decode(buf.subarray(o, o + len * 2));
      }
    } catch {
      out[i] = '';
    }
  }
  return out;
}

function typedValue(dataType, data, strings) {
  switch (dataType) {
    case 0x03: return strings[data] ?? '';
    case 0x10: return data | 0;
    case 0x11: return data >>> 0;
    case 0x12: return data !== 0;
    case 0x01: return `@0x${(data >>> 0).toString(16).padStart(8, '0')}`;
    case 0x02: return `?0x${(data >>> 0).toString(16).padStart(8, '0')}`;
    case 0x04: { const f = new DataView(new ArrayBuffer(4)); f.setUint32(0, data); return f.getFloat32(0); }
    default: return data >>> 0;
  }
}

export function isAxml(buf) {
  return buf && buf.length >= 8 && buf[0] === 0x03 && buf[1] === 0x00;
}

export function parseAxml(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint16(0, true) !== RES_XML) throw new Error('Not an Android binary XML file');
  let strings = [];
  const resIds = [];
  const root = { tag: '#document', attrs: {}, children: [] };
  const stack = [root];
  let p = dv.getUint16(2, true);
  const end = Math.min(dv.getUint32(4, true), buf.length);
  while (p + 8 <= end) {
    const type = dv.getUint16(p, true);
    const hsize = dv.getUint16(p + 2, true);
    const csize = dv.getUint32(p + 4, true);
    if (csize < 8 || p + csize > end) break;
    if (type === RES_STRING_POOL) {
      strings = parseStringPool(dv, buf, p);
    } else if (type === RES_XML_RESOURCE_MAP) {
      for (let i = p + hsize; i + 4 <= p + csize; i += 4) resIds.push(dv.getUint32(i, true));
    } else if (type === RES_XML_START_ELEMENT) {
      const ext = p + hsize;
      const nameIdx = dv.getUint32(ext + 4, true);
      const attrStart = dv.getUint16(ext + 8, true);
      const attrSize = dv.getUint16(ext + 10, true) || 20;
      const attrCount = dv.getUint16(ext + 12, true);
      const node = { tag: strings[nameIdx] ?? '', attrs: {}, children: [] };
      for (let i = 0; i < attrCount; i++) {
        const a = ext + attrStart + i * attrSize;
        const an = dv.getUint32(a + 4, true);
        const raw = dv.getUint32(a + 8, true);
        const dataType = buf[a + 15];
        const data = dv.getUint32(a + 16, true);
        let name = strings[an] || '';
        if ((!name || /^[^a-zA-Z]/.test(name)) && resIds[an] !== undefined) name = ANDROID_ATTR_IDS[resIds[an]] || name;
        if (resIds[an] !== undefined && ANDROID_ATTR_IDS[resIds[an]]) name = ANDROID_ATTR_IDS[resIds[an]];
        const value = raw !== 0xffffffff && dataType === 0x03 ? strings[raw] : typedValue(dataType, data, strings);
        node.attrs[name] = value;
      }
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (type === RES_XML_END_ELEMENT) {
      if (stack.length > 1) stack.pop();
    } else if (type === RES_XML_START_NS || type === RES_XML_END_NS) {
      // namespaces are not needed for analysis
    }
    p += csize;
  }
  return root.children[0] || root;
}

// ---------- encoder (test & sample use) ----------
/**
 * Encode a tree {tag, attrs, children} as AXML. Attribute values: string | number | boolean.
 * Android attributes are emitted with the android namespace and a resource id when known.
 */
export function encodeAxml(tree) {
  const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
  const strings = [];
  const index = new Map();
  const intern = (s) => { if (!index.has(s)) { index.set(s, strings.length); strings.push(s); } return index.get(s); };
  // Resource-id mapped attribute names must come first in the pool.
  const attrNames = new Set();
  (function walk(n) { Object.keys(n.attrs || {}).forEach((k) => attrNames.add(k)); (n.children || []).forEach(walk); })(tree);
  const mapped = [...attrNames].filter((k) => ATTR_NAME_TO_ID[k]);
  mapped.forEach(intern);
  const prefixIdx = intern('android');
  const nsIdx = intern(ANDROID_NS);

  const chunks = [];
  const elements = [];
  (function walk(n) {
    const tagIdx = intern(n.tag);
    const attrs = Object.entries(n.attrs || {}).map(([k, v]) => {
      const nameIdx = intern(k);
      let raw = 0xffffffff, type, data;
      if (typeof v === 'boolean') { type = 0x12; data = v ? 0xffffffff : 0; }
      else if (typeof v === 'number') { type = 0x10; data = v >>> 0; }
      else { raw = intern(String(v)); type = 0x03; data = raw; }
      return { ns: ATTR_NAME_TO_ID[k] || k.startsWith('android:') ? nsIdx : 0xffffffff, nameIdx, raw, type, data };
    });
    elements.push({ kind: 'start', tagIdx, attrs });
    (n.children || []).forEach(walk);
    elements.push({ kind: 'end', tagIdx });
  })(tree);

  // string pool (UTF-16)
  const strData = [];
  const offsets = [];
  let so = 0;
  for (const s of strings) {
    offsets.push(so);
    const b = new Uint8Array(2 + s.length * 2 + 2);
    const v = new DataView(b.buffer);
    v.setUint16(0, s.length, true);
    for (let i = 0; i < s.length; i++) v.setUint16(2 + i * 2, s.charCodeAt(i), true);
    strData.push(b);
    so += b.length;
  }
  const pad = (4 - (so % 4)) % 4;
  const spHeader = 28;
  const spSize = spHeader + strings.length * 4 + so + pad;
  const sp = new Uint8Array(spSize);
  const spv = new DataView(sp.buffer);
  spv.setUint16(0, RES_STRING_POOL, true);
  spv.setUint16(2, spHeader, true);
  spv.setUint32(4, spSize, true);
  spv.setUint32(8, strings.length, true);
  spv.setUint32(20, spHeader + strings.length * 4, true);
  offsets.forEach((o, i) => spv.setUint32(spHeader + i * 4, o, true));
  let w = spHeader + strings.length * 4;
  strData.forEach((b) => { sp.set(b, w); w += b.length; });
  chunks.push(sp);

  const rm = new Uint8Array(8 + mapped.length * 4);
  const rmv = new DataView(rm.buffer);
  rmv.setUint16(0, RES_XML_RESOURCE_MAP, true);
  rmv.setUint16(2, 8, true);
  rmv.setUint32(4, rm.length, true);
  mapped.forEach((k, i) => rmv.setUint32(8 + i * 4, ATTR_NAME_TO_ID[k], true));
  chunks.push(rm);

  const nsChunk = (type) => {
    const b = new Uint8Array(24);
    const v = new DataView(b.buffer);
    v.setUint16(0, type, true); v.setUint16(2, 16, true); v.setUint32(4, 24, true);
    v.setUint32(8, 1, true); v.setUint32(12, 0xffffffff, true);
    v.setUint32(16, prefixIdx, true); v.setUint32(20, nsIdx, true);
    return b;
  };
  chunks.push(nsChunk(RES_XML_START_NS));
  for (const el of elements) {
    if (el.kind === 'start') {
      const size = 16 + 20 + el.attrs.length * 20;
      const b = new Uint8Array(size);
      const v = new DataView(b.buffer);
      v.setUint16(0, RES_XML_START_ELEMENT, true); v.setUint16(2, 16, true); v.setUint32(4, size, true);
      v.setUint32(8, 1, true); v.setUint32(12, 0xffffffff, true);
      v.setUint32(16, 0xffffffff, true); v.setUint32(20, el.tagIdx, true);
      v.setUint16(24, 20, true); v.setUint16(26, 20, true); v.setUint16(28, el.attrs.length, true);
      el.attrs.forEach((a, i) => {
        const o = 36 + i * 20;
        v.setUint32(o, a.ns, true); v.setUint32(o + 4, a.nameIdx, true); v.setUint32(o + 8, a.raw, true);
        v.setUint16(o + 12, 8, true); b[o + 15] = a.type; v.setUint32(o + 16, a.data, true);
      });
      chunks.push(b);
    } else {
      const b = new Uint8Array(24);
      const v = new DataView(b.buffer);
      v.setUint16(0, RES_XML_END_ELEMENT, true); v.setUint16(2, 16, true); v.setUint32(4, 24, true);
      v.setUint32(8, 1, true); v.setUint32(12, 0xffffffff, true);
      v.setUint32(16, 0xffffffff, true); v.setUint32(20, el.tagIdx, true);
      chunks.push(b);
    }
  }
  chunks.push(nsChunk(RES_XML_END_NS));
  const body = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(8 + body);
  const ov = new DataView(out.buffer);
  ov.setUint16(0, RES_XML, true); ov.setUint16(2, 8, true); ov.setUint32(4, out.length, true);
  let o = 8;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
