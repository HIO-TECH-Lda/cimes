/**
 * Correspondência de endereços IPv4 contra listas de CIDR (G.12,
 * INTERNAL_ALLOWED_CIDRS). IPv6 fica para quando o ICT definir a exposição real.
 */

export type Ipv4 = number; // inteiro de 32 bits, sem sinal

export function parseIpv4(ip: string): Ipv4 | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

export type Cidr = { network: Ipv4; bits: number };

export function parseCidr(cidr: string): Cidr | null {
  const [ip, bitsRaw = "32"] = cidr.trim().split("/");
  const parsed = parseIpv4(ip ?? "");
  const bits = Number(bitsRaw);
  if (parsed === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  return { network: maskTo(parsed, bits), bits };
}

function maskTo(ip: Ipv4, bits: number): Ipv4 {
  return bits === 0 ? 0 : (ip & (0xffffffff << (32 - bits))) >>> 0;
}

export function ipInCidr(ip: string, cidr: Cidr): boolean {
  const parsed = parseIpv4(ip);
  if (parsed === null) return false;
  return maskTo(parsed, cidr.bits) === cidr.network;
}

/** Devolve true se o IP estiver em alguma das redes da lista. */
export function ipInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  return cidrs.some((c) => {
    const parsed = parseCidr(c);
    return parsed !== null && ipInCidr(ip, parsed);
  });
}