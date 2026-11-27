// SPDX-License-Identifier: MIT
// ELF (Android .so) and Mach-O (iOS binaries) header inspection.

export const ELF_MACHINES = { 3: 'x86', 40: 'arm', 62: 'x86_64', 183: 'arm64' };

/** Returns {bits, machine, minLoadAlign, loadSegments} or null if not ELF / headers out of range. */
export function inspectElf(b) {
  if (!b || b.length < 64 || b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46) return null;
  const is64 = b[4] === 2;
  const le = b[5] === 1;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const machine = dv.getUint16(18, le);
  const phoff = is64 ? Number(dv.getBigUint64(32, le)) : dv.getUint32(28, le);
  const phentsize = dv.getUint16(is64 ? 54 : 42, le);
  const phnum = dv.getUint16(is64 ? 56 : 44, le);
  const needed = phoff + phentsize * phnum;
  if (needed > b.length) return { bits: is64 ? 64 : 32, machine: ELF_MACHINES[machine] || String(machine), needBytes: needed };
  let minAlign = Infinity;
  let loads = 0;
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    if (dv.getUint32(o, le) !== 1) continue; // PT_LOAD
    loads++;
    const align = is64 ? Number(dv.getBigUint64(o + 48, le)) : dv.getUint32(o + 28, le);
    minAlign = Math.min(minAlign, align);
  }
  return { bits: is64 ? 64 : 32, machine: ELF_MACHINES[machine] || String(machine), minLoadAlign: loads ? minAlign : null, loadSegments: loads };
}

// ---------- Mach-O ----------
export const CPU = { 0x0100000c: 'arm64', 0x01000007: 'x86_64', 0x0000000c: 'armv7', 0x00000007: 'i386', 0x0200000c: 'arm64_32' };
export const PLATFORMS = { 1: 'macOS', 2: 'iOS', 3: 'tvOS', 4: 'watchOS', 6: 'Mac Catalyst', 7: 'iOS Simulator', 8: 'tvOS Simulator', 9: 'watchOS Simulator', 11: 'visionOS', 12: 'visionOS Simulator' };
const ver = (v) => `${v >>> 16}.${(v >> 8) & 0xff}${v & 0xff ? '.' + (v & 0xff) : ''}`;

/** Read fat header → [{cpu, offset, size}] or null when thin. */
export function machoSlices(b) {
  if (b.length < 8) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = dv.getUint32(0, false);
  if (magic !== 0xcafebabe && magic !== 0xcafebabf) return null;
  const n = dv.getUint32(4, false);
  if (n > 20) return null; // Java class files share 0xCAFEBABE; they have huge "counts"
  const is64 = magic === 0xcafebabf;
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = 8 + i * (is64 ? 32 : 20);
    if (o + 20 > b.length) break;
    const cpu = dv.getUint32(o, false);
    const offset = is64 ? Number(dv.getBigUint64(o + 8, false)) : dv.getUint32(o + 8, false);
    const size = is64 ? Number(dv.getBigUint64(o + 16, false)) : dv.getUint32(o + 12, false);
    out.push({ cpu: CPU[cpu] || `0x${cpu.toString(16)}`, offset, size });
  }
  return out;
}

/** Inspect a thin Mach-O header (bytes start at the slice). */
export function inspectMacho(b) {
  if (b.length < 32) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = dv.getUint32(0, true);
  const is64 = magic === 0xfeedfacf;
  if (!is64 && magic !== 0xfeedface) return null;
  const cpu = dv.getUint32(4, true);
  const filetype = dv.getUint32(12, true);
  const ncmds = dv.getUint32(16, true);
  const flags = dv.getUint32(24, true);
  const info = { cpu: CPU[cpu] || `0x${cpu.toString(16)}`, filetype, pie: (flags & 0x200000) !== 0, platform: null, minos: null, sdk: null, encrypted: null, dylibs: [] };
  let p = is64 ? 32 : 28;
  for (let i = 0; i < ncmds && p + 8 <= b.length; i++) {
    const cmd = dv.getUint32(p, true);
    const size = dv.getUint32(p + 4, true);
    if (size < 8) break;
    if (cmd === 0x32 && p + 20 <= b.length) { // LC_BUILD_VERSION
      info.platform = PLATFORMS[dv.getUint32(p + 8, true)] || String(dv.getUint32(p + 8, true));
      info.minos = ver(dv.getUint32(p + 12, true));
      info.sdk = ver(dv.getUint32(p + 16, true));
    } else if (cmd === 0x25 && p + 16 <= b.length) { // LC_VERSION_MIN_IPHONEOS
      info.platform = info.platform || 'iOS';
      info.minos = info.minos || ver(dv.getUint32(p + 8, true));
      info.sdk = info.sdk || ver(dv.getUint32(p + 12, true));
    } else if ((cmd === 0x2c || cmd === 0x21) && p + 20 <= b.length) { // LC_ENCRYPTION_INFO(_64)
      info.encrypted = dv.getUint32(p + 16, true) !== 0;
    } else if ((cmd === 0xc || cmd === 0x80000018 || cmd === 0x8000001f) && p + 12 <= b.length) { // LC_LOAD_DYLIB, WEAK, REEXPORT
      const nameOff = dv.getUint32(p + 8, true);
      const end = Math.min(p + size, b.length);
      let s = '';
      for (let j = p + nameOff; j < end && b[j]; j++) s += String.fromCharCode(b[j]);
      info.dylibs.push(s);
    }
    p += size;
  }
  return info;
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
