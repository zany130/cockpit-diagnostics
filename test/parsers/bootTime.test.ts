import { describe, expect, it } from "vitest";

import { parseBootTime } from "../../src/parsers/bootTime";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";

describe("parseBootTime", () => {
    it("parses man-page style kernel/initrd/userspace output", () => {
        const summary = parseBootTime(fixture("boot-time-normal.txt"));
        expect(summary.kernelUs).toBe(2_584_000);
        expect(summary.initrdUs).toBe(19_176_000);
        expect(summary.userspaceUs).toBe(47_847_000);
        expect(summary.totalUs).toBe(69_608_000);
        expect(summary.target).toBe("multi-user.target");
        expect(summary.targetReachedUs).toBe(32_786_000);
        expect(summary.firmwareUs).toBeUndefined();
        expect(summary.loaderUs).toBeUndefined();
    });

    it("parses firmware and loader phases when present", () => {
        const summary = parseBootTime(fixture("boot-time-firmware.txt"));
        expect(summary.firmwareUs).toBe(123_000);
        expect(summary.loaderUs).toBe(456_000);
        expect(summary.target).toBe("graphical.target");
    });

    it("allows environments that omit initrd", () => {
        const summary = parseBootTime(fixture("boot-time-no-initrd.txt"));
        expect(summary.kernelUs).toBe(1_234_000);
        expect(summary.userspaceUs).toBe(2_345_000);
        expect(summary.initrdUs).toBeUndefined();
        expect(summary.target).toBeUndefined();
    });

    it("parses minute-scale userspace totals", () => {
        const summary = parseBootTime(fixture("boot-time-minutes.txt"));
        expect(summary.userspaceUs).toBe(194_222_000);
        expect(summary.totalUs).toBe(219_027_000);
    });

    it("keeps recognized phases from partial output", () => {
        const summary = parseBootTime(fixture("boot-time-partial.txt"));
        expect(summary.kernelUs).toBe(2_584_000);
        expect(summary.userspaceUs).toBe(47_847_000);
        expect(summary.initrdUs).toBeUndefined();
    });

    it("strips ANSI color codes from the startup line", () => {
        const summary = parseBootTime(fixture("boot-time-ansi.txt"));
        expect(summary.kernelUs).toBe(2_584_000);
        expect(summary.totalUs).toBe(69_608_000);
        expect(summary.target).toBe("multi-user.target");
    });

    it("throws on empty output", () => {
        expect(() => parseBootTime("")).toThrow(ProviderError);
        expect(() => parseBootTime("")).toThrow(/Startup finished/);
    });

    it("throws on malformed output", () => {
        expect(() => parseBootTime(fixture("boot-time-malformed.txt"))).toThrow(ProviderError);
    });
});
