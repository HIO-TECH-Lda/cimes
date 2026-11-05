import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/lib/sha256";

describe("sha256Hex (browser, síncrono)", () => {
  const casos = [
    "",
    "abc",
    "olá mundo em pt-MZ ünïcode",
    "expiry:1793865515620?r=c25066745a1ab00012345",
    "x".repeat(1000),
    "a".repeat(63),
    "b".repeat(64),
    "c".repeat(65),
  ];

  it.each(casos)("coincide com o node:crypto para %s", (mensagem) => {
    expect(sha256Hex(mensagem)).toBe(createHash("sha256").update(mensagem).digest("hex"));
  });

  it("não modifica a mensagem nem usa estado partilhado", () => {
    const primeiro = sha256Hex("cimes");
    expect(sha256Hex("cimes")).toBe(primeiro);
    expect(sha256Hex("cimes2")).not.toBe(primeiro);
  });
});