// SPDX-License-Identifier: MIT
// Decoder for aapt2 protobuf XML (used by Android App Bundles: base/manifest/AndroidManifest.xml).
// Produces the same {tag, attrs, children} tree as the AXML parser.

function readVarint(buf, pos) {
  let result = 0n, shift = 0n, b;
  do {
    if (pos.i >= buf.length) throw new Error('Truncated varint');
    b = buf[pos.i++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
  } while (b & 0x80);
  return result;
}

/** Iterate over protobuf fields → [{field, wire, value}] where value is Uint8Array for wire 2, BigInt for 0. */
export function decodeFields(buf) {
  const pos = { i: 0 };
  const out = [];
  while (pos.i < buf.length) {
    const key = Number(readVarint(buf, pos));
    const field = key >>> 3, wire = key & 7;
    if (wire === 0) out.push({ field, wire, value: readVarint(buf, pos) });
    else if (wire === 2) {
      const len = Number(readVarint(buf, pos));
      out.push({ field, wire, value: buf.subarray(pos.i, pos.i + len) });
      pos.i += len;
    } else if (wire === 5) { out.push({ field, wire, value: buf.subarray(pos.i, pos.i + 4) }); pos.i += 4; }
    else if (wire === 1) { out.push({ field, wire, value: buf.subarray(pos.i, pos.i + 8) }); pos.i += 8; }
    else throw new Error(`Unsupported wire type ${wire}`);
  }
  return out;
}

const td = new TextDecoder();

function decodePrimitive(buf) {
  for (const f of decodeFields(buf)) {
    if (f.field === 6 && f.wire === 0) return Number(BigInt.asIntN(32, f.value));
    if (f.field === 7 && f.wire === 0) return Number(f.value);
    if (f.field === 8 && f.wire === 0) return f.value !== 0n;
  }
  return undefined;
}

function decodeAttribute(buf) {
  let name = '', value, compiled, resId;
  for (const f of decodeFields(buf)) {
    if (f.field === 2 && f.wire === 2) name = td.decode(f.value);
    else if (f.field === 3 && f.wire === 2) value = td.decode(f.value);
    else if (f.field === 5 && f.wire === 0) resId = Number(f.value);
    else if (f.field === 6 && f.wire === 2) {
      for (const g of decodeFields(f.value)) if (g.field === 7 && g.wire === 2) compiled = decodePrimitive(g.value);
    }
  }
  let v = compiled !== undefined ? compiled : value;
  if (typeof v === 'string') {
    if (v === 'true') v = true; else if (v === 'false') v = false;
    else if (/^-?\d+$/.test(v) && /(Sdk|Code)/.test(name)) v = Number(v);
  }
  return { name, value: v, resId };
}

function decodeElement(buf) {
  const node = { tag: '', attrs: {}, children: [] };
  for (const f of decodeFields(buf)) {
    if (f.field === 3 && f.wire === 2) node.tag = td.decode(f.value);
    else if (f.field === 4 && f.wire === 2) { const a = decodeAttribute(f.value); node.attrs[a.name] = a.value; }
    else if (f.field === 5 && f.wire === 2) { const c = decodeNode(f.value); if (c) node.children.push(c); }
  }
  return node;
}

function decodeNode(buf) {
  for (const f of decodeFields(buf)) if (f.field === 1 && f.wire === 2) return decodeElement(f.value);
  return null;
}

export function parseProtoXml(buf) {
  const n = decodeNode(buf);
  if (!n || !n.tag) throw new Error('Not an aapt2 protobuf XML document');
  return n;
}
