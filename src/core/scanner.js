// SPDX-License-Identifier: MIT
// Streaming content scanner: secrets, insecure URLs and code markers (APIs / SDK signatures).
// Works chunk by chunk with an overlap window so matches spanning chunk boundaries are not missed.

/**
 * Secret patterns. `severity` reflects how dangerous shipping the value inside a public binary is.
 * Client-side identifiers (Firebase web/API keys, publishable keys) are reported as "review" items.
 */
export const SECRET_PATTERNS = [
  { id: 'private-key', label: 'Private key (PEM)', severity: 'blocker', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'aws-access-key', label: 'AWS access key ID', severity: 'high', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'aws-secret', label: 'AWS secret access key (assignment)', severity: 'blocker', re: /aws_?secret_?access_?key["'\s:=]{1,6}[A-Za-z0-9/+]{40}/i },
  { id: 'stripe-secret', label: 'Stripe secret / restricted key', severity: 'blocker', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}/ },
  { id: 'razorpay-secret', label: 'Razorpay key secret (assignment)', severity: 'blocker', re: /razorpay[_-]?(?:key[_-]?)?secret["'\s:=]{1,6}[A-Za-z0-9]{20,}/i },
  { id: 'openai', label: 'OpenAI API key', severity: 'blocker', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}|\bsk-proj-[A-Za-z0-9_-]{40,}/ },
  { id: 'anthropic', label: 'Anthropic API key', severity: 'blocker', re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{40,}/ },
  { id: 'gemini-genai', label: 'Google AI / Gemini key used from client', severity: 'review', re: /generativelanguage\.googleapis\.com/ },
  { id: 'github-token', label: 'GitHub token', severity: 'blocker', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/ },
  { id: 'slack-token', label: 'Slack token', severity: 'blocker', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: 'slack-webhook', label: 'Slack webhook URL', severity: 'high', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/ },
  { id: 'discord-webhook', label: 'Discord webhook URL', severity: 'high', re: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{30,}/ },
  { id: 'sendgrid', label: 'SendGrid API key', severity: 'blocker', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { id: 'mailgun', label: 'Mailgun API key', severity: 'high', re: /\bkey-[0-9a-f]{32}\b/ },
  { id: 'twilio-key', label: 'Twilio API key SID', severity: 'high', re: /\bSK[0-9a-f]{32}\b/ },
  { id: 'google-oauth-secret', label: 'Google OAuth client secret', severity: 'high', re: /\bGOCSPX-[A-Za-z0-9_-]{28}\b/ },
  { id: 'gcp-service-account', label: 'Google service-account JSON', severity: 'blocker', re: /"type"\s*:\s*"service_account"/ },
  { id: 'firebase-server-key', label: 'Firebase legacy server key (FCM)', severity: 'blocker', re: /\bAAAA[A-Za-z0-9_-]{7}:APA91b[A-Za-z0-9_-]{100,}/ },
  { id: 'jwt', label: 'Hard-coded JWT', severity: 'medium', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'google-api-key', label: 'Google API key (restrict it)', severity: 'review', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'basic-auth-url', label: 'Credentials embedded in URL', severity: 'high', re: /\bhttps?:\/\/[A-Za-z0-9._%-]{2,}:[A-Za-z0-9._%-]{3,}@[A-Za-z0-9.-]+\.[a-z]{2,}/ },
];

const URL_RE = /\bhttp:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>\\\x00-\x1f]*)?/g;
const IGNORE_HTTP = /^http:\/\/(?:schemas\.android\.com|www\.w3\.org|ns\.adobe\.com|www\.apple\.com\/DTDs|purl\.org|xml\.org|xmlpull\.org|apache\.org|www\.apache\.org|json-schema\.org|localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0|schemas\.microsoft\.com|schemas\.xmlsoap\.org|www\.example\.com|example\.com|www\.slf4j\.org|java\.sun\.com|xml\.apache\.org|crl\.|ocsp\.|www\.google\.com\/schemas|ns\.|exslt\.org|www\.opengis\.net|iptc\.org|cipa\.jp|www\.unicode\.org)/i;

export function maskSecret(s) {
  if (s.length <= 12) return s.slice(0, 3) + '•••';
  return `${s.slice(0, 6)}•••••${s.slice(-4)}`;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export class ContentScanner {
  /** @param {{markers?: string[]}} opts markers are literal strings to detect (API names, SDK paths) */
  constructor({ markers = [] } = {}) {
    this.secrets = new Map(); // value -> {pattern, files:Set}
    this.http = new Map(); // host -> {count, sample, files:Set}
    this.found = new Set();
    this.markerRe = markers.length ? new RegExp([...new Set(markers)].sort((a, b) => b.length - a.length).map(escapeRe).join('|'), 'g') : null;
    this.secretRe = new RegExp(SECRET_PATTERNS.map((p, i) => `(?<p${i}>${p.re.source})`).join('|'), 'g' + (SECRET_PATTERNS.some((p) => p.re.flags.includes('i')) ? '' : ''));
    this.ciPatterns = SECRET_PATTERNS.map((p, i) => ({ ...p, i })).filter((p) => p.re.flags.includes('i'));
    this.decoder = new TextDecoder('latin1');
    this.bytesScanned = 0;
  }

  /** Scan a whole file by streaming. `file` is a label for evidence. */
  async scanEntry(zip, entry, { file = entry.name, maxBytes = 256 * 1024 * 1024, onProgress } = {}) {
    let carry = '';
    await zip.stream(entry, (chunk) => {
      const text = carry + this.decoder.decode(chunk);
      this.scanText(text, file);
      carry = text.slice(-512);
      this.bytesScanned += chunk.length;
      onProgress?.(chunk.length);
    }, { maxBytes });
  }

  /** Returns a function(chunk) that scans a stream of chunks for one file. */
  createFeeder(file) {
    let carry = '';
    return (chunk) => {
      const text = carry + this.decoder.decode(chunk);
      this.scanText(text, file);
      carry = text.slice(-512);
      this.bytesScanned += chunk.length;
    };
  }

  scanText(text, file) {
    this.secretRe.lastIndex = 0;
    let m;
    while ((m = this.secretRe.exec(text))) {
      const key = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
      if (!key) continue;
      const pattern = SECRET_PATTERNS[Number(key.slice(1))];
      this.addSecret(pattern, m[0], file);
    }
    for (const p of this.ciPatterns) {
      const re = new RegExp(p.re.source, 'gi');
      while ((m = re.exec(text))) this.addSecret(p, m[0], file);
    }
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text))) {
      const url = m[0];
      if (IGNORE_HTTP.test(url)) continue;
      const host = url.slice(7).split(/[/:?#]/)[0].toLowerCase();
      if (!/\.[a-z]{2,}$/.test(host) && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) continue;
      const rec = this.http.get(host) || { count: 0, sample: url.slice(0, 120), files: new Set() };
      rec.count++; rec.files.add(file);
      this.http.set(host, rec);
    }
    if (this.markerRe) {
      this.markerRe.lastIndex = 0;
      while ((m = this.markerRe.exec(text))) this.found.add(m[0]);
    }
  }

  addSecret(pattern, value, file) {
    const rec = this.secrets.get(value) || { pattern, value, files: new Set() };
    rec.files.add(file);
    this.secrets.set(value, rec);
  }

  has(marker) { return this.found.has(marker); }
  any(markers) { return markers.some((m) => this.found.has(m)); }

  secretList() {
    return [...this.secrets.values()].map((r) => ({ id: r.pattern.id, label: r.pattern.label, severity: r.pattern.severity, masked: maskSecret(r.value), files: [...r.files] }));
  }

  httpList() {
    return [...this.http.entries()].map(([host, r]) => ({ host, count: r.count, sample: r.sample, files: [...r.files] })).sort((a, b) => b.count - a.count);
  }
}
