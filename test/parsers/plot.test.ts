import { describe, expect, it } from "vitest";

import { parseBootPlotSvg } from "../../src/parsers/plot";
import { fixture } from "../readFixture";

describe("parseBootPlotSvg", () => {
    it("keeps systemd plot geometry and style", () => {
        const plot = parseBootPlotSvg(fixture("plot-normal.txt"));
        expect(plot.width).toBe(800);
        expect(plot.height).toBe(160);
        expect(plot.svg).toMatch(/<svg[\s>]/);
        expect(plot.svg).toContain("foo.service");
        expect(plot.svg).toContain("firmware");
        expect(plot.svg).toContain("rect.activating");
    });

    it("strips executable and remote SVG content", () => {
        const plot = parseBootPlotSvg(fixture("plot-unsafe.txt"));
        expect(plot.svg).not.toMatch(/<script/i);
        expect(plot.svg).not.toMatch(/onclick/i);
        expect(plot.svg).not.toMatch(/javascript:/i);
        expect(plot.svg).not.toMatch(/foreignObject/i);
        expect(plot.svg).not.toMatch(/<iframe/i);
        expect(plot.svg).not.toMatch(/<a[\s>]/i);
        expect(plot.svg).not.toMatch(/@import/i);
        expect(plot.svg).not.toMatch(/url\s*\(/i);
        expect(plot.svg).toContain("kernel");
        expect(plot.svg).toContain("<rect");
    });

    it("rejects empty output", () => {
        expect(() => parseBootPlotSvg("")).toThrow(/no SVG/);
        expect(() => parseBootPlotSvg("   ")).toThrow(/no SVG/);
    });

    it("rejects non-SVG output", () => {
        expect(() => parseBootPlotSvg(fixture("plot-invalid.txt"))).toThrow(/did not return SVG/);
    });

    it("rejects malformed SVG", () => {
        expect(() => parseBootPlotSvg(fixture("plot-malformed.txt"))).toThrow(/could not be parsed|did not return SVG|missing a root svg/);
    });

    it("rejects unusually large SVG", () => {
        const huge = `<svg xmlns="http://www.w3.org/2000/svg">${"a".repeat(8 * 1024 * 1024 + 1)}</svg>`;
        expect(() => parseBootPlotSvg(huge)).toThrow(/too large/);
    });
});
