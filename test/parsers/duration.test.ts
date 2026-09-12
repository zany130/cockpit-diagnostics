import { describe, expect, it } from "vitest";

import { formatDuration, parseTimespan } from "../../src/utils/duration";

describe("parseTimespan", () => {
    it("parses microseconds, milliseconds, seconds, and minutes", () => {
        expect(parseTimespan("12us")).toBe(12);
        expect(parseTimespan("892ms")).toBe(892_000);
        expect(parseTimespan("4.123s")).toBe(4_123_000);
        expect(parseTimespan("1min 9.608s")).toBe(69_608_000);
        expect(parseTimespan("3min 39.027s")).toBe(219_027_000);
        expect(parseTimespan("2h 3min 1s")).toBe(7_381_000_000);
    });

    it("rejects empty and malformed values", () => {
        expect(parseTimespan("")).toBeNull();
        expect(parseTimespan("slow")).toBeNull();
        expect(parseTimespan("4.123")).toBeNull();
        expect(parseTimespan("1min junk")).toBeNull();
    });
});

describe("formatDuration", () => {
    it("renders human-readable units without inventing precision", () => {
        expect(formatDuration(12)).toBe("12 µs");
        expect(formatDuration(892_000)).toBe("892 ms");
        expect(formatDuration(4_123_000)).toBe("4.123 s");
        expect(formatDuration(69_608_000)).toBe("1 min 9.608 s");
    });
});
