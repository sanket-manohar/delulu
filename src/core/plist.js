// SPDX-License-Identifier: MIT
// Property list parser: binary (bplist00) and XML. Also extracts the plist inside a .mobileprovision (CMS).

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

export function parsePlist(bytes) {
  if (!bytes || bytes.length < 8) throw new Error('Empty plist');
  if (latin1.decode(bytes.subarray(0, 8)) === 'bplist00') return parseBinaryPlist(bytes);
  return parseXmlPlist(utf8.decode(bytes));
}

// ---------- binary ----------
function parseBinaryPlist(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const t = b.length - 32;
  const offSize = b[t + 6];
  const refSize = b[t + 7];
  const numObjects = Number(dv.getBigUint64(t + 8));
  const top = Number(dv.getBigUint64(t + 16));
  const tableOff = Number(dv.getBigUint64(t + 24));
  const readN = (o, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[o + i]; return v; };
  const offsets = new Array(numObjects);
  for (let i = 0; i < numObjects; i++) offsets[i] = readN(tableOff + i * offSize, offSize);
  const seen = new Set();

  const readObj = (idx) => {
    if (seen.has(idx)) return null; // cycle guard
    const o = offsets[idx];
    const marker = b[o];
    const hi = marker >> 4, lo = marker & 0xf;
    const lenAt = () => {
      if (lo !== 0xf) return [lo, o + 1];
      const im = b[o + 1];
      const n = 1 << (im & 0xf);
      return [readN(o + 2, n), o + 2 + n];
    };
    switch (hi) {
      case 0x0: return lo === 0x8 ? false : lo === 0x9 ? true : null;
      case 0x1: {
        const n = 1 << lo;
        if (n === 8) return Number(dv.getBigInt64(o + 1));
        return readN(o + 1, n);
      }
      case 0x2: return lo === 2 ? dv.getFloat32(o + 1) : dv.getFloat64(o + 1);
      case 0x3: return new Date((dv.getFloat64(o + 1) + 978307200) * 1000);
      case 0x4: { const [len, s] = lenAt(); return b.slice(s, s + len); }
      case 0x5: { const [len, s] = lenAt(); return latin1.decode(b.subarray(s, s + len)); }
      case 0x6: {
        const [len, s] = lenAt();
        let str = '';
        for (let i = 0; i < len; i++) str += String.fromCharCode(dv.getUint16(s + i * 2));
        return str;
      }
      case 0x8: return { UID: readN(o + 1, lo + 1) };
      case 0xa: case 0xc: {
        const [len, s] = lenAt();
        seen.add(idx);
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(readObj(readN(s + i * refSize, refSize)));
        seen.delete(idx);
        return arr;
      }
      case 0xd: {
        const [len, s] = lenAt();
        seen.add(idx);
        const obj = {};
        for (let i = 0; i < len; i++) {
          const k = readObj(readN(s + i * refSize, refSize));
          obj[String(k)] = readObj(readN(s + (len + i) * refSize, refSize));
        }
        seen.delete(idx);
        return obj;
      }
      default: return null;
    }
  };
  return readObj(top);
}

// ---------- XML ----------
const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? m;
  });
}

export function parseXmlPlist(xml) {
  xml = xml.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) { if (m[5].trim() || tokens.length) tokens.push({ text: m[5] }); }
    else tokens.push({ close: !!m[1], tag: m[2], selfClose: !!m[4] });
  }
  let i = 0;
  const textUntil = (tag) => {
    let s = '';
    while (i < tokens.length && !(tokens[i].close && tokens[i].tag === tag)) { if (tokens[i].text !== undefined) s += tokens[i].text; i++; }
    i++; // skip close
    return decodeEntities(s);
  };
  const skipWs = () => { while (i < tokens.length && tokens[i].text !== undefined && !tokens[i].text.trim()) i++; };
  const parseValue = () => {
    skipWs();
    const t = tokens[i++];
    if (!t) return null;
    if (t.tag === 'plist') { const v = parseValue(); skipWs(); i++; return v; }
    if (t.selfClose) {
      if (t.tag === 'true') return true;
      if (t.tag === 'false') return false;
      if (t.tag === 'dict') return {};
      if (t.tag === 'array') return [];
      if (t.tag === 'string') return '';
      return null;
    }
    switch (t.tag) {
      case 'dict': {
        const o = {};
        for (;;) {
          skipWs();
          const k = tokens[i];
          if (!k || (k.close && k.tag === 'dict')) { i++; break; }
          i++;
          const key = k.selfClose ? '' : textUntil('key');
          o[key] = parseValue();
        }
        return o;
      }
      case 'array': {
        const a = [];
        for (;;) {
          skipWs();
          const k = tokens[i];
          if (!k || (k.close && k.tag === 'array')) { i++; break; }
          a.push(parseValue());
        }
        return a;
      }
      case 'string': return textUntil('string');
      case 'integer': return parseInt(textUntil('integer'), 10);
      case 'real': return parseFloat(textUntil('real'));
      case 'date': return new Date(textUntil('date').trim());
      case 'data': return textUntil('data').replace(/\s+/g, '');
      case 'true': textUntil('true'); return true;
      case 'false': textUntil('false'); return false;
      default: textUntil(t.tag); return null;
    }
  };
  return parseValue();
}

/** A .mobileprovision is a CMS-signed XML plist. We only need the embedded plist. */
export function parseMobileProvision(bytes) {
  const s = latin1.decode(bytes);
  const a = s.indexOf('<?xml');
  const b = s.indexOf('</plist>');
  if (a < 0 || b < 0) return null;
  return parseXmlPlist(utf8.decode(bytes.subarray(a, b + 8)));
}
