import { describe, expect, it } from "vitest";

import { parseBootId } from "../../src/parsers/bootId";

const CANONICAL = "ddedc358-8083-492d-bf01-483937b16622";
const COMPACT = "ddedc3588083492dbf01483937b16622";

describe("parseBootId", () => {
    it("normalizes a canonical UUID with a trailing newline", () => {
        expect(parseBootId(CANONICAL + "\n")).toBe(COMPACT);
    });

    it("normalizes a canonical UUID without a newline", () => {
        expect(parseBootId(CANONICAL)).toBe(COMPACT);
    });

    it("normalizes compact 32-hex", () => {
        expect(parseBootId(COMPACT)).toBe(COMPACT);
    });

    it("normalizes uppercase hexadecimal", () => {
        expect(parseBootId("DDEDC3588083492DBF01483937B16622")).toBe(COMPACT);
        expect(parseBootId("DDEDC358-8083-492D-BF01-483937B16622")).toBe(COMPACT);
    });

    it("treats canonical and compact forms as the same boot", () => {
        expect(parseBootId(CANONICAL)).toBe(parseBootId(COMPACT));
    });

    it("rejects malformed values", () => {
        expect(() => parseBootId("not-a-boot-id")).toThrow(/boot ID/);
        expect(() => parseBootId("ddedc3588083492d")).toThrow(/boot ID/);
        expect(() => parseBootId(COMPACT + "aa")).toThrow(/boot ID/);
        expect(() => parseBootId("ddedc3588083492dbf01483937b1662g")).toThrow(/boot ID/);
        expect(() => parseBootId("")).toThrow(/boot ID/);
        expect(() => parseBootId("   \n")).toThrow(/boot ID/);
        expect(() => parseBootId("prefix " + CANONICAL)).toThrow(/boot ID/);
        expect(() => parseBootId("dded-c3588083492dbf01483937b16622")).toThrow(/boot ID/);
    });
});
