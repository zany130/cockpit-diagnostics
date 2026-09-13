import { describe, expect, it } from "vitest";

import { bootPlotImageSrc } from "../../src/utils/bootPlotImage";

const SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"20\"><rect x=\"1\" y=\"1\" width=\"10\" height=\"8\"/></svg>";

describe("bootPlotImageSrc", () => {
    it("produces a data URL that round-trips the sanitized SVG", () => {
        const src = bootPlotImageSrc(SVG);
        expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
        expect(src.startsWith("blob:")).toBe(false);
        const encoded = src.slice("data:image/svg+xml;charset=utf-8,".length);
        expect(decodeURIComponent(encoded)).toBe(SVG);
    });

    it("encodes characters that would break an unescaped data URL", () => {
        const withHash = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>#clip</text></svg>";
        const src = bootPlotImageSrc(withHash);
        expect(src).toContain("%23");
        expect(src).not.toMatch(/data:image\/svg\+xml;charset=utf-8,.*#/);
        expect(decodeURIComponent(src.slice("data:image/svg+xml;charset=utf-8,".length))).toBe(withHash);
    });
});
