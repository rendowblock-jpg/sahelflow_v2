// The relay's check of the optional `desktopKeyProof` field: format only (the
// relay cannot be trusted to judge the signature, the phone does that).
import { describe, expect, it } from "vitest";
import { MAX_KEY_PROOF_CHARS, parseDesktopKeyProofField } from "../key-proof";

const SIG = `${"A".repeat(86)}==`;
const CTX = "sahelflow.pairing.rsa-key.v1";
const GOOD = `${SIG}.${CTX}`;

describe("parseDesktopKeyProofField: accepted", () => {
  const accepted: Array<[string, unknown, string | null]> = [
    ["absent (an old desktop)", undefined, null],
    ["explicit null", null, null],
    ["standard base64 signature with padding", GOOD, GOOD],
    ["base64url signature without padding", `${"Ab-_".repeat(21)}Ab.${CTX}`, `${"Ab-_".repeat(21)}Ab.${CTX}`],
    ["one padding character", `${"B".repeat(87)}=.${CTX}`, `${"B".repeat(87)}=.${CTX}`],
    ["plus and slash", `${"+/".repeat(43)}.${CTX}`, `${"+/".repeat(43)}.${CTX}`],
    ["context with dots, dashes and underscores", `${SIG}.a-b_c.d`, `${SIG}.a-b_c.d`],
    ["exactly 512 characters", `${"A".repeat(431)}.${"c".repeat(80)}`, `${"A".repeat(431)}.${"c".repeat(80)}`],
  ];
  it.each(accepted)("%s", (_name, value, proof) => {
    expect(parseDesktopKeyProofField(value)).toEqual({ ok: true, proof });
  });
  it("the limit is 512", () => expect(MAX_KEY_PROOF_CHARS).toBe(512));
});

describe("parseDesktopKeyProofField: refused", () => {
  const refused: Array<[string, unknown]> = [
    ["empty string", ""],
    ["a number", 123],
    ["an object", { sig: SIG }],
    ["an array", [GOOD]],
    ["true", true],
    ["513 characters", `${"A".repeat(432)}.${"c".repeat(80)}`],
    ["a very long string", "A".repeat(100_000)],
    ["a space", `${SIG} .${CTX}`],
    ["a newline at the end", `${GOOD}\n`],
    ["a newline in the middle", `${"A".repeat(40)}\n${"A".repeat(46)}==.${CTX}`],
    ["a NUL character", `${SIG}.${CTX}\u0000`],
    ["an Arabic-Indic digit", `${"A".repeat(85)}\u0663==.${CTX}`],
    ["a quote", `${SIG}.${CTX}"`],
    ["markup", `<script>${"A".repeat(80)}.${CTX}`],
    ["no separator", SIG],
    ["empty context", `${SIG}.`],
    ["context starting with a dot", `${SIG}..a`],
    ["context of 81 characters", `${SIG}.${"c".repeat(81)}`],
    ["a signature of 15 characters", `${"A".repeat(15)}.${CTX}`],
    ["a signature of 501 characters", `${"A".repeat(501)}.c`],
    ["padding in the middle", `${"A".repeat(40)}=${"A".repeat(45)}.${CTX}`],
    ["three padding characters", `${"A".repeat(85)}===.${CTX}`],
    ["a dot inside the signature part and a bad context", `${"A".repeat(40)}.${"A".repeat(46)}.!`],
    ["a space in the context", `${SIG}.sahelflow pairing`],
  ];
  it.each(refused)("%s", (_name, value) => {
    expect(parseDesktopKeyProofField(value)).toEqual({ ok: false });
  });
});
