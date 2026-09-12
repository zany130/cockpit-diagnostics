import { describe, expect, it } from "vitest";

import { parseBlame } from "../../src/parsers/blame";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";

describe("parseBlame", () => {
    it("parses ordinary blame lines", () => {
        const rows = parseBlame(fixture("blame-normal.txt"));
        expect(rows).toEqual([
            { unit: "NetworkManager.service", durationUs: 4_123_000 },
            { unit: "firewalld.service", durationUs: 1_234_000 },
            { unit: "systemd-udev-settle.service", durationUs: 892_000 },
            { unit: "systemd-udevd.service", durationUs: 12_000 },
        ]);
    });

    it("parses minute-scale activation times", () => {
        const rows = parseBlame(fixture("blame-minutes.txt"));
        expect(rows[0]).toEqual({ unit: "slow-app.service", durationUs: 72_345_000 });
    });

    it("skips junk lines in partial output", () => {
        const rows = parseBlame(fixture("blame-partial.txt"));
        expect(rows.map(row => row.unit)).toEqual([
            "NetworkManager.service",
            "systemd-udev-settle.service",
        ]);
    });

    it("returns an empty list for empty output", () => {
        expect(parseBlame("")).toEqual([]);
        expect(parseBlame("\n\n")).toEqual([]);
    });

    it("throws when every line is malformed", () => {
        expect(() => parseBlame(fixture("blame-malformed.txt"))).toThrow(ProviderError);
    });
});
