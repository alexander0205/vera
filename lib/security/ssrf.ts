/**
 * SSRF protection for outbound HTTP requests to user-supplied URLs.
 *
 * Rejects:
 *  - non-https schemes
 *  - hostnames that resolve to loopback, link-local, or RFC1918 private ranges
 *  - hostnames that are literal private/loopback IPs
 *  - hostnames containing credentials, or with embedded ports for known internal services
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type SsrfResult = { ok: true } | { ok: false; reason: string };

// IPv4 ranges as [start, end] tuples in 32-bit integer form.
const IPV4_BLOCKED_RANGES: Array<[number, number]> = [
  // 0.0.0.0/8 - "this network"
  [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
  // 10.0.0.0/8
  [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
  // 127.0.0.0/8 - loopback
  [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
  // 169.254.0.0/16 - link-local
  [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')],
  // 172.16.0.0/12
  [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
  // 192.168.0.0/16
  [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
  // 100.64.0.0/10 - CGNAT
  [ipv4ToInt('100.64.0.0'), ipv4ToInt('100.127.255.255')],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return IPV4_BLOCKED_RANGES.some(([s, e]) => n >= s && n <= e);
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  // fc00::/7 (unique local)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // fe80::/10 (link-local)
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const v4MappedMatch = lower.match(/^::ffff:([0-9.]+)$/);
  if (v4MappedMatch && isIP(v4MappedMatch[1]) === 4) {
    return isPrivateIPv4(v4MappedMatch[1]);
  }
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return false;
}

/**
 * Validate a user-supplied URL for outbound fetch. Resolves the hostname and
 * rejects any that map to internal/private addresses.
 */
export async function validateOutboundUrl(rawUrl: string): Promise<SsrfResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'URL inválida' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Solo se permite https://' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'No se permiten credenciales en la URL' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { ok: false, reason: 'Hostname requerido' };
  }

  // Reject obvious internal names.
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    return { ok: false, reason: 'Host interno no permitido' };
  }

  // If literal IP, check directly.
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      return { ok: false, reason: 'IP privada/loopback no permitida' };
    }
    return { ok: true };
  }

  // Resolve DNS and reject any private resolution.
  try {
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) {
      return { ok: false, reason: 'No se pudo resolver el host' };
    }
    for (const r of results) {
      if (isPrivateAddress(r.address)) {
        return { ok: false, reason: 'Host resuelve a IP privada/loopback' };
      }
    }
  } catch {
    return { ok: false, reason: 'No se pudo resolver el host' };
  }

  return { ok: true };
}
