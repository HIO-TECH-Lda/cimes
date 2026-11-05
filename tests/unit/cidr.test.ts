import { describe, expect, it } from "vitest";

import { ipInAnyCidr, ipInCidr, parseCidr, parseIpv4 } from "@/lib/cidr";

describe("correspondência de CIDR (G.12)", () => {
  it("analisa endereços e redes IPv4", () => {
    expect(parseIpv4("10.1.2.3")).not.toBeNull();
    expect(parseIpv4("256.1.1.1")).toBeNull();
    expect(parseIpv4("10.0.0.1.2")).toBeNull();
    const c = parseCidr("10.0.0.0/8");
    expect(c?.network).toBe(0x0a000000);
  });

  it("determina se um IP está numa rede", () => {
    const net = parseCidr("172.16.0.0/12");
    expect(ipInCidr("172.16.5.5", net!)).toBe(true);
    expect(ipInCidr("172.32.0.1", net!)).toBe(false);
  });

  it("aceita /32 e redes inteiras", () => {
    expect(ipInCidr("192.168.0.9", parseCidr("192.168.0.9/32")!)).toBe(true);
    expect(ipInCidr("8.8.8.8", parseCidr("0.0.0.0/0")!)).toBe(true);
  });

  it("verifica contra listas com valores por omissão (RNF-02/G.11)", () => {
    const defaults = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
    expect(ipInAnyCidr("127.0.0.1", defaults)).toBe(false);
    expect(ipInAnyCidr("192.168.10.4", defaults)).toBe(true);
    expect(ipInAnyCidr("203.0.113.7", defaults)).toBe(false);
    expect(ipInAnyCidr("xpto", defaults)).toBe(false);
  });
});